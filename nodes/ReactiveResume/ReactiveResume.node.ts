import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { applicationFields, applicationOperations } from './ApplicationDescription';
import { coverLetterFields, coverLetterOperations } from './CoverLetterDescription';
import {
	getCredentials,
	normalizeBaseUrl,
	parseJsonParam,
	parseTagsParam,
	reactiveResumeApiRequest,
	toItems,
} from './GenericFunctions';
import { resumeFields, resumeOperations } from './ResumeDescription';
import { systemFields, systemOperations } from './SystemDescription';

function pushResult(returnData: INodeExecutionData[], response: unknown): void {
	if (typeof response === 'string') {
		returnData.push({ json: { id: response } });
		return;
	}
	if (typeof response === 'number' || typeof response === 'boolean') {
		returnData.push({ json: { result: response } });
		return;
	}
	for (const item of toItems(response)) returnData.push(item);
}

function splitIds(value: unknown): string[] {
	return String(value ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
}

function pickDefined(body: Record<string, unknown>): IDataObject {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(body)) {
		if (value !== undefined && value !== null && value !== '') out[key] = value;
	}
	return out as IDataObject;
}

async function executeResume(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	returnData: INodeExecutionData[],
): Promise<void> {
	const get = (name: string, fallback?: unknown) =>
		context.getNodeParameter(name, itemIndex, fallback) as unknown;

	if (operation === 'list') {
		const qs: IDataObject = { sort: get('sort', 'lastUpdatedAt') as string };
		const tags = parseTagsParam(get('tags', ''));
		if (tags !== undefined) qs.tags = tags;
		pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/resumes', { qs }));
		return;
	}

	if (operation === 'downloadPdf') {
		const resumeId = get('resumeId') as string;
		const target = get('target', 'resume') as string;
		const binaryPropertyName = (get('binaryPropertyName', 'data') as string) || 'data';
		const response = (await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}/pdf`, {
			qs: { target } as IDataObject,
			encoding: 'arraybuffer',
			returnFullResponse: true,
			json: false,
		})) as { body: Buffer | ArrayBuffer | string; headers?: Record<string, string> };
		const buffer = Buffer.isBuffer(response.body)
			? response.body
			: Buffer.from(response.body as ArrayBuffer);
		const disposition = response.headers?.['content-disposition'] ?? '';
		const match = /filename="?([^";]+)"?/.exec(disposition);
		const fileName = match?.[1] ?? `${resumeId}.pdf`;
		const binaryData = await context.helpers.prepareBinaryData(buffer, fileName, 'application/pdf');
		returnData.push({
			json: { resumeId, target, fileName },
			binary: { [binaryPropertyName]: binaryData },
		});
		return;
	}

	if (operation === 'getPublic' || operation === 'verifyPassword' || operation === 'recordDownload') {
		const username = encodeURIComponent(get('username') as string);
		const slug = encodeURIComponent(get('publicSlug') as string);
		if (operation === 'getPublic') {
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', `/resumes/${username}/${slug}`));
		} else if (operation === 'verifyPassword') {
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', `/resumes/${username}/${slug}/password/verify`, {
					body: { password: get('password') } as IDataObject,
				}),
			);
		} else {
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', `/resumes/${username}/${slug}/statistics/download`),
			);
		}
		return;
	}

	const resumeId = get('resumeId', '') as string;

	switch (operation) {
		case 'get':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}`));
			break;
		case 'create':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/resumes', {
					body: {
						name: get('name'),
						slug: get('slug'),
						tags: parseTagsParam(get('tagsCreate', '')) ?? [],
						withSampleData: get('withSampleData', false),
					} as IDataObject,
				}),
			);
			break;
		case 'update': {
			const fields = (get('updateFields', {}) ?? {}) as Record<string, unknown>;
			const body = pickDefined({
				name: fields.name,
				slug: fields.slug,
				tags: parseTagsParam(fields.tags),
				data: parseJsonParam(fields.data, 'Data (JSON)', context.getNode()),
				isPublic: fields.isPublic,
				showDownloadButtons: fields.showDownloadButtons,
			});
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'PUT', `/resumes/${resumeId}`, { body }),
			);
			break;
		}
		case 'delete':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'DELETE', `/resumes/${resumeId}`));
			break;
		case 'patch': {
			const operations = parseJsonParam(get('operations'), 'Patch Operations', context.getNode()) as unknown[];
			if (!Array.isArray(operations) || operations.length === 0) {
				throw new NodeOperationError(
					context.getNode(),
					'Patch Operations must be a non-empty JSON array of RFC 6902 operations.',
				);
			}
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'PATCH', `/resumes/${resumeId}`, {
					body: pickDefined({ operations, expectedUpdatedAt: get('expectedUpdatedAt', '') }),
				}),
			);
			break;
		}
		case 'import':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/resumes/import', {
					body: { data: parseJsonParam(get('resumeData'), 'Resume Data', context.getNode()) } as IDataObject,
				}),
			);
			break;
		case 'duplicate': {
			const options = (get('duplicateOptions', {}) ?? {}) as Record<string, unknown>;
			const current = (await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}`)) as {
				name: string;
				slug: string;
				tags: string[];
			};
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', `/resumes/${resumeId}/duplicate`, {
					body: {
						name: options.name || current.name,
						slug: options.slug || current.slug,
						tags: parseTagsParam(options.tags) ?? current.tags ?? [],
					},
				}),
			);
			break;
		}
		case 'setLock':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', `/resumes/${resumeId}/lock`, {
					body: { isLocked: get('locked', true) } as IDataObject,
				}),
			);
			break;
		case 'listTags':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/resumes/tags'));
			break;
		case 'listVersions':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}/versions`),
			);
			break;
		case 'restoreVersion':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(
					context,
					'POST',
					`/resumes/${resumeId}/versions/${get('versionId')}/restore`,
				),
			);
			break;
		case 'getStats':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}/statistics`),
			);
			break;
		case 'getDailyStats':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/resumes/${resumeId}/statistics/daily`, {
					qs: { days: get('days', 30) } as IDataObject,
				}),
			);
			break;
		case 'setPassword':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'PUT', `/resumes/${resumeId}/password`, {
					body: { password: get('password') } as IDataObject,
				}),
			);
			break;
		case 'removePassword':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'DELETE', `/resumes/${resumeId}/password`),
			);
			break;
		default:
			throw new NodeOperationError(context.getNode(), `Unsupported Resume operation: ${operation}`);
	}
}

