-- Extend only image predicates in the existing classic validator, preserving later body changes.
begin;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('sill_private.validate_classic_card_changes(jsonb,boolean)'::regprocedure) into definition;
 definition := replace(definition, $$v#>>'{}' not in ('architecture','coast','mountain','botanical')$$, $$(length(v#>>'{}')>8192 or (v#>>'{}' not in ('architecture','coast','mountain','botanical') and v#>>'{}' !~ '^https://[^[:space:]/@?#]+([/?#][^[:space:]]*)?$'))$$);
 definition := replace(definition, $$e#>>'{}' not in ('architecture','coast','mountain','botanical')$$, $$(e#>>'{}' not in ('architecture','coast','mountain','botanical') and e#>>'{}' !~ '^https://[^[:space:]/@?#]+([/?#][^[:space:]]*)?$')$$);
 definition := replace(definition, $$when k='points' then 200 else 100$$, $$when k='points' then 200 when k='photos' then 8192 else 100$$);
 execute definition;
end $migration$;
commit;
