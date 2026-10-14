import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {authenticateSupabase} from '../supabase-auth.mjs';
import {SupabaseRepository,serviceError} from '../supabase-repository.mjs';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const revision=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const state=z.object({read:z.boolean().optional(),done:z.boolean().optional(),archived:z.boolean().optional()}).strict();
const changes=z.object({title:z.string().min(1).max(1000).optional(),type:z.enum(['article','mail','note','task','event','reminder','media','insight','digest','suggestion','photo','file']).optional(),body:z.array(z.string().max(50000)).max(100).optional(),url:z.string().url().refine(s=>/^https?:\/\//.test(s)).optional(),state:state.optional()}).strict();
const create=changes.required({title:true,type:true});
const update=z.object({expectedRevision:revision,changes:changes.optional(),metadata:z.object({event_id:id,outcome:z.enum(['succeeded','failed','unknown']),summary:z.string().max(2000)}).strict().optional()}).strict();
const event=z.object({event_id:id,card_id:id,card_version:revision,action:z.enum(['summarize','complete']),destination_ref:id}).strict();
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const cookieName='__Host-sill-access', verifierName='__Host-sill-pkce',stateName='__Host-sill-login-state';
const cookie=(name,value,maxAge)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax${maxAge===undefined?'':`; Max-Age=${maxAge}`}`;
const json=(status,data,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});
function readCookie(request,name){
 const values=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(values.length!==1)return null;
 try{return decodeURIComponent(values[0].slice(name.length+1));}catch{return null;}
}
async function body(request){
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw serviceError('invalid_request',415);
 const reader=request.body?.getReader();if(!reader)throw serviceError('invalid_request');let size=0;const chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();throw serviceError('invalid_request',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw serviceError('invalid_request');}
}
function sameOrigin(request,origin){
 if(request.headers.get('origin')!==origin||request.headers.get('sec-fetch-site')==='cross-site')throw serviceError('forbidden');
}
export function createSillRuntime(config,{clientFactory=createClient,html='',repositoryFactory=client=>new SupabaseRepository(client)}={}){
 const origin=new URL(config.appOrigin);
 if(origin.origin!==config.appOrigin||origin.username||origin.password||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)))throw new Error('Invalid application origin');
 const authUrl=new URL(config.url);
 if(authUrl.protocol!=='https:'||authUrl.origin!==config.url||!/^sb_publishable_[\w-]+$/.test(config.publishableKey||''))throw new Error('Invalid Supabase configuration');
 function authClient(values=new Map()){
  return clientFactory(config.url,config.publishableKey,{auth:{flowType:'pkce',storageKey:'sill-web',persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);}}}});
 }
 async function authenticate(request){
  const bearer=request.headers.get('authorization');
  if(bearer){
   // Explicit bearer access is reserved for separately resource-bound agents.
   if(!config.agentAudience)throw serviceError('forbidden');
   return authenticateSupabase(bearer,{...config,kind:'mcp',audience:config.agentAudience},clientFactory);
  }
  const token=readCookie(request,cookieName);
  return authenticateSupabase(token?`Bearer ${token}`:null,{...config,kind:'web',audience:'authenticated'},clientFactory);
 }
 return async request=>{
  try{
   const url=new URL(request.url),path=url.pathname;
   if(url.origin!==config.appOrigin)throw serviceError('forbidden');
   if(request.headers.get('origin')&&request.headers.get('origin')!==config.appOrigin)throw serviceError('forbidden');
   if(path==='/mcp'||path.startsWith('/mcp/'))return json(503,{error:{code:'unavailable',message:'Remote MCP transport is not connected.',request_id:crypto.randomUUID()}});
   if(path==='/api/v1/health'&&request.method==='GET')return json(200,{status:'ready',contract:'sill-v1-draft1'});
   if(path==='/auth/login'&&request.method==='POST'){
    sameOrigin(request,config.appOrigin);
    const {email}=z.object({email:z.string().email().max(254)}).strict().parse(await body(request));
    const storage=new Map(),client=authClient(storage),nonce=crypto.randomUUID();
    const result=await client.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:`${config.appOrigin}/auth/callback?state=${nonce}`}});
    if(result.error)throw serviceError(result.error.status===429?'rate_limited':'unavailable',result.error.status===429?429:503);
    const verifier=storage.get('sill-web-code-verifier');
    if(!verifier||verifier.length>512)throw serviceError('unavailable');
    const response=json(202,{message:'如果该账号可登录，登录链接将发送到邮箱。'});
    response.headers.append('Set-Cookie',cookie(verifierName,verifier,600));response.headers.append('Set-Cookie',cookie(stateName,nonce,600));return response;
   }
   if(path==='/auth/callback'&&request.method==='GET'){
    const code=url.searchParams.get('code'),nonce=url.searchParams.get('state'),expected=readCookie(request,stateName),verifier=readCookie(request,verifierName);
    if(!code||code.length>4096||!expected||nonce!==expected||!verifier||verifier.length>512)throw serviceError('unauthenticated');
    const client=authClient(new Map([['sill-web-code-verifier',verifier]]));
    const {data,error}=await client.auth.exchangeCodeForSession(code);
    if(error||!data?.session?.access_token)throw serviceError('unauthenticated');
    const token=data.session.access_token;
    const identity=await authenticateSupabase(`Bearer ${token}`,{...config,kind:'web'},clientFactory);
    // Login alone does not grant app access. An operator must provision a workspace/grant first.
    await repositoryFactory(identity.client).list({limit:1});
    const response=new Response(null,{status:303,headers:{...headers,Location:config.appOrigin+'/'}});
    response.headers.append('Set-Cookie',cookie(cookieName,token));
    response.headers.append('Set-Cookie',cookie(verifierName,'',0));response.headers.append('Set-Cookie',cookie(stateName,'',0));return response;
   }
   if(path==='/auth/logout'&&request.method==='POST'){
    sameOrigin(request,config.appOrigin);
    const token=readCookie(request,cookieName);
    let revoked=true;
    if(token){try{const result=await authClient().auth.admin.signOut(token,'local');revoked=!result.error;}catch{revoked=false;}}
    // Always erase local session even if upstream logout fails. Never claim revoked tokens in that case.
    const response=json(200,{signedOut:true,revoked});response.headers.append('Set-Cookie',cookie(cookieName,'',0));return response;
   }
   if(path==='/auth/session'&&request.method==='GET'){
    const identity=await authenticate(request);await repositoryFactory(identity.client).list({limit:1});
    return json(200,{userId:identity.principal.userId});
   }
   if(path.startsWith('/api/v1/')){
    if(!['GET','POST','PATCH','DELETE'].includes(request.method))throw serviceError('invalid_request',405);
    if(request.method!=='GET'&&!request.headers.has('authorization'))sameOrigin(request,config.appOrigin);
    const {client}=await authenticate(request),repository=repositoryFactory(client);
    const content=/^\/api\/v1\/contents\/([\w-]{1,100})$/.exec(path),eventPath=/^\/api\/v1\/events\/([\w-]{1,100})$/.exec(path);
    if(request.method==='GET'){
     if(path==='/api/v1/contents'){
      const query=z.object({cursor:z.string().min(1).max(2048).optional(),since:z.string().min(1).max(2048).optional(),limit:z.string().regex(/^(?:[1-9][0-9]?|100)$/).transform(Number).optional()}).strict().parse(Object.fromEntries(url.searchParams));
      return json(200,await repository.list(query));
     }
     if(url.search)throw serviceError('invalid_request');
     if(content)return json(200,await repository.get(content[1]));
     if(eventPath)return json(200,await repository.getEvent(eventPath[1]));
    }
    const key=request.headers.get('idempotency-key');
    let op,payload,resource=null;
    if(request.method==='POST'&&path==='/api/v1/contents'){op='create';payload=create.parse(await body(request));}
    else if(request.method==='PATCH'&&content){op='update';resource=content[1];payload=update.parse(await body(request));}
    else if(request.method==='DELETE'&&content){op='delete';resource=content[1];payload=z.object({expectedRevision:revision}).strict().parse(await body(request));}
    else if(request.method==='POST'&&path==='/api/v1/events'){op='submit_event';payload=event.parse(await body(request));}
    if(op){if(!/^[\w-]{8,128}$/.test(key||''))throw serviceError('invalid_request');const result=await repository.write(op,resource,payload,key);return json(result.status_code,result.body);}
    throw serviceError('not_found');
   }
   if(request.method==='GET'&&path==='/')return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
   throw serviceError('not_found');
  }catch(error){
   const alias={idempotency_expired:'idempotency_conflict',event_terminal_conflict:'revision_conflict'};
   const known=new Set(['invalid_request','unauthenticated','forbidden','not_found','revision_conflict','idempotency_conflict','cursor_expired','rate_limited','unavailable']);
   const raw=error instanceof z.ZodError?'invalid_request':alias[error.code]||error.code;
   const code=known.has(raw)?raw:'unavailable';
   const status=error instanceof z.ZodError?400:known.has(raw)?error.status||503:503;
   return json(status,{error:{code,message:code,request_id:crypto.randomUUID()}});
  }
 };
}