async function executeCoverLetter(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	returnData: INodeExecutionData[],
): Promise<void> {
	const get = (name: string, fallback?: unknown) =>
		context.getNodeParameter(name, itemIndex, fallback) as unknown;

	switch (operation) {
		case 'list': {
			const filters = (get('listFilters', {}) ?? {}) as Record<string, unknown>;
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', '/cover-letters', {
					qs: pickDefined({
						search: filters.search,
						resumeId: filters.resumeId,
						applicationId: filters.applicationId,
						limit: filters.limit ?? 50,
						offset: filters.offset ?? 0,
					}),
				}),
			);
			break;
		}
		case 'get':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/cover-letters/${get('coverLetterId')}`),
			);
			break;
		case 'create': {
			const fields = (get('additionalFields', {}) ?? {}) as Record<string, unknown>;
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/cover-letters', {
					body: pickDefined({
						name: get('name'),
						recipient: fields.recipient,
						content: fields.content,
						resumeId: fields.resumeId,
						applicationId: fields.applicationId,
						template: fields.template,
					}),
				}),
			);
			break;
		}
		case 'update': {
			const fields = (get('updateFields', {}) ?? {}) as Record<string, unknown>;
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'PUT', `/cover-letters/${get('coverLetterId')}`, {
					body: pickDefined({
						expectedRevision: get('expectedRevision'),
						name: fields.name,
						recipient: fields.recipient,
						content: fields.content,
						template: fields.template,
					}),
				}),
			);
			break;
		}
		case 'delete':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'DELETE', `/cover-letters/${get('coverLetterId')}`, {
					body: { expectedRevision: get('expectedRevision') } as IDataObject,
				}),
			);
			break;
		case 'duplicate':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(
					context,
					'POST',
					`/cover-letters/${get('coverLetterId')}/duplicate`,
					{ body: pickDefined({ name: get('duplicateName', '') }) },
				),
			);
			break;
		case 'refreshStyle':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(
					context,
					'POST',
					`/cover-letters/${get('coverLetterId')}/refresh-style`,
					{
						body: { expectedRevision: get('expectedRevision'), resumeId: get('resumeId') } as IDataObject,
					},
				),
			);
			break;
		case 'copyFromResume':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/cover-letters/from-resume', {
					body: pickDefined({
						resumeId: get('resumeId'),
						sectionId: get('sectionId'),
						itemId: get('itemId'),
						name: get('copyName', ''),
					}),
				}),
			);
			break;
		case 'export':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/cover-letters/${get('coverLetterId')}/export`),
			);
			break;
		case 'import':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/cover-letters/import', {
					body: { document: parseJsonParam(get('document'), 'Document', context.getNode()) } as IDataObject,
				}),
			);
			break;
		default:
			throw new NodeOperationError(context.getNode(), `Unsupported Cover Letter operation: ${operation}`);
	}
}

