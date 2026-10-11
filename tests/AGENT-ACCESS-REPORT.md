# F07 restricted-agent verification

Scope: the existing single-owner server, with a finite external-agent card API. No live credentials, installed host applications, deployment, OAuth grant, external provider call or paid request was used. Tests use isolated temporary stores and synthetic process-local credentials.

## Checks

- `npm run check`: JavaScript, inline pages, plugin/config syntax and disabled example validation.
- `npm test`: 22 core/design checks and 121 backend tests, including all previous features.
- `tests/access.test.mjs`: 12 focused authorization/service tests.
- `tests/access-protocol.test.mjs`: 16 actual loopback HTTP/MCP adversarial cases.
- Final access and legacy protocol rerun: 32/32 after discovery and strict feedback-body polish.

Protocol coverage includes absent/invalid credentials, restricted tool discovery, owner-cookie/bearer precedence, session rejection, unknown routes/tools, owner-only context/resource/prompt/status/AI/connector/workflow paths, strict scope enforcement, source/card intersections, transitive evidence, scope-safe conflicts, concurrent principal attribution and idempotency, revocation/rotation and credential collisions, rate/size limits, and a real slow request body holding its concurrency slot. Denied calls are checked for business-state nonmutation.

An independent security review found an annotation disclosure via update-only grants: conflict and partial-update responses could expose existing notes. Fixed by requiring the explicit read-annotation grant before any annotation update and omitting unusable update tools from discovery. Stale, no-op and partial-update paths are covered. Review also checked opaque actor identity, fixed-size constant-time credential comparison, scoped service facades and server-derived audit attribution.

## Owner browser compatibility

All nine browser suites passed: provenance, AI, conversations, live integration, host simulator, local content, settings, offline product (21 scenarios), and Storybook (94 stories / 11 scenarios).

All browser checks use actual system Chromium in the assistant's own cloud computer, against loopback fixture servers. They do not establish a real ChatGPT host installation. Coverage preserves existing provenance import/rendering, fake-provider AI, conversation recovery, connected feed, simulated host adapter, content editing/draft recovery, ordinary settings, offline product and Storybook behavior.

No new browser login flow is introduced for restricted principals; they intentionally cannot become owner UI sessions. HTTP/MCP tests exercise their actual supported entry points.

## Limits

This is not multi-tenant IAM or a public gateway. Shared source grants mean shared records. Request counters are process-local and reset on restart. Config-file changes require operator restart. Owner stdio, owner bearer and owner browser sessions remain privileged. No real access has been provisioned; production secret handling and deployment require separate operator review.
