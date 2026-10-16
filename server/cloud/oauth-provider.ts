import {isAuthorizationId} from './oauth-identifiers.mjs';
import {serviceError} from '../supabase-repository.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Official GoTrue endpoints used by pinned auth-js 2.117.3. Access-token-only server adapter.
export function oauthProvider(config,accessToken,{fetchImpl=(...args)=>fetch(...args)}={}){
 const origin=new URL(config.url);
 if(origin.protocol!=='https:'||origin.origin!==config.url||!/^sb_publishable_[\w-]+$/.test(config.publishableKey||'')||typeof accessToken!=='string'||accessToken.length>16384)throw serviceError('forbidden');
 async function call(path,method='GET',payload){
  let r;
  try{r=await fetchImpl(origin.origin+'/auth/v1/'+path,{method,redirect:'manual',signal:AbortSignal.timeout(8000),headers:{apikey:config.publishableKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'},...(payload?{body:JSON.stringify(payload)}:{})});}catch(error){const reason=error?.name==='TimeoutError'?'timeout':/Illegal invocation/i.test(error?.message||'')?'invocation':'transport';throw Object.assign(serviceError('unavailable'),{providerFailure:reason});}
  if(!r.ok){const error=serviceError(r.status===401?'unauthenticated':r.status===403?'forbidden':'unavailable');error.providerStatus=r.status;throw error;}
  if(method==='DELETE')return {};
  const reader=r.body?.getReader();let size=0,chunks=[];
  if(!reader)throw Object.assign(serviceError('unavailable'),{providerFailure:'empty-body'});
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw serviceError('unavailable');}chunks.push(value);}
  try{const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(serviceError('unavailable'),{providerFailure:'json'});}
 }
 const authorization=id=>{if(!isAuthorizationId(id))throw serviceError('invalid_request');return id;};
 const checked=id=>{if(!uuid.test(id||''))throw serviceError('invalid_request');return id;};
 return {details:id=>call('oauth/authorizations/'+authorization(id)),decide:(id,action)=>{if(!['approve','deny'].includes(action))throw serviceError('invalid_request');return call('oauth/authorizations/'+authorization(id)+'/consent','POST',{action});},revoke:clientId=>call('user/oauth/grants?client_id='+checked(clientId),'DELETE')};
}
export function checkedRedirect(value,review,action){
 let url,base;try{url=new URL(value);base=new URL(review.redirectUri);}catch{throw serviceError('forbidden');}
 if(url.origin!==base.origin||url.pathname!==base.pathname||url.username||url.password||url.hash||!url.searchParams.get('state'))throw serviceError('forbidden');
 const keys=[...url.searchParams.keys()];
 if(new Set(keys).size!==keys.length||keys.some(k=>!['code','state','error','error_description'].includes(k))||value.length>8192)throw serviceError('forbidden');
 if(action==='approve'&&(!url.searchParams.get('code')||url.searchParams.has('error'))||action==='deny'&&(url.searchParams.get('error')!=='access_denied'||url.searchParams.has('code')))throw serviceError('forbidden');
 return url.href;
}