const applicationFieldAllowlist = [
	'company',
	'role',
	'location',
	'salary',
	'source',
	'sourceUrl',
	'jobDescription',
	'notes',
	'resumeFileUrl',
	'resumeFileName',
	'coverLetterUrl',
	'coverLetterName',
	'followUpAt',
	'followUpNote',
	'contacts',
	'resumeId',
	'tags',
	'status',
] as const;

async function executeApplication(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	returnData: INodeExecutionData[],
): Promise<void> {
	const get = (name: string, fallback?: unknown) =>
		context.getNodeParameter(name, itemIndex, fallback) as unknown;

	const buildApplicationBody = (includeArchived: boolean): IDataObject => {
		const fields = (get('additionalFields', {}) ?? {}) as Record<string, unknown>;
		const body: Record<string, unknown> = {};
		for (const key of applicationFieldAllowlist) {
			let value = fields[key];
			if (key === 'contacts') value = parseJsonParam(value, 'Contacts (JSON)', context.getNode());
			if (key === 'tags') value = parseTagsParam(value);
			if (value !== undefined && value !== null && value !== '') body[key] = value;
		}
		if (includeArchived && fields.archived !== undefined && fields.archived !== '') {
			body.archived = fields.archived;
		}
		return body as IDataObject;
	};

	switch (operation) {
		case 'list': {
			const filters = (get('listFilters', {}) ?? {}) as Record<string, unknown>;
			const qs: IDataObject = pickDefined({
				status: filters.status,
				includeArchived: filters.includeArchived ?? false,
			});
			const tags = parseTagsParam(filters.tags);
			if (tags !== undefined) qs.tags = tags;
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/applications', { qs }));
			break;
		}
		case 'get':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'GET', `/applications/${get('applicationId')}`),
			);
			break;
		case 'create':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/applications', {
					body: {
						company: get('company'),
						role: get('role'),
						...buildApplicationBody(false),
					} as IDataObject,
				}),
			);
			break;
		case 'update':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'PUT', `/applications/${get('applicationId')}`, {
					body: buildApplicationBody(true),
				}),
			);
			break;
		case 'delete':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'DELETE', `/applications/${get('applicationId')}`),
			);
			break;
		case 'bulkUpdate': {
			const changes = (get('bulkUpdate', {}) ?? {}) as Record<string, unknown>;
			const ids = splitIds(get('ids'));
			if (ids.length === 0 || ids.length > 200) {
				throw new NodeOperationError(
					context.getNode(),
					'Provide between 1 and 200 comma-separated application IDs.',
				);
			}
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/applications/bulk-update', {
					body: pickDefined({
						ids,
						status: changes.status,
						archived: changes.archived,
						addTags: parseTagsParam(changes.tags),
					}),
				}),
			);
			break;
		}
		case 'bulkDelete': {
			const ids = splitIds(get('ids'));
			if (ids.length === 0 || ids.length > 200) {
				throw new NodeOperationError(
					context.getNode(),
					'Provide between 1 and 200 comma-separated application IDs.',
				);
			}
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/applications/bulk-delete', {
					body: { ids },
				}),
			);
			break;
		}
		case 'bulkImport': {
			const items = parseJsonParam(get('applications'), 'Applications', context.getNode());
			if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
				throw new NodeOperationError(
					context.getNode(),
					'Applications must be a JSON array of 1 to 500 { company, role, ... } rows.',
				);
			}
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', '/applications/import', {
					body: { items },
				}),
			);
			break;
		}
		case 'stats':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/applications/stats'));
			break;
		case 'listTags':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/applications/tags'));
			break;
		case 'logNote':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(context, 'POST', `/applications/${get('applicationId')}/notes`, {
					body: pickDefined({ text: get('note'), date: get('noteDate', '') }),
				}),
			);
			break;
		case 'updateTimelineEntry': {
			const update = (get('timelineUpdate', {}) ?? {}) as Record<string, unknown>;
			pushResult(
				returnData,
				await reactiveResumeApiRequest(
					context,
					'PUT',
					`/applications/${get('applicationId')}/timeline/${get('timelineEntryId')}`,
					{ body: pickDefined({ date: update.date, text: update.note }) },
				),
			);
			break;
		}
		case 'deleteTimelineEntry':
			pushResult(
				returnData,
				await reactiveResumeApiRequest(
					context,
					'DELETE',
					`/applications/${get('applicationId')}/timeline/${get('timelineEntryId')}`,
				),
			);
			break;
		default:
			throw new NodeOperationError(context.getNode(), `Unsupported Job Application operation: ${operation}`);
	}
}

