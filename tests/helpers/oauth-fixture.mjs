import {cloudFixture} from './cloud-fixture.mjs';
import {A} from './boundary-fixture.mjs';
import {token} from './signed-auth.mjs';
import {createSillRuntime} from '../../server/cloud/http.mjs';
import {oauthProvider} from '../../server/cloud/oauth-provider.mjs';
export const C='33333333-3333-4333-8333-333333333333',AUTH='44444444-4444-4444-8444-444444444444';
export async function oauthFixture(){
 const f=await cloudFixture({oauth:true});f.config.oauthConsentEnabled=true;f.config.oauthClientIds=[C];
 const policy={clientId:C,appOrigin:f.config.appOrigin,audience:f.config.appOrigin+'/mcp',redirectUris:['http://127.0.0.1:5876/callback'],identityScopes:['openid'],contentScopes:['content:read','content:write'],resources:['*']};
 f.config.agentAudience=policy.audience;
 await f.db.exec('reset role');await f.db.query('insert into sill_private.oauth_clients(owner_id,client_id,policy,enabled) values($1,$2,$3,true)',[A,C,JSON.stringify(policy)]);
 const details={authorization_id:AUTH,client:{id:C,name:'Synthetic Codex'},user:{id:A,email:'synthetic@example.com'},redirect_uri:policy.redirectUris[0],scope:'openid'};
 const providerCalls=[],state={details,fail:false,badRedirect:false,hold:null};
 async function upstream(input,init){
  const u=new URL(input);providerCalls.push({path:u.pathname,search:u.search,method:init.method,body:init.body,redirect:init.redirect,authorization:new Headers(init.headers).get('authorization')});
  if(state.fail)throw Error('synthetic provider unavailable');
  if(u.pathname.endsWith('/consent')){if(state.failDecision)throw Error('synthetic response loss after provider action');if(state.hold)await state.hold;const action=JSON.parse(init.body).action;return Response.json({redirect_url:state.badRedirect?'https://evil.example/?code=secret&state=bound':policy.redirectUris[0]+(action==='approve'?'?code=synthetic-single-use-code&state=bound':'?error=access_denied&state=bound')});}
  if(init.method==='DELETE')return new Response(null,{status:204});
  return Response.json(state.details);
 }
 const providerFactory=(cfg,t)=>oauthProvider(cfg,t,{fetchImpl:upstream});
 const runtime=createSillRuntime(f.config,{html:'<h1>Test Sill</h1>',clientFactory:f.factory,oauthProviderFactory:providerFactory});
 const cookies=new Map([['__Host-sill-access',token()]]);
 async function call(path,{method='GET',body,headers={},cookieJar=cookies}={}){
  const reqHeaders={cookie:[...cookieJar].map(([k,v])=>k+'='+v).join(';'),...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded',Origin:f.config.appOrigin}:{}),...headers};
  const r=await runtime(new Request(f.config.appOrigin+path,{method,headers:reqHeaders,...(body!==undefined?{body:body instanceof URLSearchParams?body.toString():body}:{})}));
  for(const c of r.headers.getSetCookie()){const [kv]=c.split(';'),i=kv.indexOf('=');cookieJar.set(kv.slice(0,i),kv.slice(i+1));}return r;
 }
 async function form(path='/oauth/consent?authorization_id='+AUTH){const r=await call(path),html=await r.text();if(r.status!==200)throw new Error('Form failed '+r.status+' '+html);return Object.fromEntries([...html.matchAll(/name="(flowId|csrf)" value="([^"]+)"/g)].map(m=>[m[1],m[2]]));}
 async function decide(values,decision='approve',options={}){return call(decision==='revoke'?'/oauth/revoke':'/oauth/decision',{method:'POST',body:new URLSearchParams({...values,decision}),...options});}
 const sql=async(query,args=[])=>{await f.db.exec('reset role');return f.db.query(query,args);};
 const grant=async()=>(await sql("select * from sill_private.caller_grants where owner_id=$1 and caller_id=$2",[A,'oauth:'+C])).rows[0];
 return {...f,policy,state,details,providerCalls,providerFactory,runtime,cookies,call,form,decide,sql,grant};
}
