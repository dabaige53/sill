# F11 content/settings backup verification

Base: amended F10 commit `cd0ac1b1a486a5c27b8389e4732ce4eb3af849f5`, tree `17efc03312f48e1829d1cb7a4ea4c3885a0ddb99`.

## Scope and recovery semantics

Owner-only finite plaintext card/annotation/ordinary-settings export, strict versioned canonical checksum, explicit additive/overwrite preview and commit, durable exact-key recovery, atomic failure rollback and guarded immediate undo. Newly added cards remain after undo. Conversations, credentials/configuration, grants, operational/replay history and active schedules/scripts are excluded. Arbitrary user content may still contain sensitive information; the checksum does not authenticate or encrypt it.

Preview discloses transitive visibility under configured source/card permissions and requires explicit acknowledgement. Policy fingerprints use configuration metadata, never credential values; ordinary authentication continues validating credentials normally. Any later ordinary record mutation or access-policy change prevents old undo. Missing settings/annotations are restored to explicit default/empty rows at newer revisions.

## Independent review

Review covered strict schemas and bounds, persisted identities, source provenance, evidence closure, owner-only HTTP/MCP discovery/dispatch, cross-entry idempotency/restart, SQLite mutation epochs across writers, fault rollback, monotonic revisions, changed principal visibility, and browser recovery states.

Findings fixed before publication include a permanently locked browser draft after a definitively rejected retry, stale displayed settings/feed after restoration, undo graphs that would reintroduce missing evidence, and receipt scanning when additions exceed the initial target-card cap. Capacity-boundary checks are included in final verification.

## Verification

`npm run check` passed. Final `npm test` passed 22 core checks and 292 backend tests, zero failures or skips. New coverage comprises 13 format tests, 20 service tests, 13 independent HTTP/MCP protocol checks and 7 browser-state-machine tests. The service suite includes exact 8 MiB graph, 1 MiB receipt and near-16 MiB aggregate reservation boundaries.

Both workflow YAML files parsed successfully, all 33 Actions steps had valid run/uses structure, and every run script passed `bash -n`. The F10 corrected block-scalar pip step is preserved.

All twelve prior actual Chromium suites passed sequentially: live, settings, local content, host simulator, conversations, AI with fake provider, host provenance, recommendation preferences, registered jobs, actual Wasmtime scripts, product/library UI and Storybook. Storybook covered all 94 stories and all 11 browser scenarios at desktop and 390/320 px. No assertion thresholds were relaxed. All runtime fixtures use temporary synthetic databases. No real user data was restored, no persistent credential/grant was created and no production execution setting was activated.

Native MCP App integration is tested with a credential-free host protocol simulator. Actual ChatGPT/Work installation and native-host file-download behavior remain unverified; the interface includes manual JSON copy/paste fallback.

Final actual own-cloud Chromium feature run passed all nine grouped journeys, with zero page errors: bounded file/export/download; strict JSON/checksum rejection; additive conflicts and explicit overwrite/visibility acknowledgement; duplicate gestures and atomic restore/undo; durable lost-response reload/exact-key retry; never-arrived offline request recovery; navigation/draft preservation; responsive layout and optional-module failure; five shared-service tools through the credential-free MCP host simulator. A second final run after capacity review and screenshot additions also passed.

Visually inspected evidence: `tests/artifacts/backups-preview-desktop.png`, `backups-result-desktop.png`, `backups-actions-mobile.png`, plus `backups-desktop.png` and `backups-mobile.png`. Structured results: `tests/artifacts/backups-browser.json`. These generated artifacts are retained by CI rather than committed. Preview shows affected identities/source bounds and explicit acknowledgement; results and mobile controls retain the new-cards-remain undo warning.

All checks were run sequentially without overlapping browser and runtime-heavy backend tests. Final source/build, aggregate and browser results passed; no unresolved review finding remains. Native-host installation remains outside this verification.

## PR13 delayed-return amendment

CI run 38126065207 exposed a real rendering race at `tests/backups-browser.mjs:138`: after commit had reached the server, opening another panel and reopening Settings before the delayed response settled left the new backup section showing its old pending notice. The receipt was saved correctly; rendering was incorrectly tied to the original modal instance. The same settlement guard could strand undo and read-operation busy controls.

The minimal fix reconciles the currently visible backup section after shared state settles. It never opens a panel or replaces draft inputs; stale preview/export/status payload acceptance guards remain unchanged. Deterministic delayed-return tests fail against the original code and pass against the fix. Independent review and the focused UI state-machine suite passed 32/32; the parent’s combined UI/protocol rerun passed 45/45, and `npm run check` passed. No browser timeout or assertion was weakened.

Actual own-cloud Chromium rerun against the amended code passed all nine backup groups, including the originally failing delayed commit → other panel → reopened Settings path. Zero page errors. The host path remains protocol-simulator verification only.
