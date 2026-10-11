;; qg-json-v1, reviewed registry fixture. The host validates {text:string <=1024}.
;; Returns the canonical UTF-8 JSON input in its own bounded linear memory.
(module
  (memory (export "memory") 1 1)
  (func (export "qg_alloc") (param $length i32) (result i32) i32.const 4096)
  (func (export "qg_run") (param $ptr i32) (param $length i32) (result i64)
    local.get $ptr i64.extend_i32_u i64.const 32 i64.shl
    local.get $length i64.extend_i32_u i64.or))
