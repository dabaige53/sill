# F10 registered WebAssembly v1 verification

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

Base: F09 commit `7e8988a194d55bf5f1a49558cd96139e51a35761`, tree `ef0ec1e5905be94ecd13850828b47e6340ec1329`.

## Scope

Two fixed reviewed/versioned JSON-transform modules; owner-only shared HTTP/MCP service; persisted invocation receipts/history; explicit run/cancel UI. Default disabled. Linux x86_64, Python 3.12, official hash-pinned Wasmtime 49.0.0. No uploaded code, arbitrary paths, WASI/imports, credential grants, external services, scheduler integration or production activation.

## Security review

Independent review covered the actual wrapper, supervisor, registry, durable service, all transport routes and documentation. Findings were fixed before publication:

- Unsafe integral floating-point JSON outputs and array getters rejected
- Enabled runtime probes coalesced/cached instead of unbounded spawning
- Host pagination rejected before dispatch
- Returned public snapshots detached from deferred execution data
- Process reservations use verified boot/PID namespace/start-time identity, never elapsed wall time as proof of exit
- Parent-death SIGKILL armed with pre/post parent check
- Cancellation waits for child closure before normal capacity release; unknown crash identity remains fail-closed
- Previously ambiguous UI receipts survive later pre-lookup rejection, avoiding duplicate execution after operator changes

The reviewed threat model is a capability-free Wasm guest, not protection against trusted native runtime vulnerabilities or a native filesystem/network sandbox. See docs/archive/REGISTERED-WASM.md for the rare reserved-slot crash gap and empty-directory cleanup limitation.

## Test evidence

`npm run check` passed. `npm test` passed: 22 core tests and 239 backend tests, zero failures/skips, using bounded test-file concurrency. New backend coverage is 21 runtime + 26 durable service + 16 independent protocol tests. Actual Wasmtime is required on the supported platform; CI installs the hash-pinned runtime and cannot silently skip verification.

Ten prior browser suites passed: registered jobs, recommendation preferences, host provenance, AI, conversations, live integration, host simulator, local content, settings and standalone product/library checks. Final feature and Storybook evidence is recorded below.

Runtime adversarial coverage: registry identity/reproducibility, imports/WASI/start/functions/memory validation, exact ABI, pointer arithmetic, UTF-8/JSON/number/depth/bytes, fuel loop, memory growth, lower process memory, bounded pipes, wall timeout, cancellation/closure, parent death and cross-run memory isolation.

Service/protocol coverage: disabled and unavailable states; strict finite parameters; owner-only discovery/invocation; no settings/access grant; actual outputs and runtime identity; exact request idempotency; concurrent workers; cancellation/late result; restart; clock jumps; verified and uncertain process death; bounded history and receipts; audit attribution without payload/key/path exposure.

Browser coverage: no page-open writes, finite module choices/version/hash, local validation, per-module drafts, actual stats/echo, escaped output, duplicate gesture, lost-response reload/same-key retry, stale navigation, offline/read failure, cancellation, timeout, fuel exhaustion, unavailable runtime, pagination/mobile and nonblocking optional module failure. MCP App checks use a protocol simulator and do not certify installation in a real host.

An initial concurrently oversubscribed run made several real 2-second sandbox calls time out safely. Integration test-file concurrency is now explicitly one; subsequent backend and browser suites run sequentially. Product sandbox budgets and assertion thresholds were not increased. Storybook navigation also timed out in a later sequential run; baseline comparison and final status are recorded below rather than attributing all failures to contention.

Final actual Chromium feature run: 14 grouped checks passed, no page errors. Includes the post-review ambiguous-receipt regression. Verified screenshots: `tests/artifacts/scripts-desktop.png`, `scripts-mobile.png`, `scripts-result-desktop.png`; structured results: `tests/artifacts/scripts-browser.json`. Artifacts are generated locally/retained by CI rather than committed.

Post-review namespace regression verifies that missing/denied/mismatched PID namespace evidence cannot release a slot, including simultaneous boot-ID mismatch. Final aggregate rerun after this fix: 22 core + 239 backend tests passed, zero skips.

Storybook baseline comparison: F09 and F10 `.storybook/`, `src/`, `stories/`, built Storybook assets and `tests/storybook.cjs` are byte-identical. The F09 baseline passed all 94 stories and 11 scenarios in the same cloud Chromium environment. A fresh final F10 run follows the final backend run without overlap.

Final F10 Storybook run passed: 94 stories and all 11 browser scenarios, including both 390px and 320px full inventories. No Storybook source/test threshold change was needed. Earlier transient navigation failures are retained in this report; the passing final run followed the identical baseline comparison and isolated execution. All eleven prior browser suites and the new fourteen-group feature suite have passing results.