async function executeSystem(
	context: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	returnData: INodeExecutionData[],
): Promise<void> {
	const get = (name: string, fallback?: unknown) =>
		context.getNodeParameter(name, itemIndex, fallback) as unknown;

	switch (operation) {
		case 'health': {
			// Served at {base}/api/health (outside /api/openapi) and needs no auth.
			const credentials = await getCredentials(context);
			const response = await context.helpers.httpRequest({
				method: 'GET',
				url: `${normalizeBaseUrl(credentials.baseUrl)}/api/health`,
				json: true,
			});
			pushResult(returnData, response);
			break;
		}
		case 'featureFlags':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/flags'));
			break;
		case 'authProviders':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/auth/providers'));
			break;
		case 'platformStats': {
			const metric = get('metric', 'totals') as string;
			if (metric === 'stars') {
				const stars = await reactiveResumeApiRequest(context, 'GET', '/statistics/github/stars');
				pushResult(returnData, { stars });
			} else {
				const totals = (await reactiveResumeApiRequest(context, 'GET', '/statistics')) as {
					users: number;
					resumes: number;
					cachedAt: number | null;
				};
				if (metric === 'users') pushResult(returnData, { users: totals.users, cachedAt: totals.cachedAt });
				else if (metric === 'resumes')
					pushResult(returnData, { resumes: totals.resumes, cachedAt: totals.cachedAt });
				else pushResult(returnData, totals);
			}
			break;
		}
		case 'exportAccount':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'GET', '/auth/account/export'));
			break;
		case 'deleteAccount':
			pushResult(returnData, await reactiveResumeApiRequest(context, 'DELETE', '/auth/account'));
			break;
		default:
			throw new NodeOperationError(context.getNode(), `Unsupported System operation: ${operation}`);
	}
}

export class ReactiveResume implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Reactive Resume',
		name: 'reactiveResume',
		icon: { light: 'file:reactiveResume.svg', dark: 'file:reactiveResume.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Work with resumes, cover letters, and job applications in Reactive Resume',
		defaults: { name: 'Reactive Resume' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'reactiveResumeApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Resume', value: 'resume' },
					{ name: 'Cover Letter', value: 'coverLetter' },
					{ name: 'Job Application', value: 'application' },
					{ name: 'System', value: 'system' },
				],
				default: 'resume',
			},
			...resumeOperations,
			...resumeFields,
			...coverLetterOperations,
			...coverLetterFields,
			...applicationOperations,
			...applicationFields,
			...systemOperations,
			...systemFields,
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'resume') {
					await executeResume(this, i, operation, returnData);
				} else if (resource === 'coverLetter') {
					await executeCoverLetter(this, i, operation, returnData);
				} else if (resource === 'application') {
					await executeApplication(this, i, operation, returnData);
				} else if (resource === 'system') {
					await executeSystem(this, i, operation, returnData);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		}

		return [returnData];
	}
}
