import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class ReactiveResumeApi implements ICredentialType {
	name = 'reactiveResumeApi';

	displayName = 'Reactive Resume API';

	icon: Icon = {
		light: 'file:../nodes/ReactiveResume/reactiveResume.svg',
		dark: 'file:../nodes/ReactiveResume/reactiveResume.dark.svg',
	};

	documentationUrl = 'https://docs.rxresu.me/guides/using-the-api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'API key created in Reactive Resume dashboard under Settings &gt; API Keys. Sent as the <code>x-api-key</code> header.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://rxresu.me',
			required: true,
			description:
				'Root URL of the Reactive Resume instance, without a trailing <code>/api</code> path. Use https://rxresu.me for the hosted version or your self-hosted origin.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}/api/openapi',
			url: '/resumes',
			method: 'GET',
		},
	};
}
