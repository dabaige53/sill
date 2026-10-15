import {authenticateSupabase} from '../supabase-auth.mjs';
import {serviceError} from '../supabase-repository.mjs';

export const accessName='__Host-sill-access',refreshName='__Host-sill-refresh';
const lifetime=30*24*60*60;
export const sessionCookie=(name,value,maxAge=lifetime)=>`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export function readCookie(request,name){
 const values=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));
 if(values.length!==1)return null;
 try{return decodeURIComponent(values[0].slice(name.length+1));}catch{return null;}
}
export function createBrowserSessions(config,{authClient,clientFactory}){
 const pending=new Map();
 const clear=()=>[sessionCookie(accessName,'',0),sessionCookie(refreshName,'',0)];
 function cookies(session){
  if(!session?.access_token||!session?.refresh_token||session.access_token.length>16384||session.refresh_token.length>4096)throw serviceError('unavailable',503);
  return [sessionCookie(accessName,session.access_token),sessionCookie(refreshName,session.refresh_token)];
 }
 async function refresh(token){
  if(pending.has(token))return pending.get(token);
  // Only coalesce active requests, never retain token pairs in a process cache.
  // Other instances and late requests rely on Supabase's refresh reuse interval/parent rule.
  if(pending.size>=128)throw serviceError('unavailable',503);
  const operation=(async()=>{
   let result;
   try{result=await authClient().auth.refreshSession({refresh_token:token});}catch{throw serviceError('unavailable',503);}
   if(result.error){
    const invalid=new Set(['refresh_token_not_found','refresh_token_already_used','session_not_found','session_expired','user_not_found','user_banned','bad_jwt']);
    if(invalid.has(result.error.code)||result.error.name==='AuthSessionMissingError')throw serviceError('unauthenticated',401);
    throw serviceError('unavailable',503);
   }
   cookies(result.data?.session);
   return result.data.session;
  })();
  pending.set(token,operation);
  try{return await operation;}finally{pending.delete(token);}
 }
 async function authenticate(request,state){
  const token=readCookie(request,accessName);
  try{return {...await authenticateSupabase(token?`Bearer ${token}`:null,{...config,kind:'web',audience:'authenticated'},clientFactory),token};}
  catch(error){if(error.code!=='unauthenticated')throw error;}
  const refreshToken=readCookie(request,refreshName);
  if(!refreshToken||refreshToken.length>4096){state.cookies=clear();throw serviceError('unauthenticated',401);}
  try{
   const session=await refresh(refreshToken);
   const identity=await authenticateSupabase(`Bearer ${session.access_token}`,{...config,kind:'web',audience:'authenticated'},clientFactory);
   state.cookies=cookies(session);
   return {...identity,token:session.access_token};
  }catch(error){if(error.code==='unauthenticated')state.cookies=clear();throw error;}
 }
 return {authenticate,cookies,clear};
}
