# Sill public synthetic preview

Rebuilt from remote `docs/sill-agent-first-mcp` commit `428c04bcccdc9b25ddfe22969111408b8ddcc7dd` on 2026-10-14. No old environment artifacts or its 27 MCP files were used.

Public address: https://sill-web-preview.scs1213-temp-email.workers.dev/

Cloudflare upload returned HTTP 200, success true. Worker `sill-web-preview`, deployment ID `ea827784bdf8407595d3402695933b7b`, ETag `dd8db8e7ed0e01f3313f0ba744ecad00c0714c814d8ec7771eab08479d4d78f5`. workers.dev was enabled and then read back as enabled. Existing Worker list was checked first; this name did not exist.

This is a module Worker serving a bundled HTML text module (`has_assets:false`), not a Workers Static Assets upload. This avoids extracting or configuring upload credentials: the connected Cloudflare tool uploads both modules in one multipart request. CSS, JavaScript and SVG images are inline. There are no database, AI, storage, or secret bindings and no plan upgrades or paid services were enabled. Worker requests remain subject to the account's existing allowance; no unlimited-free claim is made.

## Safety and behavior

- All initial content is the repository's synthetic demo content. External demo links point to example.com.
- Persistent visible banner states synthetic data, browser-local changes, and unavailable login/backend/MCP.
- Separate `sill-public-demo-v1` browser storage key; no migration from previous personal card storage.
- Sources start as attention/unconnected. Authorize, permission grant, RSS subscription and source toggling cannot report success.
- CSP forbids network connections, frames, form submission and remote resources.
- `/api`, `/api/*`, `/mcp`, `/mcp/*` return HTTP 503 JSON `NOT_CONNECTED` for all methods. Unknown assets return 404. Non-GET/HEAD page requests return 405. No SPA fallback.
- Supabase and security/database settings were not changed.

## Reproduce

Run `bash deploy/preview/rebuild.sh` from the repository checkout. It rebuilds the standalone HTML and generates `upload-code.json` containing the connected Cloudflare execute tool arguments. Before executing that file, inspect existing Worker ownership and review the prepared diff. Call Cloudflare execute with that JSON; then POST `/accounts/8dfc5765c957955fbcca0c22071c824d/workers/scripts/sill-web-preview/subdomain` with `{ "enabled": true, "previews_enabled": false }` if public routing needs enabling. Neither file contains credentials.

`node deploy/preview/verify.cjs` runs local browser checks against the same Worker handler and CSP at 1440 and 390 pixels. It uses `/usr/bin/chromium` and the environment's Playwright installation (`CODEX_PRIMARY_RUNTIME_NODE_MODULES`). Passing the public URL runs the same checks against production.

## Verification and remaining blocker

Build consistency and JS/inline script checks pass. Local browser results/screenshots and route tests are saved alongside this file. The upload and public routing are confirmed by Cloudflare API.

**Live HTTP and live browser validation remain blocked**, not passed. Workspace Chromium reports `ERR_TUNNEL_CONNECTION_FAILED`; Python reports proxy CONNECT 403; an escalated read-only browser request has the same network failure. A direct DNS check cannot resolve the hostname in this execution environment. The Cloudflare tool's outbound fetch returns `403 Forbidden: requests to sill-web-preview.scs1213-temp-email.workers.dev are not allowed`. Web retrieval likewise reports inaccessible. These observations do not establish an application-side 403 or prove public reachability. No deployment retry or alternate publishing path was used.

Remaining product work: real login/session validation; database schema and ownership/RLS; revision-safe writes; authenticated/scoped MCP; external Webhook integration and delivery evidence; real upstream connections. None is represented as implemented here.
