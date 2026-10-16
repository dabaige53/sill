# Registered WebAssembly scripts v1

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

Sill can explicitly run two reviewed, pinned WebAssembly modules: `integer-stats@1.0.0` and `bounded-echo@1.0.0`. This is a small JSON transformation ABI, not general JavaScript, Python, shell, connector automation, or a code-upload service. It is owner-only and disabled by default. F09 schedules cannot invoke these modules.

## Installation and operator control

The SQLite data directory must be local to one Linux host; shared cross-host/NFS deployment is unsupported. Concurrency fencing covers processes on that host, not a distributed cluster. The first supported runtime is Linux x86_64, Python 3.12 and `wasmtime==49.0.0`. The dependency is pinned by version and official PyPI wheel SHA-256 in `requirements-sandbox.txt`:

```sh
python3 -m venv .sandbox-venv
.sandbox-venv/bin/python -m pip install --require-hashes --only-binary=:all: -r requirements-sandbox.txt
```

The example configuration keeps `scripts.enabled: false`. Only an operator editing the server configuration can enable it. Ordinary settings, external principals, model output, MCP tools and the UI cannot enable execution or change the registry. A trusted absolute `scripts.pythonPath` may select the installed interpreter. Configuration is trusted deployment input, never a request parameter. Missing runtime, wrong version, unsupported platform, or unavailable hard limits fail closed. Installing the dependency alone does not activate any job.

## Boundaries and limitations

Each invocation launches a fresh Python process with a clean environment, private temporary working directory and bounded pipes. Before loading Wasmtime or compiling guest bytes, the wrapper applies Linux hard address-space, CPU, file-size, open-file and core-dump limits. The parent enforces wall time, caps combined process output, kills the child process group on timeout/cancel, arms Linux parent-death SIGKILL with a startup parent-identity check, and waits for process closure before removing its working directory.

The guest capability boundary is WebAssembly with **zero imports**: no WASI, linker, host callbacks, filesystem, network, environment, process or database APIs. The trusted Python process itself is not an OS filesystem/network sandbox. This design does not claim protection from a compromised runtime/compiler or native-code vulnerability. It does not rely on Node `vm`, Node permissions, worker threads or unavailable Linux namespaces as malicious-code isolation.

Hard ceilings are 256 KiB module bytes, 16 KiB JSON input, 32 KiB JSON output, nesting depth 32, 1,000,000 fuel, 16 MiB guest memory, 512 MiB process virtual address space, two CPU seconds and two seconds wall time. Operator limits may only lower these ceilings. Fuel covers guest execution; parent wall time and process limits also cover runtime startup and compilation. No persistent memory or instance is reused across invocations.

## Extension contract: qg-json-v1

There is no registration/upload API. Adding a module is a reviewed repository change: include its readable source and compiled artifact, exact ID/version/SHA-256, strict input/output schemas and tests in the finite registry. The registered digest is checked before execution. Changing bytes requires a new reviewed version and digest.

A module must be Wasm binary version 1 with no imports, start section or tables. It must export exactly:

- `memory`: one non-shared wasm32 memory with a declared finite maximum within the configured memory budget
- `qg_alloc(i32 byteLength) -> i32 pointer`
- `qg_run(i32 pointer, i32 byteLength) -> i64 result`

Input is canonical UTF-8 JSON. The allocator returns an in-bounds range where the wrapper writes it. The result packs the unsigned output pointer in the high 32 bits and unsigned length in the low 32 bits. Signed i64 results are interpreted as the same unsigned bit pattern. Pointer/length arithmetic is checked before reading; malformed UTF-8, duplicate keys, non-finite or unsafe integer values, oversized/deep JSON and schema violations fail. Guest strings and output are untrusted data and are displayed as text.

`integer-stats` accepts a strict `{values:[...]}` object with at most 1,000 integers in [-1,000,000, 1,000,000]. `bounded-echo` accepts strict `{text:"..."}` up to 1,024 UTF-16 code units. Neither receives workspace cards, credentials or ambient data.

## Shared HTTP and MCP contracts

All routes require the existing owner authentication. Restricted principals cannot discover or call these tools, including through the host resource adapter.

| MCP tool | HTTP | Input |
| --- | --- | --- |
| `qg_list_scripts` | GET `/api/scripts` | `{}` |
| `qg_run_script` | POST `/api/script-runs` | `{scriptId,version,parameters,idempotencyKey}` |
| `qg_get_script_run` | GET `/api/script-runs/:runId` | `{runId}` |
| `qg_list_script_runs` | GET `/api/script-runs?limit=20&offset=0` | bounded pagination |
| `qg_cancel_script_run` | POST `/api/script-runs/:runId/cancel` | `{runId}` in MCP; empty HTTP body object |

Discovery reports `enabled`, safe `runtimeAvailability`, and the finite registry. Disabled discovery does not launch the runtime. Invocation returns a durable run snapshot; read/poll for terminal `completed`, `failed`, `cancelled`, `timed_out` or `interrupted` status. Reads never execute or retry. Input/version are bound to the idempotency key in the same transactional claim as the run/audit. Identical retries return the existing invocation; changed payloads conflict. Receipts are not silently evicted to permit re-execution. If retained output has been pruned, the same key reports that fact rather than starting again.

There is no automatic retry after timeout, cancellation, interruption or uncertain response. The UI persists the immutable attempted request before sending, and offers explicit same-key recovery after reload. Restart/expired lease recovery marks abandoned work interrupted. Cross-process leases and execution reservations prevent duplicate claims and overlapping reuse while cancellation drains. A wall-clock jump cannot release a reservation. Normal release follows actual child closure; crash recovery requires recorded Linux boot/PID/start-time identities to prove both owner and dispatched child are gone. An unreadable or different PID namespace (including a changed namespace after reboot), or crash in the spawn-to-identity-persistence gap remains reserved and fails closed for operator review. A stale lease alone never proves process exit. A parent killed before its cleanup runs can leave an empty private temporary directory; guests cannot write files there. History/output are bounded; shared audit remains append-only as described in REGISTERED-JOBS.md.

## Verification and evidence

Tests use only bundled/synthetic fixtures and temporary databases. The runtime suite runs real Wasmtime, including hostile imports/start functions, malformed ABI/output, infinite loops, memory exhaustion, cancellation and cross-run isolation. Protocol tests exercise actual authenticated HTTP/MCP and denied restricted principals. Browser tests exercise explicit invocation, reload/recovery and escaped output. No production configuration, token or schedule is activated by tests.

Official references: [Wasmtime security](https://docs.wasmtime.dev/security.html), [fuel/interrupting execution](https://docs.wasmtime.dev/examples-interrupting-wasm.html), [Python API](https://bytecodealliance.github.io/wasmtime-py/), [pinned PyPI release](https://pypi.org/project/wasmtime/49.0.0/), [Linux resource limits](https://man7.org/linux/man-pages/man2/getrlimit.2.html).
