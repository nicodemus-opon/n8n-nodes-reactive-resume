// Mocked unit tests: no API key or server required. Exercises URL building,
// parameter mapping, and validation by stubbing ctx.helpers.
// Run: node ./test/unit.js
const assert = require('assert');
const path = require('path');

const NODE = path.join(__dirname, '..', 'dist', 'nodes', 'ReactiveResume', 'ReactiveResume.node.js');
const GF = path.join(__dirname, '..', 'dist', 'nodes', 'ReactiveResume', 'GenericFunctions.js');

function loadNode() {
	delete require.cache[require.resolve(NODE)];
	return require(NODE).ReactiveResume;
}

function mockRun(NodeClass, { params, calls, httpImpl, binaryImpl, items }) {
	const node = new NodeClass();
	const ctx = {
		getInputData: () => items || [{ json: {} }],
		getNodeParameter: (name, _idx, fallback) => (name in params ? params[name] : fallback),
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: 'https://rxresu.me' }),
		getNode: () => ({ name: 'unit-test' }),
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (_cred, options) => {
				calls.push({ method: options.method, url: options.url, qs: options.qs, body: options.body });
				if (httpImpl) return httpImpl(options, calls.length);
				return { ok: true };
			},
			httpRequest: async (options) => {
				calls.push({ method: options.method, url: options.url });
				return { service: 'reactive-resume', status: 'healthy' };
			},
			prepareBinaryData: async (buffer, fileName, mimeType) => {
				if (binaryImpl) return binaryImpl(buffer, fileName, mimeType);
				return { fileName, mimeType, data: buffer.toString('base64').slice(0, 8) };
			},
		},
	};
	return node.execute.call(ctx);
}

