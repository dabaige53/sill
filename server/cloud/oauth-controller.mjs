import {reviewConsent,consentSummary} from './consent-policy.mjs';
import {oauthProvider,checkedRedirect} from './oauth-provider.mjs';
import {SupabaseRepository,serviceError} from '../supabase-repository.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const browserCookie='__Host-sill-consent-browser',returnCookie='__Host-sill-oauth-return';
const headers={'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookie=(name,value,age=600)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function readCookie(request,name){const matches=(request.headers.get('cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));if(matches.length!==1)return null;try{return decodeURIComponent(matches[0].slice(name.length+1));}catch{return null;}}
const canonical=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
const page=(html,status=200)=>new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sill · 授权</title><style>body{margin:0;background:#f5f5f7;color:#1d1d1f;font:16px/1.65 system-ui}main{max-width:620px;margin:40px auto;padding:28px;background:white;border-radius:24px}h1{font-size:23px}dt{color:#636366;margin-top:14px}dd{margin:0;overflow-wrap:anywhere}button,a{min-height:44px}button{padding:12px 20px;margin:12px 8px 0 0;border:0;border-radius:22px;cursor:pointer}button[value=approve]{background:#0066cc;color:white}a{color:#0066cc}button:focus-visible,a:focus-visible{outline:3px solid #0066cc;outline-offset:3px}@media(max-width:680px){main{margin:16px;padding:20px}}</style><main><a href="/">Sill · 返回工作台</a>${html}</main></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
async function form(request){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')throw serviceError('invalid_request',415);
 const reader=request.body?.getReader();if(!reader)throw serviceError('invalid_request');let text='',size=0;const decoder=new TextDecoder();
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw serviceError('invalid_request',413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 const params=new URLSearchParams(text),keys=[...params.keys()];
 if(new Set(keys).size!==keys.length||keys.some(k=>!['flowId','csrf','decision'].includes(k)))throw serviceError('invalid_request');
 const p=Object.fromEntries(params);if(!UUID.test(p.flowId||'')||!/^[0-9a-f]{64}$/.test(p.csrf||'')||!['approve','deny','revoke'].includes(p.decision))throw serviceError('invalid_request');return p;
}
export function createOAuthController(config,{authenticate,providerFactory=oauthProvider,clock=()=>Date.now()}={}){
 const enabled=config.oauthConsentEnabled===true&&config.agentAudience===config.appOrigin+'/mcp'&&Array.isArray(config.oauthClientIds)&&config.oauthClientIds.length>0&&config.oauthClientIds.length<=16&&config.oauthClientIds.every(id=>UUID.test(id));
 const allowed=id=>enabled&&config.oauthClientIds.includes(id);
 function resumeLocation(request){if(!enabled)return null;const value=readCookie(request,returnCookie)||'',parts=value.split('.'),expiry=Number(parts[1]);return parts.length===2&&UUID.test(parts[0])&&expiry>clock()&&expiry<=clock()+600000?config.appOrigin+'/oauth/consent?authorization_id='+parts[0]:null;}
 const clearReturn=()=>cookie(returnCookie,'',0);
 async function handle(request){
  const url=new URL(request.url),path=url.pathname;
  if(!enabled)return page('<h1>远程授权尚未启用</h1>',503);
  try{
   if(url.origin!==config.appOrigin||request.headers.has('authorization'))throw serviceError('forbidden');
   if(!['GET','POST'].includes(request.method))throw serviceError('invalid_request',405);
   if(request.method==='POST'&&(request.headers.get('origin')!==config.appOrigin||request.headers.get('sec-fetch-site')==='cross-site'))throw serviceError('forbidden');
   let actor;
   try{actor=await authenticate(request);}catch(error){
    if(error.status===401&&request.method==='GET'&&path==='/oauth/consent'&&UUID.test(url.searchParams.get('authorization_id')||'')&&[...url.searchParams.keys()].length===1){
     const r=page('<h1>登录后继续授权</h1><p>请在此浏览器登录已有 Sill 账号。完成登录后，会返回本次授权请求；登录本身不会批准访问。</p><a href="/">前往登录</a>',401);
     r.headers.append('Set-Cookie',cookie(returnCookie,url.searchParams.get('authorization_id')+'.'+(clock()+600000)));return r;
    }throw error;
   }
   if(actor.principal.clientId!==null)throw serviceError('forbidden');
   const repo=new SupabaseRepository(actor.client),provider=providerFactory(config,actor.token),rpc=(op,p={})=>repo.rpc('sill_oauth_flow',{op,p});
   let browser=readCookie(request,browserCookie);if(!/^[0-9a-f]{64}$/.test(browser||''))browser=null;
   if(request.method==='GET'){
    browser??=random();const browserHash=await hash(browser);
    async function newFlow(kind,clientId,review){const flowId=crypto.randomUUID(),csrf=random();await rpc('begin',{kind,clientId,review,flowId,browserHash,csrfHash:await hash(csrf)});return `<input type="hidden" name="flowId" value="${flowId}"><input type="hidden" name="csrf" value="${csrf}">`;}
    let html,reviewedCallback;
    if(path==='/oauth/consent'){
     const id=url.searchParams.get('authorization_id');if(!UUID.test(id||'')||[...url.searchParams.keys()].length!==1)throw serviceError('invalid_request');
     const details=await provider.details(id);if(details.authorization_id!==id||!allowed(details.client?.id))throw serviceError('forbidden');
     const policy=await rpc('policy',{clientId:details.client.id});if(policy.appOrigin!==config.appOrigin||policy.audience!==config.agentAudience)throw serviceError('forbidden');
     const review=reviewConsent({details,principal:actor.principal,policy,grant:{ownerId:actor.principal.userId,clientId:policy.clientId,audience:policy.audience,scopes:policy.contentScopes,resources:policy.resources}});
     reviewedCallback=review.redirectUri;
     html=consentSummary(review)+`<form method="post" action="/oauth/decision">${await newFlow('consent',review.clientId,review)}<button name="decision" value="approve">允许上述访问</button><button name="decision" value="deny">拒绝</button></form><p>授权持续到你撤销。可在“已授权客户端”中撤销 Sill 访问。</p><a href="/oauth/grants">已授权客户端</a>`;
    }else if(path==='/oauth/grants'&&!url.search){
     html='<h1>已授权客户端</h1><p>撤销仅针对选中的客户端，不退出此浏览器或其他应用。</p>';
     for(const row of await rpc('list'))if(allowed(row.clientId))html+=`<section><h2>${esc(row.clientId)}</h2><p>${row.grant?'Sill 权限：'+esc(row.grant.scopes.join('、'))+'；范围：'+esc(row.grant.resources.join('、')):'Sill 未授予内容权限。仍可撤销此客户端在身份提供方的授权。'}</p><form method="post" action="/oauth/revoke">${await newFlow('revoke',row.clientId,null)}<button name="decision" value="revoke">撤销此客户端</button></form></section>`;
    }else throw serviceError('not_found');
    const r=page(html);
    // Chromium applies form-action to the provider's 303 callback as well. Permit
    // only the exact server-reviewed callback, never a browser-supplied target.
    if(reviewedCallback)r.headers.set('Content-Security-Policy',headers['Content-Security-Policy'].replace("form-action 'self'","form-action 'self' "+reviewedCallback));
    r.headers.append('Set-Cookie',cookie(browserCookie,browser));return r;
   }
   if(url.search||!browser||!['/oauth/decision','/oauth/revoke'].includes(path))throw serviceError('forbidden');
   const submitted=await form(request);
   if((path==='/oauth/revoke')!==(submitted.decision==='revoke'))throw serviceError('invalid_request');
   const proof={flowId:submitted.flowId,browserHash:await hash(browser),csrfHash:await hash(submitted.csrf)};
   const flow=await rpc('inspect',proof);if(!allowed(flow.clientId))throw serviceError('forbidden');
   if(submitted.decision==='revoke'){
    await rpc('claim',{...proof,decision:'revoke'});let revoked=true;try{await provider.revoke(flow.clientId);}catch{revoked=false;}
    return page(`<h1>Sill 访问已撤销</h1><p>${revoked?'此客户端的身份提供方授权也已撤销。':'身份提供方撤销未确认；Sill 内容访问已阻断。请返回客户端列表重新撤销身份提供方授权。'}</p><a href="/oauth/grants">返回已授权客户端</a>`);
   }
   // Re-read provider facts and DB policy before consuming the one-time flow.
   const details=await provider.details(flow.review.authorizationId);
   const fresh=reviewConsent({details,principal:actor.principal,policy:flow.policy,grant:{ownerId:actor.principal.userId,clientId:flow.clientId,audience:flow.review.audience,scopes:flow.review.contentScopes,resources:flow.review.resources}});
   if(canonical(fresh)!==canonical(flow.review))throw serviceError('revision_conflict');
   await rpc('claim',{...proof,decision:submitted.decision});
   let redirect;
   try{const result=await provider.decide(fresh.authorizationId,submitted.decision);redirect=checkedRedirect(result.redirect_url,fresh,submitted.decision);}
   catch(error){try{await rpc('finish',{...proof,result:'failed'});}catch{}throw error;}
   // Grant only after confirmed provider success and exact callback validation. No redirect/code is persisted.
   await rpc('finish',{...proof,result:submitted.decision==='approve'?'approved':'denied'});
   return new Response(null,{status:303,headers:{...headers,Location:redirect}});
  }catch(error){const status=[400,401,403,404,405,409,413,415,429].includes(error.status)?error.status:error.message==='consent_not_allowed'?403:503;const message=status===409?'授权请求已变化、已处理或已过期。请重新发起授权。':status===401?'登录已过期，请重新登录。':'本次授权未完成。未新增 Sill 访问权限，请返回工作台或重新发起授权。';return page(`<h1>无法完成授权</h1><p>${message}</p>`,status);}
 }
 return {handle,resumeLocation,clearReturn};
}
