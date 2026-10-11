# Restricted external-agent access

F07 adds a small operator-configured authorization boundary to the existing single-owner server. It does not create credentials, OAuth grants, users, tenants, or a public deployment. The example is disabled and contains only an environment-variable reference. Never give an external agent the owner token or access to the owner's stdio process.

## Operator configuration

`access.principals` defaults to an empty array. Each principal needs a unique ID, a unique `tokenEnv` reference, explicit tool grants and resource bounds. `enabled` defaults to false. Unknown fields, tool names and wildcards are rejected. The server reads configuration at startup; changing the JSON file or the process environment requires an operator restart. The authorization layer revalidates its current in-memory policy and credential reference on every request/tool call, including existing actors. Disabling a principal or rotating its supplied token invalidates the previous actor on its next operation; it does not undo completed writes.

See `quiet-glass.config.example.json` for a disabled read-only example. Operators must separately approve and provision their own high-entropy secret outside this repository. Tokens must be 32–4096 UTF-8 bytes. No tool can mint, return, reveal or configure credentials. Authentication compares fixed-length SHA-256 digests with `timingSafeEqual`. Duplicate token values, including disabled aliases and collisions with the owner token, fail closed. `owner` and `QG_AUTH_TOKEN` are reserved.

This feature was tested only with synthetic, process-local fixture values. No persistent access has been enabled by the implementation or its tests.

## Finite grants and data bounds

Available grants are `qg_search`, `qg_get_card`, `qg_recommend`, `qg_create_note`, `qg_update_note`, `qg_read_annotation`, `qg_update_annotation`, `qg_feedback`, and `qg_ingest`. Each must be explicitly listed. Annotation update additionally requires annotation read because successful and conflict responses contain the current annotation. Discovery omits unusable annotation-update grants. Generic card responses omit personal annotations without the read-annotation grant.

`resources.sourceIds` is the source allowlist; its empty default grants no cards. Optional `cardIds` further intersects that list: omitting it allows all cards in granted sources, while an explicit empty array allows none. Bounds apply before search/recommend pagination, ranking and totals. A card is inaccessible if any transitive evidence card is missing or outside the same bounds. Direct denied reads and writes do not reveal whether a card exists or expose conflict snapshots.

Local-note creation requires `local-notes` in `sourceIds` and no `cardIds` restriction. Create/update note responses include the full in-bound card, so those write grants also authorize that response. Grants are capabilities, not independent tenant ownership. Principals intentionally given the same sources/cards can access shared records.

External ingestion uses only the existing legacy `qg_ingest` schema. Its `sourceId` must be in both `sourceIds` and `ingestSourceIds`; all target and evidence IDs must be in bounds. `ingestSourceIds` must be a subset of `sourceIds`. Host-assisted provenance ingestion is owner-only in this release. Existing business validation, revision checks and operation semantics still apply. New-note idempotency addresses are namespaced by principal ID, so equal keys from two principals do not collide. Keep principal IDs stable; renaming an identity creates a new idempotency namespace.

Everything else remains owner-only: settings, status, audit, conversations, queued requests and history/context snapshots, AI provider status/start/stream/cancel, connector calls, workflows, prepared actions, host app HTML/resources and briefing prompts. Principals cannot invoke a broad service proxy. Restricted ingestion and local writes never call an external connector or AI provider.

## HTTP and MCP

Send the supplied credential using `Authorization: Bearer …` to the existing loopback server. `/mcp` exposes only the principal's permitted tools, with no owner resources or prompts. Business methods enforce the same authorization after transport dispatch. Unknown and hidden tool names cannot reach owner handlers.

HTTP equivalents use the same services and schemas:

- GET `/api/feed?offset=0`, POST `/api/search`: `qg_search`
- POST `/api/recommend`: `qg_recommend`
- GET `/api/cards/:id`: `qg_get_card`
- POST `/api/notes`, PATCH `/api/notes/:id`: create/update note
- GET/PATCH `/api/cards/:id/annotation`: read/update annotation
- POST `/api/feedback`, POST `/api/ingest`: corresponding grants

Restricted query parameters are strict: only feed offset is accepted. Body validation remains strict. HTTP returns 401 for invalid/revoked credentials, 403 for denied access, 413 for oversized bodies, 429 for rate/concurrency limits, and existing 409 business conflicts. MCP tool errors use `isError` and the existing structured error contract; hidden tools are absent from discovery.

An explicit Authorization header always takes precedence over a browser cookie. An invalid header never falls back to an owner cookie; a restricted header never acquires the cookie's owner privileges. `/api/session` accepts only the owner credential. Restricted credentials cannot create browser sessions. Existing owner browser sessions and owner stdio mode remain trusted full-access operator interfaces, not restricted-agent entry points. No CORS wildcard or network binding expansion is introduced.

## Limits, attribution and operational boundaries

Per-principal limits default to 60 requests/minute, 65,536 request bytes, and 2 concurrent requests. Configurable bounds are 1–600 requests/minute, 256–524,288 bytes, and 1–8 concurrent requests. HTTP body and URL size are checked; direct tool arguments are also checked. MCP transport and tool dispatch share one accounting context rather than charging the same operation twice. Slow request bodies hold their concurrency slot. Limits are per process and reset on restart, not a distributed quota or durable billing guard.

Audit metadata records server-derived `actorId`, `actorKind`, and `transport`, plus operation/outcome for restricted service calls. No credential is copied into these records. Existing write audits retain their business metadata. Authorization-denied requests do not mutate business data; access-denial audit entries are intentional. This is a local single-owner authorization layer, not an Internet-facing identity gateway. Keep existing loopback protections and use an independently reviewed deployment design before any exposure.

Run `node --test tests/access.test.mjs tests/access-protocol.test.mjs` for focused boundaries and `npm test` for the complete backend/core suite. See [verification report](../tests/AGENT-ACCESS-REPORT.md).
