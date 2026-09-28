# n8n-nodes-reactive-resume

n8n community node for [Reactive Resume](https://rxresu.me). Manage resumes, cover letters, and job applications, render PDFs, and check instance health.

Works with hosted (`https://rxresu.me`) and self-hosted instances. No runtime dependencies.

## Installation

In n8n (**Settings → Community Nodes → Install**):

```
n8n-nodes-reactive-resume
```

## Credentials

Create a **Reactive Resume API** credential:

- **API Key**: from **Settings → API Keys** in Reactive Resume ([guide](https://docs.rxresu.me/guides/using-the-api)).
- **Base URL**: `https://rxresu.me` or your self-hosted origin (e.g. `https://resumes.example.com`).

## Operations

- **Resume**: CRUD, patch, import, duplicate, lock, tags, versions, PDF download, statistics, password, public resume.
- **Cover Letter**: CRUD, duplicate, refresh style, copy from resume, export/import.
- **Job Application**: CRUD, bulk update/delete/import, stats, tags, notes, timeline.
- **System**: health, feature flags, auth providers, stats, export/delete account.

## Development

```bash
npm install
npm run dev    # watch + local n8n at http://localhost:5678
npm run lint
npm run build
npm test
```

## License

MIT — see [LICENSE](LICENSE).
