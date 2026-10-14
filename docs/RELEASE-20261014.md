# Sill release — 2026-10-14

Production: https://sill-web-preview.scs1213-temp-email.workers.dev/

This release integrates the authenticated web implementation (#19/#20), restored original Sill UI (#22), local CI and installable local plugin (#24/#23), and disabled consent preparation (#25/#26). #18's card gesture and reader-width fixes are retained in the UI code; its standalone synthetic preview is not deployed as the authenticated product. The separate local stdio MCP experiment (#21) is not required or activated.

## Product behavior

The original welcome, card typography, reader and glass dock remain the main interface. There is no top account/icon row or reserved header space. Capture/refresh use the existing bottom dock; sign-out lives under Settings → Data/privacy. Anonymous visitors see the welcome/login entry, not invented account cards or connected sources. Existing Supabase sessions use the same secure cookie and origin. Login resend is protected on the server for 60 seconds as well as in the UI; callback failure does not discard an existing session.

The release does not apply SQL, recreate the owner, enable public/anonymous signup, send login emails, register an OAuth client or change upstream credentials. All four existing migrations and owner bootstrap remain as deployed. The two OAuth SQL files are preparation only and must not be applied as part of this release.

## Reproduce and install

Node 24 and Python 3 are required for source validation:

```sh
npm ci
npm test
npm run test:supabase
npm run test:oauth
npm run test:supabase:postgres
npm run build:release
```

The committed `deploy/releases/20261014/worker.mjs` is the minified, self-contained Worker built from this release. `manifest.json` records its SHA-256. No credentials are embedded. Wrangler 4.151.0 is pinned; `deploy/cloud/wrangler.production.jsonc` identifies the existing Worker and preserves existing variables. Deployment uses version upload with strict inherited bindings followed by an explicit 100% deployment; it does not create a Worker or modify routes, log settings or database resources.

After this release reaches main, the local plugin installs from a clean checkout without a build:

```sh
codex plugin marketplace add dabaige53/quiet-glass
codex plugin add quiet-glass@quiet-glass-local
```

The marketplace points to the committed `plugins/quiet-glass` directory. Its skill uses a relative bundled CLI. This is a local card skill, not a cloud Sill connection. Successful installation does not grant access to the user's cloud cards.

## Validation and limits

Local core/package tests, authenticated API boundaries, OAuth controller/policy tests, isolated Postgres privilege/concurrency tests, desktop and 390×844 Chromium UI tests, consent browser tests, local UI and accessibility checks passed before release. Existing walkthrough evidence is under `docs/validation/cloud-ui-no-header-20261014/`; it uses labeled synthetic fixtures, not production account data. Chromium mobile emulation is not physical iPhone Safari validation. No current owner session is available to this task; a real successful login must not be inferred from fixture results.

The execution environment and connector reject HTTP access to this workers.dev origin with an access-policy 403. Management API deployment/configuration evidence is available, but this is not equivalent to an HTTP or owner-session production smoke test.

## Rollback and protected configuration

Pre-release live version: `ef98596d-d18e-4622-9ff7-1aec7e41cade` (100%), deployment `71459714-1763-4f6d-9e5b-8f754630772f`.

To roll back code, create a Cloudflare Worker deployment for that version at 100% (or use `wrangler rollback ef98596d-d18e-4622-9ff7-1aec7e41cade -c deploy/cloud/wrangler.production.jsonc`). First inspect current deployment to avoid overwriting a subsequent release. No database rollback is needed or intended. Preserve APP_ORIGIN, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and MCP_ENABLE. Never print their sensitive values in deployment logs.

MCP_ENABLE remains `false`; AGENT_AUDIENCE and OAUTH_CONSENT_ENABLE remain unset. OAuth/client setup and durable grants require separate approval and a real exact Codex callback/client. Suggested first review scope is selected-card read access; all-card reads, create/update/delete and upstream tool delegation require explicit scope agreement. No MCP cloud connection is claimed in this release.
