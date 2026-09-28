import type { INodeProperties } from 'n8n-workflow';

export const systemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['system'] } },
		options: [
			{ name: 'Delete Account', value: 'deleteAccount', action: 'Delete user account', description: 'Permanently delete the account and all data' },
			{ name: 'Export Account Data', value: 'exportAccount', action: 'Export account data', description: 'Export resumes, cover letters, and profile fields (no secrets)' },
			{ name: 'Get Auth Providers', value: 'authProviders', action: 'List authentication providers', description: 'Providers enabled on this instance' },
			{ name: 'Get Feature Flags', value: 'featureFlags', action: 'Get feature flags', description: 'Instance-wide settings' },
			{ name: 'Get Health', value: 'health', action: 'Get application health', description: 'Database and storage status (no auth)' },
			{ name: 'Get Platform Stats', value: 'platformStats', action: 'Get platform statistics', description: 'User, resume, or GitHub star totals' },
		],
		default: 'health',
	},
];

export const systemFields: INodeProperties[] = [
	{
		displayName: 'Delete Account',
		name: 'deleteAccountNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['system'], operation: ['deleteAccount'] } },
		description: 'This permanently deletes the account and all data. This cannot be undone.',
	},
	{
		displayName: 'Metric',
		name: 'metric',
		type: 'options',
		default: 'totals',
		displayOptions: { show: { resource: ['system'], operation: ['platformStats'] } },
		options: [
			{ name: 'Totals (Users + Resumes)', value: 'totals' },
			{ name: 'Total Resumes', value: 'resumes' },
			{ name: 'Total Users', value: 'users' },
			{ name: 'GitHub Stars', value: 'stars' },
		],
	},
];
