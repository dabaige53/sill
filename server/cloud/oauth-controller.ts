import { copy } from "../../design-system/copy.ts";
import {isAuthorizationId} from './oauth-identifiers.ts';
import {reviewConsent,consentSummary} from './consent-policy.ts';
import {oauthProvider,checkedRedirect} from './oauth-provider.ts';
import {SupabaseRepository,serviceError} from './supabase-repository.ts';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const browserCookie='__Host-sill-consent-browser',returnCookie='__Host-sill-oauth-return';
const headers={'Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"};
const esc=(s?: any)=>String(s).replace(/[&<>"']/g,(c?: any)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookie=(name?: any,value?: any,age: any=600)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
function readCookie(request?: any,name?: any){const matches=(request.headers.get('cookie')||'').split(';').map((x?: any)=>x.trim()).filter((x?: any)=>x.startsWith(name+'='));if(matches.length!==1)return null;try{return decodeURIComponent(matches[0].slice(name.length+1));}catch{return null;}}
const canonical=(value?: any)=>JSON.stringify(value,(_key?: any,v?: any)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a]: any,[b]: any)=>a.localeCompare(b))):v);
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),(x?: any)=>x.toString(16).padStart(2,'0')).join('');
const hash=async (s?: any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),(x?: any)=>x.toString(16).padStart(2,'0')).join('');
const page=(html?: any,status: any=200)=>new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy("server.oauthcontroller.1e12aceb3b8c")}</title><style>body{margin:0;background:#f5f5f7;color:#1d1d1f;font:16px/1.65 system-ui}main{max-width:620px;margin:40px auto;padding:28px;background:white;border-radius:24px}h1{font-size:23px}dt{color:#636366;margin-top:14px}dd{margin:0;overflow-wrap:anywhere}button,a{min-height:44px}button{padding:12px 20px;margin:12px 8px 0 0;border:0;border-radius:22px;cursor:pointer}button[value=approve]{background:#0066cc;color:white}a{color:#0066cc}button:focus-visible,a:focus-visible{outline:3px solid #0066cc;outline-offset:3px}@media(max-width:680px){main{margin:16px;padding:20px}}</style><main><a href="/">${copy("server.oauthcontroller.6f07cd6b8efc")}</a>${html}</main></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
async function form(request?: any){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')throw serviceError('invalid_request',415);
 const reader=request.body?.getReader();if(!reader)throw serviceError('invalid_request');let text='',size=0;const decoder=new TextDecoder();
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw serviceError('invalid_request',413);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
 const params=new URLSearchParams(text),keys=[...params.keys()];
 if(new Set<any>(keys).size!==keys.length||keys.some((k?: any)=>!['flowId','csrf','decision'].includes(k)))throw serviceError('invalid_request');
 const p=Object.fromEntries(params);if(!UUID.test(p.flowId||'')||!/^[0-9a-f]{64}$/.test(p.csrf||'')||!['approve','deny','revoke'].includes(p.decision))throw serviceError('invalid_request');return p;
}
export function createOAuthController(config?: any,{authenticate,providerFactory=oauthProvider,clock=()=>Date.now()}: any={}){
 const enabled=config.oauthConsentEnabled===true&&config.agentAudience===config.appOrigin+'/mcp'&&Array.isArray(config.oauthClientIds)&&config.oauthClientIds.length>0&&config.oauthClientIds.length<=16&&config.oauthClientIds.every((id?: any)=>UUID.test(id));
 const allowed=(id?: any)=>enabled&&config.oauthClientIds.includes(id);
 function resumeLocation(request?: any){if(!enabled)return null;const value=readCookie(request,returnCookie)||'',parts=value.split('.'),expiry=Number(parts[1]);return parts.length===2&&isAuthorizationId(parts[0])&&expiry>clock()&&expiry<=clock()+600000?config.appOrigin+'/oauth/consent?authorization_id='+parts[0]:value?config.appOrigin+'/oauth/expired':null;}
 const clearReturn=()=>cookie(returnCookie,'',0);
 async function handle(request?: any){
  const url=new URL(request.url),path=url.pathname;
  if(!enabled)return page(`<h1>${copy("server.oauthcontroller.d355d43547c2")}</h1>`,503);
  let stage='request';
  try{
   if(url.origin!==config.appOrigin||request.headers.has('authorization'))throw serviceError('forbidden');
   if(!['GET','POST'].includes(request.method))throw serviceError('invalid_request',405);
   if(request.method==='POST'&&(request.headers.get('origin')!==config.appOrigin||request.headers.get('sec-fetch-site')==='cross-site'))throw serviceError('forbidden');
   if(path==='/oauth/expired'&&request.method==='GET')return page(`<h1>${copy("server.oauthcontroller.af6d76533c4c")}</h1><p>${copy("server.oauthcontroller.27d241989838")}</p>`,409);
   let actor: any;stage='session';
   try{actor=await authenticate(request);}catch(error){
    if(error.status===401&&request.method==='GET'&&path==='/oauth/consent'&&isAuthorizationId(url.searchParams.get('authorization_id'))&&[...url.searchParams.keys()].length===1){
     const r=page(`<h1>${copy("server.oauthcontroller.9b353d7d5e98")}</h1><p>${copy("server.oauthcontroller.57b675855947")}</p><a href="/auth/login">${copy("server.oauthcontroller.99232cddba71")}</a>`,401);
     r.headers.append('Set-Cookie',cookie(returnCookie,url.searchParams.get('authorization_id')+'.'+(clock()+600000),3600));return r;
    }throw error;
   }
   if(actor.principal.clientId!==null)throw serviceError('forbidden');
   stage='provider-init';const repo=new SupabaseRepository(actor.client),provider=providerFactory(config,actor.token),rpc=(op?: any,p: any={})=>repo.rpc('sill_oauth_flow',{op,p});
   let browser=readCookie(request,browserCookie);if(!/^[0-9a-f]{64}$/.test(browser||''))browser=null;
   if(request.method==='GET'){
    browser??=random();const browserHash=await hash(browser);
    async function newFlow(kind?: any,clientId?: any,review?: any){const flowId=crypto.randomUUID(),csrf=random();await rpc('begin',{kind,clientId,review,flowId,browserHash,csrfHash:await hash(csrf)});return `<input type="hidden" name="flowId" value="${flowId}"><input type="hidden" name="csrf" value="${csrf}">`;}
    let html: any,reviewedCallback: any;
    if(path==='/oauth/consent'){
     const id=url.searchParams.get('authorization_id');if(!isAuthorizationId(id)||[...url.searchParams.keys()].length!==1)throw serviceError('invalid_request');
     stage='provider-details';const details=await provider.details(id);
     // Supabase may reuse its existing consent and return only a callback. This
     // resumes an existing Sill grant; it must never install or widen one.
     if(details.redirect_url){
      stage='existing-consent';const matches=[];
      for(const row of await rpc('list')){
       const g=row.grant,p=row.policy;
       if(!row.enabled||!allowed(row.clientId)||!g||!Number.isSafeInteger(g.consent_version)||g.consent_version<1||g.owner_id!==actor.principal.userId||g.caller_id!=='oauth:'+row.clientId||p.clientId!==row.clientId||p.appOrigin!==config.appOrigin||p.audience!==config.agentAudience)continue;
       for(const redirectUri of p.redirectUris||[])try{
        const review=reviewConsent({details:{authorization_id:id,user:{id:actor.principal.userId},client:{id:row.clientId},redirect_uri:redirectUri,scope:p.identityScopes.join(' ')},principal:actor.principal,policy:p,grant:{ownerId:g.owner_id,clientId:row.clientId,audience:g.audience,scopes:g.scopes,resources:g.resources}});
        if(canonical([...g.scopes].sort())!==canonical([...p.contentScopes].sort())||canonical([...g.resources].sort())!==canonical([...p.resources].sort()))continue;
        matches.push(checkedRedirect(details.redirect_url,review,'approve'));
       }catch{}
      }
      if(matches.length!==1)throw serviceError('forbidden');
      return new Response(null,{status:303,headers:{...headers,Location:matches[0]}});
     }
     stage='provider-client';if(details.authorization_id!==id||!allowed(details.client?.id))throw serviceError('forbidden');
     stage='client-policy';const policy=await rpc('policy',{clientId:details.client.id});if(policy.appOrigin!==config.appOrigin||policy.audience!==config.agentAudience)throw serviceError('forbidden');
     stage='review';const review=reviewConsent({details,principal:actor.principal,policy,grant:{ownerId:actor.principal.userId,clientId:policy.clientId,audience:policy.audience,scopes:policy.contentScopes,resources:policy.resources}});
     reviewedCallback=review.redirectUri;stage='flow-store';
     html=consentSummary(review)+`<form method="post" action="/oauth/decision">${await newFlow('consent',review.clientId,review)}<button name="decision" value="approve">${copy("server.oauthcontroller.78153f238e89")}</button><button name="decision" value="deny">${copy("server.oauthcontroller.136de7a8c46f")}</button></form><p>${copy("server.oauthcontroller.48d7f4b56329")}</p><a href="/oauth/grants">${copy("server.oauthcontroller.8782b690d2e7")}</a>`;
    }else if(path==='/oauth/grants'&&!url.search){
     html=`<h1>${copy("server.oauthcontroller.8782b690d2e7")}</h1><p>${copy("server.oauthcontroller.2b3045f9e2af")}</p>`;
     for(const row of await rpc('list'))if(allowed(row.clientId))html+=`<section><h2>${esc(row.clientId)}</h2><p>${row.grant?copy("server.oauthcontroller.b13cb614f05b")+esc(row.grant.scopes.join('、'))+copy("server.oauthcontroller.389ae3297b0f")+esc(row.grant.resources.join('、')):copy("server.oauthcontroller.9a3166f75c45")}</p><form method="post" action="/oauth/revoke">${await newFlow('revoke',row.clientId,null)}<button name="decision" value="revoke">${copy("server.oauthcontroller.b379985b08ae")}</button></form></section>`;
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
    return page(`<h1>${copy("server.oauthcontroller.b93e7ef1aec7")}</h1><p>${revoked?copy("server.oauthcontroller.df4d88f62fe1"):copy("server.oauthcontroller.7b4560f5faa9")}</p><a href="/oauth/grants">${copy("server.oauthcontroller.fcab05957d9c")}</a>`);
   }
   // Re-read provider facts and DB policy before consuming the one-time flow.
   const details=await provider.details(flow.review.authorizationId);
   const fresh=reviewConsent({details,principal:actor.principal,policy:flow.policy,grant:{ownerId:actor.principal.userId,clientId:flow.clientId,audience:flow.review.audience,scopes:flow.review.contentScopes,resources:flow.review.resources}});
   if(canonical(fresh)!==canonical(flow.review))throw serviceError('revision_conflict');
   await rpc('claim',{...proof,decision:submitted.decision});
   let redirect: any;
   try{const result=await provider.decide(fresh.authorizationId,submitted.decision);redirect=checkedRedirect(result.redirect_url,fresh,submitted.decision);}
   catch(error){try{await rpc('finish',{...proof,result:'failed'});}catch{}throw error;}
   // Grant only after confirmed provider success and exact callback validation. No redirect/code is persisted.
   await rpc('finish',{...proof,result:submitted.decision==='approve'?'approved':'denied'});
   return new Response(null,{status:303,headers:{...headers,Location:redirect}});
  }catch(error){if(stage==='provider-details'&&['transport','timeout','invocation','empty-body','json'].includes(error.providerFailure))stage+='-'+error.providerFailure;if(stage==='provider-details'&&Number.isInteger(error.providerStatus)&&error.providerStatus>=400&&error.providerStatus<=599)stage+='-'+error.providerStatus;const status=[400,401,403,404,405,409,413,415,429].includes(error.status)?error.status:error.message==='consent_not_allowed'?403:503;const message=status===409?copy("server.oauthcontroller.d107826b5e9a"):status===401?copy("server.oauthcontroller.18b4f39557c3"):status===403&&stage==='review'?copy("server.oauthcontroller.d3c647a333aa"):copy("server.oauthcontroller.38d6d057302b");const response=page(`<meta name="sill-consent-stage" content="${stage}"><h1>${copy("server.oauthcontroller.616a620e602d")}</h1><p>${message}</p>`,status);response.headers.set('X-Sill-Consent-Stage',stage);return response;}
 }
 return {handle,resumeLocation,clearReturn};
}
