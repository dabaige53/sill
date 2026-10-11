#!/usr/bin/env python3
"""One request per process. This is a Wasm guest boundary, not native OS isolation.

No WASI, linker, imports, host callbacks, deserialization, or ambient guest APIs.
The Linux process has hard resource limits before Wasmtime is imported/compiled.
"""
import os
import sys

# Do not load third-party Python packages or guest input until limits are active.
try:
    if sys.platform != "linux" or os.uname().machine != "x86_64":
        raise RuntimeError("Linux x86_64 resource limits required")
    import resource
    if not hasattr(resource, "prlimit"):
        raise RuntimeError("prlimit required")
    HARD = {
        resource.RLIMIT_AS: 512 * 1024 * 1024,
        resource.RLIMIT_CPU: 2,
        resource.RLIMIT_FSIZE: 0,
        resource.RLIMIT_NOFILE: 32,
        resource.RLIMIT_CORE: 0,
    }
    for kind, bound in HARD.items():
        old = resource.prlimit(0, kind)
        cap = min(bound, old[1]) if old[1] != resource.RLIM_INFINITY else bound
        resource.prlimit(0, kind, (cap, cap))
        if resource.prlimit(0, kind) != (cap, cap):
            raise RuntimeError("resource limit was not applied")
    os.closerange(3, 65536)
    os.umask(0o077)
    # A parent crash must not leave a detached runner alive. PR_SET_PDEATHSIG is
    # process-local and does not change host security or global configuration.
    # The expected PID closes the race where the parent died before registration.
    import ctypes
    if len(sys.argv) != 3 or sys.argv[1] != "--parent-pid":
        raise RuntimeError("Expected parent identity required")
    expected_parent = int(sys.argv[2])
    if expected_parent <= 1 or os.getppid() != expected_parent:
        raise RuntimeError("Parent changed during startup")
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [ctypes.c_int, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_ulong]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(1, 9, 0, 0, 0) != 0 or os.getppid() != expected_parent:
        raise RuntimeError("Parent-death kill could not be armed")
except Exception:
    sys.stdout.write('{"ok":false,"error":{"code":"RUNTIME_UNAVAILABLE","message":"Linux hard resource limits unavailable"}}\n')
    sys.exit(1)

import base64
import hashlib
import importlib.metadata
import json
import math
import time

VERSION = "49.0.0"
ABI = "qg-json-v1"
LIMITS = {"fuel": 1000000, "memoryBytes": 16777216, "inputBytes": 16384,
          "outputBytes": 32768, "moduleBytes": 262144, "jsonDepth": 32,
          "wallMs": 2000, "processMemoryBytes": 536870912}


