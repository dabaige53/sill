const errors = {
 unauthenticated:401,forbidden:403,not_found:404,invalid_request:400,
 revision_conflict:409,idempotency_conflict:409,idempotency_expired:409,
 event_terminal_conflict:409,cursor_expired:410,
};
export function serviceError(code,status=errors[code]??503) {
 return Object.assign(new Error(code),{code,status});
}
// A request-scoped user-JWT client, never a service-role client or raw table gateway.
export class SupabaseRepository {
 constructor(client){this.client=client;}
 async rpc(name,args){
  let result;
  try {result=await this.client.rpc(name,args);} catch {throw serviceError('unavailable');}
  if(result.error){
   const code=result.error.message;
   throw serviceError(Object.hasOwn(errors,code)?code:'unavailable');
  }
  return result.data;
 }
 list({cursor=null,since=null,limit=null}={}){
  return this.rpc('sill_list_contents',{cursor_token:cursor,since_token:since,requested_limit:limit});
 }
 get(id){return this.rpc('sill_get_content',{resource_id:id});}
 getEvent(id){return this.rpc('sill_get_event',{event_id:id});}
 write(op,id,payload,key){return this.rpc('sill_write_v1',{op,resource_id:id,payload,idem:key});}
}
