# Sill public synthetic preview

Rebuilt from remote `docs/sill-agent-first-mcp` commit `428c04bcccdc9b25ddfe22969111408b8ddcc7dd` on 2026-10-14. No old environment artifacts or its 27 MCP files were used.

Public address: https://sill-web-preview.scs1213-temp-email.workers.dev/

Cloudflare upload returned HTTP 200, success true. Worker `sill-web-preview`, deployment ID `b30a69713280449481cfd866e7e4dc88`, ETag `f4581cbc2907f365d545b38cd1bfc473dc0f798a08a7f7b1dbbad7f713e890b6`. workers.dev was enabled and then read back as enabled. Existing Worker list was checked first; this name did not exist at initial creation; before the update its Sill tags and previous ETag were matched. The fixed source commit is `96aca3f30e5498037c7be0f3959370819494c99c`, with both Verify and Integration CI successful before upload.

This is a module Worker serving a bundled HTML text module (`has_assets:false`), not a Workers Static Assets upload. This avoids extracting or configuring upload credentials: the connected Cloudflare tool uploads both modules in one multipart request. CSS, JavaScript and SVG images are inline. There are no database, AI, storage, or secret bindings and no plan upgrades or paid services were enabled. Worker requests remain subject to the account's existing allowance; no unlimited-free claim is made.

## Safety and behavior

- All initial content is the repository's synthetic demo content. External demo links point to example.com.
- Persistent visible banner states synthetic data, browser-local changes, and unavailable login/backend/MCP.
- Separate `sill-public-demo-v1` browser storage key; no migration from previous personal card storage.
- Sources start as attention/unconnected. Authorize, permission grant, RSS subscription and source toggling cannot report success.
- CSP forbids network connections, frames, form submission and remote resources.
- `/api`, `/api/*`, `/mcp`, `/mcp/*` return HTTP 503 JSON `NOT_CONNECTED` for all methods. Unknown assets return 404. Non-GET/HEAD page requests return 405. No SPA fallback.
- Supabase and security/database settings were not changed.

## Isolated preview build

The regular `index.html` is built without preview settings. `python3 scripts/build.py --preview` adds `deploy/preview/profile.js` immediately before application startup and writes only `deploy/preview/index.html`. The regular product keeps `quiet-glass-v1`, migration, refresh, sources and imports. The preview uses its own storage key, sanitizes demo links and source status, inserts its banner and guards connection/import/refresh actions (including direct pull-to-refresh and file drop).

## Reproduce

Run `bash deploy/preview/rebuild.sh`. It builds both profiles, checks generated files and produces `upload-code.json` for the connected Cloudflare execute tool. Inspect the existing Worker ownership and execute those arguments to update the same `sill-web-preview`. No credentials are stored in this repository.

Run `CHROMIUM_PATH=/usr/bin/chromium node deploy/preview/verify.cjs` for local preview tests, or append the production URL for public browser validation. `CHROMIUM_PATH` is optional when Playwright's browser is installed. Run `CHROMIUM_PATH=/usr/bin/chromium node tests/stack-browser.cjs` for gesture/width regressions, and set `SILL_TEST_HTML=deploy/preview/index.html` to run against the preview build. Both are included in CI.

## Gesture and reading changes

The old deck dropped pointerdown while a 260ms settling animation was busy, swallowed opposite-direction wheel input in its 160ms momentum guard, and blocked fresh clicks for 350ms after a drag. The regression script reproduces all three failures before the fix. New gestures finish the previous transition exactly once, clear pending wheel state, and accept reversals. Pointer cancellation/lost capture/blur clean up without selecting another card; capture-transfer events from child elements are not mistaken for loss of the deck's capture. Horizontal movement prevents text selection while vertical touch panning remains native.

Desktop preview width increased from 560px to 800px (viewport-clamped); full-reading column max width increased from 680px to 860px. Existing 390px full-width sheet behavior remains. Screenshots include the third card of the six-card 少数派 stack and wider reading views.

## Verification and remaining blocker

Build consistency and JS/inline script checks pass. Original core persistence/migration tests are restored without changing their assertions. Local product browser regression and isolated preview checks are recorded separately. The six new gesture/width scenarios run against both builds. CI status and current deployment version are recorded in PR #18 and deployment-result.json. Local browser results/screenshots and route tests are saved alongside this file.

**Live HTTP and live browser validation remain blocked**, not passed. Workspace Chromium reports `ERR_TUNNEL_CONNECTION_FAILED`; Python reports proxy CONNECT 403; an escalated read-only browser request has the same network failure. A direct DNS check cannot resolve the hostname in this execution environment. The Cloudflare tool's outbound fetch returns `403 Forbidden: requests to sill-web-preview.scs1213-temp-email.workers.dev are not allowed`. Web retrieval likewise reports inaccessible. These observations do not establish an application-side 403 or prove public reachability. No deployment retry or alternate publishing path was used.

Remaining product work: real login/session validation; database schema and ownership/RLS; revision-safe writes; authenticated/scoped MCP; external Webhook integration and delivery evidence; real upstream connections. None is represented as implemented here.