(async () => {
	const gf = require(GF);

	// --- GenericFunctions ---
	assert.strictEqual(gf.normalizeBaseUrl('https://rxresu.me///'), 'https://rxresu.me');
	assert.strictEqual(
		gf.buildApiUrl('https://rxresu.me/', '/resumes'),
		'https://rxresu.me/api/openapi/resumes',
	);
	assert.strictEqual(
		gf.buildApiUrl('http://localhost:3000', 'flags'),
		'http://localhost:3000/api/openapi/flags',
	);
	assert.deepStrictEqual(gf.parseTagsParam('a, b,,c '), ['a', 'b', 'c']);
	assert.strictEqual(gf.parseTagsParam(''), undefined);
	assert.deepStrictEqual(gf.toItems([{ a: 1 }, { b: 2 }]).length, 2);
	assert.deepStrictEqual(gf.toItems('').length, 1); // empty -> success item
	console.log('PASS GenericFunctions helpers');

	// parseJsonParam rejects invalid JSON with a NodeOperationError
	try {
		gf.parseJsonParam('{nope', 'Patch Operations', { name: 't' });
		throw new Error('expected throw');
	} catch (e) {
		assert.ok(/valid JSON/.test(e.message), 'invalid JSON error message');
	}
	console.log('PASS parseJsonParam validation');

	const NodeClass = loadNode();

	// --- Resume list: query mapping ---
	{
		const calls = [];
		const [rows] = await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'list', sort: 'name', tags: 'eng, 2026' },
			calls,
			httpImpl: () => [{ id: 'r1' }],
		});
		assert.strictEqual(calls[0].url, 'https://rxresu.me/api/openapi/resumes');
		assert.deepStrictEqual(calls[0].qs, { sort: 'name', tags: ['eng', '2026'] });
		assert.strictEqual(rows[0].json.id, 'r1');
		console.log('PASS resume list mapping');
	}

	// --- Resume create: tags default to [] ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'create', name: 'N', slug: 's', tagsCreate: '', withSampleData: false },
			calls,
			httpImpl: () => 'new-id',
		});
		assert.deepStrictEqual(calls[0].body, { name: 'N', slug: 's', tags: [], withSampleData: false });
		console.log('PASS resume create mapping');
	}

	// --- Resume setLock uses { isLocked } ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'setLock', resumeId: 'r1', locked: true },
			calls,
		});
		assert.strictEqual(calls[0].url, 'https://rxresu.me/api/openapi/resumes/r1/lock');
		assert.deepStrictEqual(calls[0].body, { isLocked: true });
		console.log('PASS resume setLock mapping');
	}

	// --- Resume duplicate fills missing fields from current resume ---
	{
		const calls = [];
		const [rows] = await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'duplicate', resumeId: 'r1', duplicateOptions: { name: 'Copy' } },
			calls,
			httpImpl: (options, n) =>
				n === 1 ? { id: 'r1', name: 'Orig', slug: 'orig', tags: ['a'] } : 'r2',
		});
		assert.strictEqual(calls[0].method, 'GET');
		assert.deepStrictEqual(calls[1].body, { name: 'Copy', slug: 'orig', tags: ['a'] });
		assert.strictEqual(rows[0].json.id, 'r2');
		console.log('PASS resume duplicate merge');
	}

	// --- Resume downloadPdf returns binary ---
	{
		const calls = [];
		const pdf = Buffer.from('%PDF-1.4 fake');
		const [rows] = await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'downloadPdf', resumeId: 'r1', target: 'resume', binaryPropertyName: 'data' },
			calls,
			httpImpl: () => ({ body: pdf, headers: { 'content-disposition': 'attachment; filename="cv.pdf"' } }),
		});
		assert.ok(calls[0].url.endsWith('/resumes/r1/pdf'));
		assert.strictEqual(rows[0].binary.data.mimeType, 'application/pdf');
		assert.strictEqual(rows[0].binary.data.fileName, 'cv.pdf');
		console.log('PASS resume downloadPdf binary');
	}

	// --- Patch rejects empty operations array ---
	{
		const calls = [];
		try {
			await mockRun(NodeClass, {
				params: { resource: 'resume', operation: 'patch', resumeId: 'r1', operations: '[]', expectedUpdatedAt: '' },
				calls,
			});
			throw new Error('expected throw');
		} catch (e) {
			assert.ok(/non-empty/.test(e.message));
			assert.strictEqual(calls.length, 0, 'no HTTP call on validation failure');
		}
		console.log('PASS patch validation');
	}

	// --- Cover letter delete sends expectedRevision in body ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'coverLetter', operation: 'delete', coverLetterId: 'c1', expectedRevision: 3 },
			calls,
		});
		assert.strictEqual(calls[0].method, 'DELETE');
		assert.deepStrictEqual(calls[0].body, { expectedRevision: 3 });
		console.log('PASS cover letter delete mapping');
	}

	// --- Application bulkUpdate maps tags -> addTags ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'application', operation: 'bulkUpdate', ids: 'a1, a2', bulkUpdate: { status: 'applied', archived: false, tags: 'x,y' } },
			calls,
		});
		assert.deepStrictEqual(calls[0].body, { ids: ['a1', 'a2'], status: 'applied', archived: false, addTags: ['x', 'y'] });
		console.log('PASS application bulkUpdate mapping');
	}

	// --- Bulk guards: 0 or >200 ids rejected before any HTTP call ---
	{
		for (const ids of ['', Array.from({ length: 201 }, (_, i) => `a${i}`).join(',')]) {
			const calls = [];
			try {
				await mockRun(NodeClass, {
					params: { resource: 'application', operation: 'bulkDelete', ids },
					calls,
				});
				throw new Error('expected throw');
			} catch (e) {
				assert.ok(/1 and 200/.test(e.message));
				assert.strictEqual(calls.length, 0, 'no HTTP call on validation failure');
			}
		}
		console.log('PASS bulk id guards');
	}

	// --- Bulk import: >500 rows rejected before any HTTP call ---
	{
		const calls = [];
		try {
			await mockRun(NodeClass, {
				params: { resource: 'application', operation: 'bulkImport', applications: JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ company: `c${i}`, role: 'r' }))) },
				calls,
			});
			throw new Error('expected throw');
		} catch (e) {
			assert.ok(/1 to 500/.test(e.message));
			assert.strictEqual(calls.length, 0, 'no HTTP call on validation failure');
		}
		console.log('PASS bulkImport limit');
	}

	// --- Resume update with untouched fields sends no data key (no accidental {} overwrite) ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'resume', operation: 'update', resumeId: 'r1', updateFields: { name: 'New' } },
			calls,
		});
		assert.deepStrictEqual(calls[0].body, { name: 'New' });
		console.log('PASS resume update drops untouched fields');
	}

	// --- Timeline entry update sends YYYY-MM-DD date as-is ---
	{
		const calls = [];
		await mockRun(NodeClass, {
			params: { resource: 'application', operation: 'updateTimelineEntry', applicationId: 'a1', timelineEntryId: 't1', timelineUpdate: { date: '2026-09-01', note: 'Onsite' } },
			calls,
		});
		assert.ok(calls[0].url.endsWith('/applications/a1/timeline/t1'));
		assert.deepStrictEqual(calls[0].body, { date: '2026-09-01', text: 'Onsite' });
		console.log('PASS timeline update mapping');
	}

	// --- System health hits /api/health (outside /api/openapi) ---
	{
		const calls = [];
		const [rows] = await mockRun(NodeClass, {
			params: { resource: 'system', operation: 'health' },
			calls,
		});
		assert.strictEqual(calls[0].url, 'https://rxresu.me/api/health');
		assert.strictEqual(rows[0].json.status, 'healthy');
		console.log('PASS system health URL');
	}

	console.log('\nAll unit tests passed.');
})().catch((e) => {
	console.error('FAIL:', e);
	process.exit(1);
});
