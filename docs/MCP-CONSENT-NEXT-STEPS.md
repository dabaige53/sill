# Remote Sill MCP: remaining authorization and implementation gates

This is an offline preparation review, not permission to deploy or enable OAuth/MCP. `MCP_ENABLE` stays false; no client, token, grant, hook or production setting has been created. PR23's local skill is not a remote MCP connection.

## Implemented offline in this change

`server/cloud/consent-policy.mjs` validates server-verified consent details against an explicitly configured client, exact callback, owner, resource audience, OIDC identity scope allowlist and separate Sill permission/resource allowlist. It renders an escaped review fragment without loading a client-supplied logo or submitting an active form. Tests cover minimal card-only read, explicitly approved whole-workspace write, owner/client/callback/audience mismatches, auto-redirect rejection, wildcard widening, forbidden deletion/event privileges and presentation injection.

The module is intentionally **not imported by the Worker**. It performs no fetch, token exchange, credential generation, grants or OAuth decisions. It is a policy component for a future route, not a completed OAuth consent service. Inputs named `principal`, `policy` and `grant` must come from trusted server verification/configuration; never pass browser JSON directly to them.

## Minimum decisions to request from the user

1. **Which real Codex client?** Obtain the actual client ID and exact callback URI from the supported Codex flow. Present both for review; do not guess the callback, register a wildcard, enable unrestricted dynamic client registration, or create a secret to bypass the missing client.
2. **What identity information?** Start with `openid` only if the real client supports it. If the client actually requests email/profile/phone, show that separate request and obtain approval; never silently accept Supabase's default email scope.
3. **Which Sill content?** Recommend `content:read` for explicitly selected existing card IDs first. This permits get-by-known-ID, not whole-workspace listing. If listing is necessary, ask explicitly for read access to the entire personal workspace, including future content (`resources=['*']`).
4. **Are writes necessary?** Only request `content:write` if creating/updating is wanted. Selected-card access supports updates to those cards but does not permit creation. Creation requires explicit whole-workspace access under the current contract. No deletion, `event:submit`, `event:read`, result-write or external-source privileges by default.
5. **Approval to configure and enable, later:** separately approve the exact consent route, OAuth client registration, tightly client-bound audience hook and caller grant, followed by tested MCP enablement. Approving this code review or installing a local skill does not authorize those changes. Grants remain until revoked unless a separately implemented expiration policy is approved; token expiry alone is not grant expiry.

## Code and integration work still missing

| Component | Required behavior before enablement |
| --- | --- |
| Real client/callback discovery | Capture the supported host's actual registration and exact callback; verify PKCE S256, state, refresh/revocation and resource parameter behavior. |
| Authenticated `/oauth/consent` route | Fetch current authorization details as the authenticated web owner; bind authorization_id, owner and review snapshot to a short-lived, one-time server-side flow. Preserve only a validated return path across login. |
| Approve/deny controller | POST only, same-origin + CSRF protection; re-fetch details before decision; enforce expiry/replay/race controls. Display identity scopes separately from Sill content permissions. Reject unknown clients and stale changes. |
| SDK/REST adapter | Current pinned auth-js `getAuthorizationDetails`/approve/deny APIs require an SDK session. Existing Sill stores only an HttpOnly access token, no refresh token. Implement and test an access-token-only server adapter to the official endpoints or another documented supported integration; do not invent a refresh token, call setSession with fake values, or expose tokens to the page. |
| Grant persistence/revocation | Current RPCs do not implement user-managed OAuth grant consent. Design a narrow owner-authenticated grant writer/revoker with exact client/audience/scope/resource validation and audit semantics. Approval failure must not leave wider access. Persist consent and grant changes safely; keep legacy tokens/grants from bypassing denial or revocation. No schema migration is performed here. |
| Client-bound audience hook | Only the verified client gets the exact `/mcp` audience; ordinary web sessions must remain `authenticated`. Test real token issuance and PostgREST acceptance. Never relax issuer/audience/client checks to accept generic tokens. |
| Safe provider redirects | After approve/deny, validate the returned redirect against the already reviewed callback before navigation. Handle Supabase's already-consented redirect response without silently granting new Sill permissions. |
| Real acceptance | Real Codex discovery→consent→read, denied calls, resource limits, scope escalation rejection, refresh, revoke, expiration and unknown-client cases; confirm the webpage still uses its existing session. Only then review deployment and enablement. |

## Documentation findings (checked 2026-10-14)

Supabase currently documents only OIDC `openid`, `email`, `profile`, `phone` scopes and says custom scopes are not supported. These identity scopes must **not** be treated as Sill's `content:read/write` database permissions. The latter remain independently enforced by `caller_grants` and RPC/RLS boundaries. See [OAuth flows and available scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).

The provider validates authorization parameters and exposes authorization_id details for consent. Exact client registration and explicit user review remain required. See [MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication). Audience customization is documented via a client-specific access-token hook, but compatibility with this project's real Codex client and PostgREST is still unverified. See [token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).

The lightweight changelog fetch was attempted: browser retrieval rejected its markdown content type and this environment's direct HTTP proxy returned 403. The topic docs above and pinned SDK source were inspected; no undocumented production assumption was used to enable anything.
