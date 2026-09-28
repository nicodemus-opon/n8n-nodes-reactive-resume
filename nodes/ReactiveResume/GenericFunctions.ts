import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	INode,
	INodeExecutionData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export type ReactiveResumeCredentials = {
	apiKey: string;
	baseUrl: string;
};

export function normalizeBaseUrl(baseUrl: string): string {
	return (baseUrl || 'https://rxresu.me').replace(/\/+$/, '');
}

/** Build a full API URL: {baseUrl}/api/openapi{path} */
export function buildApiUrl(baseUrl: string, path: string): string {
	const base = normalizeBaseUrl(baseUrl);
	const suffix = path.startsWith('/') ? path : `/${path}`;
	return `${base}/api/openapi${suffix}`;
}

export async function getCredentials(
	context: IExecuteFunctions,
): Promise<ReactiveResumeCredentials> {
	const credentials = (await context.getCredentials('reactiveResumeApi')) as unknown as
		| ReactiveResumeCredentials
		| undefined;
	if (!credentials?.apiKey) {
		throw new NodeApiError(context.getNode(), {
			message: 'Missing Reactive Resume API key. Create one under Settings > API Keys.',
		});
	}
	return {
		apiKey: credentials.apiKey,
		baseUrl: credentials.baseUrl || 'https://rxresu.me',
	};
}

export async function reactiveResumeApiRequest(
	context: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	options: {
		body?: IDataObject;
		qs?: IDataObject;
		headers?: Record<string, string>;
		returnFullResponse?: boolean;
		encoding?: IHttpRequestOptions['encoding'];
		json?: boolean;
	} = {},
): Promise<JsonObject | string | number | undefined> {
	const credentials = await getCredentials(context);
	const requestOptions: IHttpRequestOptions = {
		method,
		url: buildApiUrl(credentials.baseUrl, path),
		headers: {
			'x-api-key': credentials.apiKey,
			...(options.headers ?? {}),
		},
		qs: options.qs,
		returnFullResponse: options.returnFullResponse ?? false,
	};

	if (options.encoding !== undefined) {
		requestOptions.encoding = options.encoding;
	}

	// Only attach a body when one was provided (GET/DELETE must not send one).
	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}
	requestOptions.json = options.json ?? true;

	try {
		return (await context.helpers.httpRequestWithAuthentication.call(
			context,
			'reactiveResumeApi',
			requestOptions,
		)) as JsonObject | string | number | undefined;
	} catch (error) {
		throw new NodeApiError(context.getNode(), error as JsonObject, {
			message: mapApiErrorMessage(error),
		});
	}
}

function mapApiErrorMessage(error: unknown): string | undefined {
	const responseData = (error as { response?: { data?: unknown } })?.response?.data as
		| { code?: string; message?: string }
		| undefined;
	const code = responseData?.code;
	if (!code) return undefined;

	const hints: Record<string, string> = {
		RESUME_LOCKED: 'The resume is locked. Unlock it first (Resume > Set Lock Status).',
		RESUME_SLUG_ALREADY_EXISTS: 'A resume with this slug already exists. Use a unique slug.',
		NEED_PASSWORD:
			'This public resume is password-protected. Verify the password first (Resume > Verify Password).',
		INVALID_PATCH_OPERATIONS:
			'Invalid JSON Patch operations. Fetch the resume first and check RFC 6902 paths (e.g. /basics/name).',
		UNAUTHORIZED: 'Missing or invalid API key.',
		NOT_FOUND: 'The resource does not exist or does not belong to this API key owner.',
	};
	let text = code;
	if (responseData?.message) text += `: ${responseData.message}`;
	if (hints[code]) text += `. ${hints[code]}`;
	return text;
}

/** Wrap a value into n8n output items; arrays become one item per entry. */
export function toItems(value: unknown): INodeExecutionData[] {
	if (Array.isArray(value)) {
		return value.map((entry) => ({ json: (entry ?? {}) as IDataObject }));
	}
	if (value === undefined || value === null || value === '') {
		return [{ json: { success: true } }];
	}
	return [{ json: value as IDataObject }];
}

/** Parse a JSON-typed node parameter that may be a string or an object. */
export function parseJsonParam(value: unknown, fieldName: string, node: INode): unknown {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'string') {
		try {
			return JSON.parse(value) as unknown;
		} catch {
			throw new NodeOperationError(node, `Field "${fieldName}" must contain valid JSON.`);
		}
	}
	return value;
}

/** Split a comma-separated tags string into an array. */
export function parseTagsParam(value: unknown): string[] | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (Array.isArray(value)) return value.map(String);
	return String(value)
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);
}
