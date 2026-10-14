import {readFile} from 'node:fs/promises';
export const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
export const resource='https://sill.example/mcp';
export async function setupBoundary(db){
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);

 insert into auth.users values('${A}'),('${B}');`);
 for(const name of ['sill_v1_storage.sql','sill_v1_rpc.sql','sill_v1_boundary.sql','sill_v1_sessions_snapshots.sql'])await db.exec(await readFile(new URL('../../supabase/drafts/'+name,import.meta.url),'utf8'));
 await db.exec(`insert into sill_private.workspaces(owner_id) values('${A}'),('${B}');
 insert into sill_private.caller_grants(owner_id,caller_id,scopes,resources,audience) values
 ('${A}','user:${A}',array['content:read','content:write','content:delete','event:submit','event:read'],array['*'],'authenticated'),
 ('${B}','user:${B}',array['content:read','content:write','content:delete'],array['*'],'authenticated');`);
}
export const claims=(sub=A,extra={})=>({sub,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600,...extra});
export async function identity(db,c=claims()){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(c)]);await db.exec('set role authenticated');
}
export const rpc=async(db,name,args=[])=>{
 const functions={sill_session_info:'',sill_write_v1:'$1,$2,$3::jsonb,$4',sill_get_content:'$1',sill_get_event:'$1',sill_list_contents:'$1,$2,$3'};
 if(!Object.hasOwn(functions,name))throw Error('Unsupported fixture RPC');
 return (await db.query(`select public.${name}(${functions[name]}) as value`,args)).rows[0].value;
};
