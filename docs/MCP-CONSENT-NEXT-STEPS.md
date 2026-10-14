# Remote Sill MCP: disabled consent implementation and enablement gates

This branch implements an **offline-tested, default-disabled** consent flow. It is not a production connection or deployment. No production schema, client, hook, grant or setting was changed. `MCP_ENABLE` remains false; the local plugin in PR23 is independent of this remote service.

## Implemented

- Cookie-authenticated `/oauth/consent` fetches current authorization details from the provider. Unknown clients, owner mismatches, already-approved redirect-only responses, scope/resource widening and non-exact callbacks fail closed.
- Login preserves a bounded, ten-minute authorization ID in an HttpOnly cookie and resumes only the same-origin consent route after the existing SDK PKCE callback. Login does not approve access or replace a valid session on callback failure.
- Review shows identity scopes separately from Sill content scopes/resources. Approve/deny are same-origin POST forms with one-time, database-backed, hashed CSRF/browser proofs. Provider details and policy are rechecked before decision. No token or authorization code is persisted in flows/audit or embedded in HTML.
- The adapter uses the pinned provider's official access-token endpoints: GET `/oauth/authorizations/{id}`, POST `.../{id}/consent`, DELETE `/user/oauth/grants?client_id=...`, under `/auth/v1`. It does not manufacture a refresh token or expose a service key. Fetches have a timeout, response-size bound and redirect rejection.
- A narrow owner-authenticated RPC persists reviewed grants only after a confirmed provider response and exact callback validation. Database row locks serialize competing instances. Expired, changed and replayed flows reject; ambiguous provider responses are not retried. Flows are capped at 32 per owner/ten minutes.
- `/oauth/grants` revokes the selected local grant before calling the provider. Failure of upstream revocation is shown explicitly, can be retried with a new form, and never restores local access. Revocation wins against in-flight approval. Browser and other-client sessions remain untouched.
- Consent-managed grants require an issuer-stamped `sill_consent_version`. The draft hook binds it immutably to the provider's OAuth `session_id`; refresh cannot upgrade an old session to a later consent version. Missing/old versions, pre-hook refresh sessions, revoked grants and reused old sessions fail closed. Ordinary web and unrelated client claims/audience remain unchanged.

`supabase/drafts/sill_v1_oauth_consent.sql` and `sill_v1_oauth_token_hook.sql` are **review drafts**, after the existing four drafts. Neither was applied to Supabase. The latter defines a hook function but does not register it. Both use separate NOLOGIN/NOBYPASSRLS executor roles, no executor table ownership, no raw authenticated table access and fixed-search-path functions. Only `supabase_auth_admin` may invoke the issuer hook. Tests create its NOLOGIN stand-in in isolated databases only.

## Verification

`npm run test:oauth` runs policy and actual-SQL/controller/provider negative tests. `npm run test:supabase:postgres` also installs both drafts with a NOSUPERUSER installer on PostgreSQL 17 and checks concurrent claim/revoke, ACLs and rollback. `npm run test:oauth-browser` exercises desktop 1440×1000 and iPhone12-sized 390×844 review, keyboard focus, deny, approve, revoke and cookie preservation against a **synthetic provider**. It does not connect Codex or send email.

Existing authenticated-data and cloud-browser tests remain in CI. Browser screenshots are `tests/artifacts/oauth-*-review.png`. SQL/provider tests cover CSRF, incorrect origin/browser/owner/client, expired and duplicate forms, malformed body, changed policy, callback injection, provider failures/lost response, replay, old-token reactivation, unknown refresh sessions and default-disabled routes.

## Decisions and real-environment gates still required

1. Obtain the real Codex client ID and exact callback from its supported flow. Review both; no guessed callback, wildcard registration or unrestricted dynamic registration. Verify PKCE S256, state, resource parameter, code expiry and one-time redemption with that client.
2. Approve identity disclosure separately. Supabase documents only OIDC `openid`, `email`, `profile`, `phone`; custom content scopes are not provider scopes. Prefer `openid` only if supported, and explicitly review any actual email/profile/phone request.
3. Approve Sill scope/resources. Recommended initial grant is `content:read` for selected existing card IDs. This allows known-ID reads, not workspace listing. `resources=['*']` includes all current/future workspace content; creation requires it. Writes need separate explicit approval. No delete, event-submit/read, result-write or source privileges are offered.
4. Review/install the two new SQL drafts **only after separate authorization**, preserving the original four migrations and owner bootstrap. Configure an owner/client policy row with `enabled=false` first. No credential is generated by this change.
5. Separately approve and register the tightly client-bound hook. Verify actual provider hook events use the documented `oauth_provider/authorization_code`/`token_refresh` methods, stable refresh `session_id`, issuer claims and custom audience accepted by PostgREST. Unknown event methods fail closed for managed tokens. Confirm upstream revocation invalidates outstanding codes and refresh tokens, including response-loss and revoke→reconsent scenarios. Synthetic tests cannot establish those provider guarantees.
6. Enable consent only with reviewed matching `OAUTH_CONSENT_ENABLE=true`, `OAUTH_CLIENT_IDS` JSON UUID list, database policy and `AGENT_AUDIENCE=<APP_ORIGIN>/mcp`. Missing/incomplete configuration returns 503; database absence also fails closed. `MCP_ENABLE` is a separate gate and stays false during consent review.
7. Run real Codex discovery→login→review→deny/approve→least-privilege read, escalation rejection, refresh, revoke, expiration and unknown-client acceptance. Verify existing webpage login remains usable. Only then coordinate production deployment/enablement with the parent task to avoid overlapping Worker updates.

Grants persist until revoked; token expiry is not grant expiry. Immutable session bindings must be retained while any old provider refresh session might exist; do not prune them merely because an access token expired. No automated retention/job is included. If provider delivery is ambiguous, return to review/revocation rather than repeating a consumed action.

## Sources checked 2026-10-14

[OAuth flows/scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [token security and client-bound audience](https://supabase.com/docs/guides/auth/oauth-server/token-security), [custom access-token hook inputs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook). Pinned `@supabase/auth-js` source confirms REST routes and decision shapes. These references inform the implementation; real-provider compatibility remains an explicit acceptance gate.
