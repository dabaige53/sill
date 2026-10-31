import { readFile } from "node:fs/promises";
export const A = "11111111-1111-4111-8111-111111111111",
	B = "22222222-2222-4222-8222-222222222222";
export const resource = "https://sill.example/mcp";
export async function setupBoundary(db?: any) {
	await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);

 insert into auth.users values('${A}'),('${B}');`);
	for (const name of [
		"sill_v1_storage.sql",
		"sill_v1_rpc.sql",
		"sill_v1_boundary.sql",
		"sill_v1_sessions_snapshots.sql",
	])
		await db.exec(
			await readFile(new URL("../../../supabase/drafts/" + name, import.meta.url), "utf8"),
		);
	await db.exec(`insert into sill_private.workspaces(owner_id) values('${A}'),('${B}');
 insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values
 ('${A}','user:${A}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*'],'authenticated'),
 ('${B}','user:${B}',array['content:read','content:write','content:delete'],array['*'],'authenticated');`);
}
/** Cloud card migrations after the boundary drafts, in deployment order. */
export const cardMigrations = [
	"20261016052843_sill_rich_cards.sql",
	"20261016092653_sill_workspace_operations.sql",
	"20261019031622_sill_hidden_card_actions.sql",
	"20261023012829_sill_explicit_card_fields.sql",
	"20261023012831_card_playback_and_pr.sql",
	"20261023012833_sill_markdown_body.sql",
	"20261023020000_https_images.sql",
	"20261023111147_sill_layout_preferences.sql",
	"20261027132655_workspace_save_consistency.sql",
	"20261028120000_sill_card_fields_v5.sql",
	"20261029160000_workspace_conditional_read.sql",
	"20261030120000_sill_keyword_search.sql",
	"20261031125200_card_display_time_and_task_limit.sql",
];
export async function applyCardMigrations(db?: any) {
	for (const file of cardMigrations)
		await db.exec(
			await readFile(new URL("../../../supabase/migrations/" + file, import.meta.url), "utf8"),
		);
}
export const claims = (sub: any = A, extra: any = {}) => ({
	sub,
	role: "authenticated",
	aud: "authenticated",
	exp: Math.floor(Date.now() / 1000) + 3600,
	...extra,
});
export async function identity(db?: any, c: any = claims()) {
	await db.exec("reset role");
	await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(c)]);
	await db.exec("set role authenticated");
}
export const rpc = async (db?: any, name?: any, args: any = []) => {
	const functions: Record<string, any> = {
		sill_oauth_flow: "$1,$2::jsonb",
		sill_session_info: "",
		sill_get_workspace: "",
		sill_get_workspace_since: "$1::bigint",
		sill_apply_operations: "$1::jsonb,$2",
		sill_write_v1: "$1,$2,$3::jsonb,$4",
		sill_get_content: "$1",
		sill_get_event: "$1",
		sill_list_contents: "$1,$2,$3",
		sill_search_contents: "$1,$2::integer",
	};
	if (!Object.hasOwn(functions, name)) throw Error("Unsupported fixture RPC");
	return (await db.query(`select public.${name}(${functions[name]}) as value`, args)).rows[0].value;
};
