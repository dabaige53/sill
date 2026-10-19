import { readFileSync, writeFileSync } from "node:fs";

// Keep the executable preparation script compatible with existing PGlite/Postgres consumers.
const parts = ["authorization", "operations"].map((name) =>
	readFileSync(new URL(`../supabase/drafts/rpc/${name}.sql`, import.meta.url), "utf8"),
);
const target = new URL("../supabase/drafts/sill_v1_rpc.sql", import.meta.url);
const content = parts.join("");
if (process.argv.includes("--check")) {
	if (readFileSync(target, "utf8") !== content) throw new Error("stale_preparation_sql");
} else writeFileSync(target, content);
