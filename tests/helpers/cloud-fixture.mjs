import {createClient} from '@supabase/supabase-js';
import {PGlite} from '@electric-sql/pglite';
import {createHash} from 'node:crypto';
import {setupBoundary,identity,rpc,A,resource} from './boundary-fixture.mjs';
import {config,token,jwk,clientFactory as verifyClientFactory} from './signed-auth.mjs';
export async function cloudFixture({oauth=false}={}){
 const db=new PGlite();await setupBoundary(db);if(oauth)await db.exec(await (await import('node:fs/promises')).readFile(new URL('../../supabase/drafts/sill_v1_oauth_consent.sql',import.meta.url),'utf8')); let challenge=null,redirect=null,tail=Promise.resolve();const calls=[];const sessionState={refreshError:null,refreshCalls:0,revoked:false};
 async function upstream(input,init={}){
  const url=new URL(String(input)),headers=new Headers(init.headers);calls.push({path:url.pathname,method:init.method||'GET'});
  if(url.pathname==='/auth/v1/.well-known/jwks.json')return Response.json({keys:[jwk]});
  if(url.pathname==='/auth/v1/otp'){
   const value=JSON.parse(init.body);if(value.create_user!==false)return Response.json({message:'registration disabled'},{status:400});
   challenge=value.code_challenge;redirect=url.searchParams.get('redirect_to');return Response.json({});
  }
  if(url.pathname==='/auth/v1/token'){
   const value=JSON.parse(init.body);
   if(url.searchParams.get('grant_type')==='refresh_token'){
    sessionState.refreshCalls++;
    if(sessionState.refreshError)return Response.json({error_code:sessionState.refreshError.code,message:'Synthetic refresh failure'},{status:sessionState.refreshError.status});
    if(sessionState.revoked||!['synthetic-unused-refresh','synthetic-rotated-refresh'].includes(value.refresh_token))return Response.json({error_code:'refresh_token_not_found',message:'Invalid refresh token'},{status:400});
    return Response.json({access_token:token(),refresh_token:'synthetic-rotated-refresh',token_type:'bearer',expires_in:3600,user:{id:A,aud:'authenticated'}});
   }
   if(url.searchParams.get('grant_type')==='password'){
    if(value.email!=='synthetic@example.com'||value.password!=='synthetic-password')return Response.json({message:'Invalid credentials'},{status:400});
    return Response.json({access_token:token(),refresh_token:'synthetic-unused-refresh',token_type:'bearer',expires_in:3600,user:{id:A,aud:'authenticated'}});
   }
   const digest=createHash('sha256').update(value.code_verifier||'').digest('base64url');
   if(value.auth_code!=='synthetic-code'||digest!==challenge)return Response.json({message:'invalid grant'},{status:400});
   challenge=null;
   return Response.json({access_token:token(),refresh_token:'synthetic-unused-refresh',token_type:'bearer',expires_in:3600,user:{id:A,email:'synthetic@example.com',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()}});
  }
  if(url.pathname==='/auth/v1/user'){if(init.method==='PUT')sessionState.passwordUpdated=true;return Response.json({id:A,aud:'authenticated'});}
  if(url.pathname==='/auth/v1/logout'){sessionState.revoked=true;return new Response(null,{status:204});}
  if(url.pathname.startsWith('/rest/v1/rpc/')){
   const jwt=(headers.get('authorization')||'').replace(/^Bearer /i,'');
   const verified=await verifyClientFactory(config.url,config.publishableKey,{auth:{persistSession:false}}).auth.getClaims(jwt);
   if(verified.error||!verified.data?.claims)return Response.json({message:'unauthenticated'},{status:401});
   const name=url.pathname.split('/').at(-1),args=JSON.parse(init.body),order={sill_oauth_flow:['op','p'],sill_session_info:[],sill_write_v1:['op','resource_id','payload','idem'],sill_get_content:['resource_id'],sill_get_event:['event_id'],sill_list_contents:['cursor_token','since_token','requested_limit']};
   if(!order[name])return Response.json({message:'not_found'},{status:404});
   // PGlite has one session; serialize fixture role changes. Production RPCs are independent transactions.
   const operation=tail.catch(()=>{}).then(async()=>{
    await identity(db,verified.data.claims);
    return rpc(db,name,order[name].map(k=>['payload','p'].includes(k)?JSON.stringify(args[k]):args[k]??null));
   });tail=operation;
   try{return Response.json(await operation);}catch(error){return Response.json({code:'P0001',message:error.message},{status:400});}
  }
  return Response.json({message:'not_found'},{status:404});
 }
 const factory=(url,key,options)=>createClient(url,key,{...options,global:{...options.global,fetch:upstream}});
 return {db,factory,calls,sessionState,get redirect(){return redirect;},config:{...config,agentAudience:resource},close:()=>db.close()};
}
