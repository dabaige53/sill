# F09 registered jobs verification

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

The implementation contains two fixed, local read-only operations and six owner-only tools. Worker configuration defaults disabled; the example remains disabled. Tests use temporary stores, synthetic credentials/cards, injected clocks and explicit fixture runs. No real user schedule, connector call, AI request, credential grant, deployment or external communication was activated.

## Core and protocol

- `npm run check`: JavaScript/config/example validation.
- `npm test`: 22 core/design checks plus 176 backend tests.
- `tests/jobs.test.mjs`: 24 scheduler cases.
- `tests/jobs-protocol.test.mjs`: 13 independent actual HTTP/MCP/host-adapter cases.

Coverage includes strict operation/config schemas, UTC normalization, shared service authorization, owner/restricted discovery, CAS edits, default-disabled/no-timer behavior, manual paused runs, occurrence coalescing, no overlap, global capacity, durable create/manual idempotency, receipt exhaustion, bounded history/results/input allocation, rollback, safe errors, cross-worker cancel/lease ownership, timeout and backward wall-clock behavior, shutdown cleanup and interrupted restart recovery. Two independent Node processes contend on the same SQLite database for both a scheduled occurrence and a manual key; each case creates exactly one run.

Independent review verified fixes for:

- Same-timestamp pause/resume repeating an already consumed occurrence
- Model-generated summary counting with an original body
- Host adapter query/body validation parity
- Real event-loop yields so cancellation is serviced between bounded work chunks

These fixes retain one-attempt semantics and never blindly retry uncertain outcomes. A different schedule anchor/interval intentionally starts a new schedule series. Existing owner tools retain their names; discovery assertions now account for six added tools (39 total). Restricted principal grants remain unchanged.

## Browser

`npm run test:jobs-browser` uses actual Chromium with the worker disabled, a trusted test-only checkpoint gate for cancellation, real authenticated HTTP/MCP and a protocol-host simulator. It checks paused creation, fixed registry, UTC input, duplicate clicks, response loss/reload with immutable retry keys, explicit manual execution and cancellation, history persistence/pagination, pause/resume CAS, stale navigation, offline/read recovery, escaped bounded output, mobile containment, optional-module failure preserving feed and the credential-free host adapter. Reading/opening/reloading performs no job writes.

The first browser attempt exposed a test-route teardown race; the fixture now drains held route handlers before removal without removing any product assertions. The corrected real-browser journey passes all 13 groups. All ten prior browser suites also pass, including 21 offline product scenarios and Storybook’s 94 stories / 11 scenarios at desktop and 390/320px.

Actual native host installation remains unverified. Screenshots/JSON are generated in `tests/artifacts/` and retained by CI.

## Operational limit

Run/result retention is bounded. The shared existing audit log remains append-only metadata, so total database size is not bounded. The operator-facing documentation states the possible growth and reserves jobs-only audit retention for later operational work; no unrelated audit records are purged.
