# F08 verification

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

This feature adds explicit ordinary preferences to the existing settings record and recommendation rules. It makes no external calls, creates no credentials, and infers no sensitive interests. Existing tool names and old settings snapshots remain compatible.

## Automated checks

- `npm run check`: syntax/config validation.
- `npm test`: source/build verification, 22 core checks, and 139 backend tests.
- Nine new backend tests cover strict bounded preferences, legacy/default snapshots, structural no-ops, one shared CAS revision, atomic audit, restart, reset, explicit call overrides, feedback and explanation rules.
- Nine independent actual HTTP/MCP protocol cases cover concurrent entry points, restart, malformed input, source families, source-diversity explanations, restricted-agent privacy, evidence bounds and host transport.
- Restricted recommendation tests use a sentinel proving the owner settings record is never read for that principal. Temporary request overrides do not persist or expand any source/card/evidence grant.

Independent review found a host bootstrap omission of the new preference group. The validated optional group is now included; the protocol test verifies bootstrap matches current settings. UI review also found and fixed stale preview content after an authoritative preference refresh or Load Latest. Regression tests cover pending and completed previews, while preserving a preview of an unchanged unsent draft. Escaping, draft validation, shared queue, explicit conflict decisions, and late-response guards were checked.

The expanded aggregate exposed a preexisting AI test startup assumption under concurrent CPU-throttled diagnostics. Its child-process READY barrier now uses explicit output events with early-exit reporting and a bounded startup guard instead of a short polling window. Provider execution/timing and all one-call/budget assertions are unchanged.

## Real browser journey

`npm run test:preferences-browser` runs actual Chromium with synthetic cards, authenticated HTTP/MCP and a protocol-host simulator. It verifies server authority, source IDs, explainable read-only preview, unsent-draft reload, shared sort/preference CAS queue, recoverable reset after save/reload, delayed save with newer edits/navigation, cross-entry conflicts, explicit retry, offline/validation preservation, mobile containment, and nonblocking optional-script failure. Host and standalone use separate local draft keys so saving in one entry cannot remove the other's unsent draft. The final check reloads the other entry to prove this.

All nine non-Storybook browser suites passed on the final owner runtime. The preference-specific suite additionally passed after the final preview-race fix.

Actual native host installation remains unverified. The simulator exercises the bundled host UI and real server tools without inheriting host credentials or making external requests.

## Evidence

Screenshots and JSON results are written to `tests/artifacts/` by the browser test and retained by CI. `docs/archive/RECOMMENDATION-PREFERENCES.md` documents defaults, override semantics, score reasons, feedback and privacy boundaries. Reset is staged locally until explicit Save; Undo retains prior draft content.
