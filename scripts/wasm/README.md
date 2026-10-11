# Bundled Wasm fixtures

Only `integer-stats@1.0.0` and `bounded-echo@1.0.0` are registered. Their reviewed
WAT source and reproducible text-safe `.wasm.b64` artifacts are committed together.
`server/wasm-registry.mjs` pins each artifact's SHA-256. Runtime requests cannot
supply a path, URL, source text, binary module, interpreter, host callback or import.

Reproduce and compare artifacts with the pinned local runtime:

```sh
.sandbox-venv/bin/python -I scripts/wasm/build-fixtures.py --check
```

## qg-json-v1

- Exactly three exports: `memory`, `qg_alloc(i32) -> i32`, and
  `qg_run(i32, i32) -> i64`.
- Exactly one non-shared wasm32 memory, with an explicit finite maximum.
- No imports (including WASI), tables or binary start section. No linker is used.
- The host sorts input object keys and encodes compact UTF-8 JSON. It calls
  `qg_alloc(inputLength)`, bounds-checks the returned unsigned pointer, copies the
  bytes, then calls `qg_run(pointer, inputLength)`.
- `qg_run` packs an unsigned output pointer in the high 32 bits and byte length in
  the low 32 bits. Both are checked before reading. Output is strict UTF-8 JSON;
  duplicate keys, invalid Unicode, nonfinite numbers, unsafe integers and excessive
  depth are rejected. Parsed values are returned in the bounded result envelope.
- `integer-stats` accepts only `{values: integer[]}` with at most 1,000 elements,
  each between -1,000,000 and 1,000,000. It returns `count`, `sum`, `min` and `max`;
  `min`/`max` are null for an empty array. Every sum fits a signed i32.
- `bounded-echo` accepts only `{text: string}` with at most 1,024 UTF-16 code units
  (matching browser and service validation) and returns it unchanged.

## Boundary and limits

This is a capability-free **Wasm guest boundary**, plus a separately supervised,
resource-limited Linux x86_64 process. It is not a filesystem/network namespace,
seccomp container, or isolation guarantee against a native engine vulnerability.
The pinned Python interpreter and Wasmtime engine are trusted host code.

Each invocation gets a fresh isolated-mode Python process, empty private working
directory, scrubbed environment and only its stdin/stdout/stderr pipes. Before
importing Wasmtime or compiling, the child applies and verifies hard Linux
`prlimit` ceilings: 512 MiB address space, 2 CPU seconds, zero file output,
32 file descriptors and zero core dumps. It arms process-local parent-death
SIGKILL and verifies the expected parent PID before and after registration.
Unsupported platforms or unavailable limits fail closed.

Guest limits are 1,000,000 fuel, 16 MiB memory, zero tables and one instance.
Module/input/output ceilings are 256/16/32 KiB; JSON depth is 32. The parent caps
combined process output at 64 KiB and wall time at 2 seconds, kills the process
group on timeout/cancellation, and waits for close before settling the promise
and deleting its private directory. All configurable limits can only decrease.
A hard-killed parent cannot delete its empty directory; parent-death SIGKILL still
terminates the child, and durable invocation recovery is handled by the service.

Wasmtime's initial memory reservation is explicitly 16 MiB (or a lower guest
limit), with zero reservation growth and zero guard reservation. Bounds checks
remain enabled. The standard multi-GiB reservation is never used to bypass the
finite address-space limit.
