;; qg-json-v1, reviewed registry fixture.
;; Host validates exactly {values: integer[0..1000]}, each in [-1000000,1000000].
;; The sum therefore fits signed i32. Input is canonical JSON, with no whitespace.
(module
  (memory (export "memory") 1 1)
  (data (i32.const 0) "{\22count\22:")
  (data (i32.const 32) ",\22max\22:")
  (data (i32.const 64) ",\22min\22:")
  (data (i32.const 96) ",\22sum\22:")
  (data (i32.const 128) "null")
  (global $out (mut i32) (i32.const 2048))
  (func $byte (param $value i32)
    global.get $out local.get $value i32.store8
    global.get $out i32.const 1 i32.add global.set $out)
  (func $copy (param $ptr i32) (param $length i32)
    global.get $out local.get $ptr local.get $length memory.copy
    global.get $out local.get $length i32.add global.set $out)
  (func $number (param $n i32) (local $digits i32)
    local.get $n i32.const 0 i32.lt_s
    if
      i32.const 45 call $byte
      i32.const 0 local.get $n i32.sub local.set $n
    end
    loop $convert
      i32.const 1024 local.get $digits i32.add
      local.get $n i32.const 10 i32.rem_u i32.const 48 i32.add i32.store8
      local.get $digits i32.const 1 i32.add local.set $digits
      local.get $n i32.const 10 i32.div_u local.tee $n br_if $convert
    end
    loop $write
      local.get $digits i32.const 1 i32.sub local.tee $digits
      i32.const 1024 i32.add i32.load8_u call $byte
      local.get $digits br_if $write
    end)
  (func (export "qg_alloc") (param $length i32) (result i32) i32.const 4096)
  (func (export "qg_run") (param $ptr i32) (param $length i32) (result i64)
    (local $p i32) (local $c i32) (local $n i32) (local $negative i32)
    (local $count i32) (local $sum i32) (local $min i32) (local $max i32)
    i32.const 2048 global.set $out
    local.get $ptr i32.const 11 i32.add local.set $p
    block $done
      local.get $p i32.load8_u i32.const 93 i32.eq br_if $done
      loop $values
        i32.const 0 local.set $n
        i32.const 0 local.set $negative
        local.get $p i32.load8_u i32.const 45 i32.eq
        if
          i32.const 1 local.set $negative
          local.get $p i32.const 1 i32.add local.set $p
        end
        block $digits_done
          loop $digits
            local.get $p i32.load8_u local.tee $c i32.const 48 i32.lt_u br_if $digits_done
            local.get $c i32.const 57 i32.gt_u br_if $digits_done
            local.get $n i32.const 10 i32.mul local.get $c i32.const 48 i32.sub i32.add local.set $n
            local.get $p i32.const 1 i32.add local.set $p
            br $digits
          end
        end
        local.get $negative if i32.const 0 local.get $n i32.sub local.set $n end
        local.get $count i32.eqz
        if local.get $n local.set $min local.get $n local.set $max end
        local.get $n local.get $min i32.lt_s if local.get $n local.set $min end
        local.get $n local.get $max i32.gt_s if local.get $n local.set $max end
        local.get $sum local.get $n i32.add local.set $sum
        local.get $count i32.const 1 i32.add local.set $count
        local.get $p i32.load8_u i32.const 44 i32.eq
        if local.get $p i32.const 1 i32.add local.set $p br $values end
      end
    end
    i32.const 0 i32.const 9 call $copy local.get $count call $number
    i32.const 32 i32.const 7 call $copy
    local.get $count if local.get $max call $number else i32.const 128 i32.const 4 call $copy end
    i32.const 64 i32.const 7 call $copy
    local.get $count if local.get $min call $number else i32.const 128 i32.const 4 call $copy end
    i32.const 96 i32.const 7 call $copy local.get $sum call $number
    i32.const 125 call $byte
    i64.const 8796093022208
    global.get $out i32.const 2048 i32.sub i64.extend_i32_u i64.or))