class Rejected(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def reject(code, message):
    raise Rejected(code, message)


def strict_object(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            reject("INVALID_JSON", "Duplicate JSON keys are not permitted")
        obj[key] = value
    return obj


def invalid_constant(_):
    reject("INVALID_JSON", "JSON numbers must be finite")


def valid_json(value, depth=0, maximum=32):
    if depth > maximum:
        reject("INVALID_JSON", "JSON nesting limit exceeded")
    if isinstance(value, float) and (not math.isfinite(value) or (value.is_integer() and abs(value) > 9007199254740991)):
        reject("INVALID_JSON", "JSON numbers must be finite and integers exactly representable")
    if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 9007199254740991:
        reject("INVALID_JSON", "JSON integers must be exactly representable")
    if isinstance(value, str):
        try:
            value.encode("utf-8", errors="strict")
        except UnicodeError:
            reject("INVALID_JSON", "JSON strings must contain valid Unicode")
    elif isinstance(value, list):
        for item in value:
            valid_json(item, depth + 1, maximum)
    elif isinstance(value, dict):
        for key, item in value.items():
            valid_json(key, depth + 1, maximum)
            valid_json(item, depth + 1, maximum)


def loads(data, maximum=32):
    try:
        value = json.loads(data, parse_constant=invalid_constant, object_pairs_hook=strict_object)
        valid_json(value, maximum=maximum)
        return value
    except Rejected:
        raise
    except (ValueError, UnicodeError, RecursionError, OverflowError):
        reject("INVALID_JSON", "Guest output must be finite UTF-8 JSON")


def u32(data, position, end):
    value = 0
    for shift in range(0, 35, 7):
        if position >= end:
            reject("INVALID_MODULE", "Truncated Wasm section")
        byte = data[position]
        position += 1
        if shift == 28 and byte > 15:
            reject("INVALID_MODULE", "Invalid Wasm integer")
        value |= (byte & 127) << shift
        if not byte & 128:
            return value, position
    reject("INVALID_MODULE", "Invalid Wasm integer")


def preflight(data, limits):
    if len(data) > limits["moduleBytes"] or data[:8] != b"\0asm\x01\0\0\0":
        reject("INVALID_MODULE", "Expected a bounded Wasm v1 binary")
    p, memories = 8, 0
    while p < len(data):
        section = data[p]
        size, p = u32(data, p + 1, len(data))
        end = p + size
        if end > len(data):
            reject("INVALID_MODULE", "Truncated Wasm section")
        if section == 8:
            reject("FORBIDDEN_START", "Start sections are forbidden")
        if section in (1, 2, 3, 4, 5, 6, 7):
            count, q = u32(data, p, end)
            if section == 2 and count:
                reject("FORBIDDEN_IMPORT", "All imports, including WASI, are forbidden")
            if section == 4 and count:
                reject("FORBIDDEN_TABLE", "Tables are not supported by this ABI")
            if section in (1, 3, 6) and count > 128:
                reject("INVALID_MODULE", "Wasm declaration limit exceeded")
            if section == 7 and count != 3:
                reject("INVALID_ABI", "Exactly memory, qg_alloc, and qg_run must be exported")
            if section == 5:
                if count != 1:
                    reject("INVALID_ABI", "Exactly one memory is required")
                flags, q = u32(data, q, end)
                if flags != 1:
                    reject("INVALID_ABI", "Memory must be non-shared wasm32 with a maximum")
                minimum, q = u32(data, q, end)
                maximum, q = u32(data, q, end)
                if minimum > maximum or maximum * 65536 > limits["memoryBytes"] or q != end:
                    reject("MEMORY_LIMIT", "Module memory exceeds the allowed bound")
                memories += 1
        p = end
    if memories != 1:
        reject("INVALID_ABI", "Exactly one bounded memory is required")


def configuration(wt, limits):
    c = wt.Config()
    c.consume_fuel = True
    c.parallel_compilation = False
    c.cranelift_opt_level = "none"
    # Disable proposals not used by this deliberately small ABI.
    for name in ("wasm_threads", "wasm_gc",
                 "wasm_simd", "wasm_relaxed_simd", "wasm_multi_memory", "wasm_memory64",
                 "wasm_component_model", "wasm_exceptions", "wasm_tail_call", "wasm_stack_switching"):
        setattr(c, name, False)
    c.shared_memory = False
    c.gc_support = False
    c.max_wasm_stack = 262144
    # Default Wasmtime reservations are multi-GiB. Keep every reservation inside
    # the finite process RLIMIT_AS, and retain explicit generated bounds checks.
    c.memory_reservation = limits["memoryBytes"]
    c.memory_guard_size = 0
    c.memory_reservation_for_growth = 0
    c.memory_may_move = False
    c.memory_init_cow = False
    return c


def check_abi(wt, module):
    if module.imports:
        reject("FORBIDDEN_IMPORT", "All imports, including WASI, are forbidden")
    exports = {entry.name: entry.type for entry in module.exports}
    if set(exports) != {"memory", "qg_alloc", "qg_run"}:
        reject("INVALID_ABI", "Exactly memory, qg_alloc, and qg_run must be exported")
    mem = exports["memory"]
    if not isinstance(mem, wt.MemoryType) or mem.is_64 or mem.is_shared or mem.limits.max is None:
        reject("INVALID_ABI", "Expected bounded non-shared wasm32 memory")
    for name, params, results in (("qg_alloc", ["i32"], ["i32"]), ("qg_run", ["i32", "i32"], ["i64"])):
        ty = exports[name]
        if not isinstance(ty, wt.FuncType) or list(map(str, ty.params)) != params or list(map(str, ty.results)) != results:
            reject("INVALID_ABI", "Guest function signatures do not match qg-json-v1")


def process(request):
    limits = dict(LIMITS)
    supplied = request.get("limits", {})
    if not isinstance(supplied, dict):
        reject("INVALID_LIMIT", "Invalid runtime limits")
    for key, value in supplied.items():
        if key not in limits or type(value) is not int or value <= 0 or value > limits[key]:
            reject("INVALID_LIMIT", "Limits can only be lowered within hard ceilings")
        limits[key] = value
    if limits["processMemoryBytes"] != LIMITS["processMemoryBytes"]:
        # This is host configuration only. Apply a lower requested AS before import.
        resource.prlimit(0, resource.RLIMIT_AS, (limits["processMemoryBytes"], limits["processMemoryBytes"]))
    try:
        if importlib.metadata.version("wasmtime") != VERSION:
            reject("RUNTIME_UNAVAILABLE", "The exact pinned Wasmtime version is required")
        import wasmtime as wt
    except (ImportError, importlib.metadata.PackageNotFoundError):
        reject("RUNTIME_UNAVAILABLE", "Install the pinned requirements-sandbox.txt runtime")
    engine = wt.Engine(configuration(wt, limits))
    if request.get("operation") == "probe":
        return {"runtime": "wasmtime-py", "version": VERSION, "abi": ABI,
                "limits": limits, "resourceLimits": {str(k): list(resource.prlimit(0, k)) for k in HARD}}
    try:
        data = base64.b64decode(request.get("module", ""), validate=True)
    except (ValueError, TypeError):
        reject("INVALID_MODULE", "Invalid Wasm encoding")
    preflight(data, limits)
    try:
        module = wt.Module(engine, data)
    except wt.WasmtimeError:
        reject("INVALID_MODULE", "Wasm validation or compilation failed")
    check_abi(wt, module)
    identity = {"runtime": "wasmtime-py", "version": VERSION, "abi": ABI,
                "sha256": hashlib.sha256(data).hexdigest(), "moduleBytes": len(data)}
    if request.get("operation") == "inspect":
        return dict(identity, exports=["memory", "qg_alloc", "qg_run"])
    if request.get("operation") != "run":
        reject("INVALID_REQUEST", "Unknown runner operation")
    text = request.get("input")
    if not isinstance(text, str):
        reject("INVALID_INPUT", "Canonical JSON input is required")
    input_bytes = text.encode("utf-8", errors="strict")
    if len(input_bytes) > limits["inputBytes"]:
        reject("INPUT_LIMIT", "Input byte limit exceeded")
    loads(text, limits["jsonDepth"])
    store = wt.Store(engine)
    store.set_limits(memory_size=limits["memoryBytes"], table_elements=0, instances=1, tables=0, memories=1)
    store.set_fuel(limits["fuel"])
    start = time.monotonic()
    try:
        instance = wt.Instance(store, module, [])
        exports = instance.exports(store)
        memory = exports["memory"]
        ptr = exports["qg_alloc"](store, len(input_bytes)) & 0xffffffff
        if ptr + len(input_bytes) > memory.data_len(store):
            reject("INVALID_POINTER", "Guest input pointer is outside its memory")
        memory.write(store, input_bytes, ptr)
        packed = exports["qg_run"](store, ptr, len(input_bytes)) & 0xffffffffffffffff
        out_ptr, out_len = packed >> 32, packed & 0xffffffff
        if out_len > limits["outputBytes"]:
            reject("OUTPUT_LIMIT", "Guest output byte limit exceeded")
        if out_ptr + out_len > memory.data_len(store):
            reject("INVALID_POINTER", "Guest output pointer is outside its memory")
        try:
            output = bytes(memory.read(store, out_ptr, out_ptr + out_len)).decode("utf-8", errors="strict")
        except UnicodeError:
            reject("INVALID_UTF8", "Guest output is not valid UTF-8")
        value = loads(output, limits["jsonDepth"])
        return dict(identity, output=value, metrics={"fuelConsumed": limits["fuel"] - store.get_fuel(),
                     "memoryBytes": memory.data_len(store), "executionMs": round((time.monotonic() - start) * 1000, 3)})
    except wt.Trap as exc:
        code = "FUEL_EXHAUSTED" if exc.trap_code == wt.TrapCode.OUT_OF_FUEL else "GUEST_TRAP"
        reject(code, "Guest fuel exhausted" if code == "FUEL_EXHAUSTED" else "Guest execution trapped")
    except wt.WasmtimeError:
        reject("GUEST_TRAP", "Guest instantiation or execution failed")


def main():
    try:
        line = sys.stdin.buffer.read(400000)
        if len(line) >= 400000:
            reject("INPUT_LIMIT", "Runner request exceeds its byte limit")
        request = loads(line)
        if not isinstance(request, dict):
            reject("INVALID_REQUEST", "Expected a runner request")
        result = {"ok": True, "result": process(request)}
    except Rejected as exc:
        result = {"ok": False, "error": {"code": exc.code, "message": exc.message}}
    except MemoryError:
        result = {"ok": False, "error": {"code": "PROCESS_MEMORY_LIMIT", "message": "Runner process memory limit reached"}}
    except BaseException:
        result = {"ok": False, "error": {"code": "RUNTIME_UNAVAILABLE", "message": "Runner failed closed"}}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
