# n8n-nodes-reactive-resume

An n8n community node for [Reactive Resume](https://rxresu.me) ([API reference](https://docs.rxresu.me/api-reference), v5.3.x).
Manage resumes, cover letters, and job applications, render PDFs, and query instance health — all from n8n workflows.

- Package: `n8n-nodes-reactive-resume`
- Works with hosted Reactive Resume (`https://rxresu.me`) and self-hosted instances.
- No runtime dependencies. Usable as a tool in AI Agent nodes.

## Installation

In n8n (**Settings → Community Nodes → Install**), enter:

```
n8n-nodes-reactive-resume
```

Or from the command line in your n8n installation:

```bash
npm install n8n-nodes-reactive-resume
```

Compatibility: n8n `>=1.0`, Node.js `>=20`, n8nNodesApiVersion `1`.

## Credentials

The node authenticates with a Reactive Resume API key sent as the `x-api-key` header.

1. Sign in at https://rxresu.me (or your self-hosted instance).
2. Go to **Settings → API Keys → Create a new API key** ([guide](https://docs.rxresu.me/guides/using-the-api)).
3. In n8n, create a **Reactive Resume API** credential:
   - **API Key**: the key from step 2.
   - **Base URL**: `https://rxresu.me` for hosted, or your self-hosted origin (no trailing `/api`; e.g. `https://resumes.example.com`).

To verify the credential, n8n sends `GET {Base URL}/api/openapi/resumes`. A `401/403` means the key is missing or invalid; an `ENOTFOUND/ECONNREFUSED` means the Base URL is wrong.

## Resources & operations

- **Resume**: list, get, create, update, delete, patch (JSON Patch RFC 6902), import, duplicate,
  set lock status, list tags, list/restore versions, download PDF (binary), statistics + daily statistics,
  set/remove password, get public resume, verify password, record download.
- **Cover Letter**: list, get, create, update, delete, duplicate, refresh style, copy from resume, export, import.
- **Job Application**: list, get, create, update, delete, bulk update/delete/import, stats, list tags,
  log note, update/delete timeline entry.
- **System**: health (no auth, `GET /api/health`), feature flags, auth providers, platform stats, export/delete account.

AI endpoints (`/ai/*`), saved AI providers, and agent threads are intentionally out of scope for v1.

## Examples

**1. List resumes tagged `engineering`:**

Resource `Resume`, Operation `List`, Tags `engineering`, Sort By `Last Updated`.

**2. Export a resume to PDF and email it:**

1. Resource `Resume`, Operation `Download PDF`, Resume ID `<id>`, Binary Property `data`.
2. Connect a **Send Email** / **Gmail** node and attach `data`.

**3. Tailor a resume with JSON Patch (RFC 6902):**

1. Resource `Resume`, Operation `Get`, Resume ID `<id>` — confirm paths.
2. Resource `Resume`, Operation `Patch Data`, Patch Operations (JSON):

```json
[{ "op": "replace", "path": "/basics/name", "value": "Jane Doe" }]
```

**4. Bulk-move applications to the interview stage:**

Resource `Job Application`, Operation `Bulk Update`, Application IDs `id1, id2`, Bulk Update Stage `Interview`.

## Development

```bash
npm install
npm run dev    # watch + local n8n at http://localhost:5678
npm run lint
npm run build
npm test       # mocked unit tests, no API key required
```

Publishing for verification (required since May 1st 2026): bump `version` in `package.json`, push a tag
`vX.Y.Z`, and `.github/workflows/release.yml` publishes to npm with provenance. Do not publish verified
releases from a local machine.

## Branding

Node icons (`nodes/ReactiveResume/reactiveResume.svg`, `reactiveResume.dark.svg`) use the official
Reactive Resume “R” mark from [`reactive-resume/reactive-resume`](https://github.com/reactive-resume/reactive-resume)
(`apps/web/public/icon/light.svg` / `icon/dark.svg`, MIT licensed), placed on a solid contrasting tile so the
mark stays visible at small sizes and in file previews: dark `#09090B` tile with white mark for the
light theme, white `#FAFAFA` tile with dark mark for the dark theme.

## License

MIT — see [LICENSE](LICENSE).
