import {App,applyDocumentTheme,applyHostStyleVariables} from '@modelcontextprotocol/ext-apps';

// Only the host owns authentication. The view has no tokens, direct fetch or iframe.
export function createCloudTransport(call){
 return async function request(path,options={}){
  if(path==='/auth/session'){
   const access=await call({name:'sill_open_workspace',arguments:{}});
   return {...access,userId:access.connected?'connected':null};
  }
  const url=new URL(path,'https://sill.invalid'),match=url.pathname.match(/^\/api\/v1\/contents(?:\/([\w-]+))?$/);
  if(!match)throw Object.assign(new Error('此操作请在云端账号设置中完成'),{code:'forbidden',status:403});
  const id=match[1],method=options.method||'GET';let name,args;
  if(method==='GET'){
   name=id?'sill_getContent':'sill_listContents';args=id?{id}:Object.fromEntries(url.searchParams);
  }else{
   name={POST:'sill_createContent',PATCH:'sill_updateContent',DELETE:'sill_deleteContent'}[method];
   if(!name||method==='POST'&&id||method!=='POST'&&!id)throw new Error('无效操作');
   args={...(id?{id}:{}),idempotency_key:new Headers(options.headers).get('Idempotency-Key'),body:JSON.parse(options.body)};
  }
  return call({name,arguments:args});
 };
}

export function startCloudBridge(){
 const bridge=new App({name:'Sill · 窗台',version:'0.5.0'},{},{autoResize:false});
 const style=()=>{const context=bridge.getHostContext();if(context?.theme)applyDocumentTheme(context.theme);if(context?.styles?.variables)applyHostStyleVariables(context.styles.variables);};
 bridge.addEventListener('hostcontextchanged',style);
 const ready=bridge.connect().then(style);
 // Retain a rejected connection for callers without an unhandled rejection.
 ready.catch(()=>{});
 const statuses={unauthenticated:401,forbidden:403,not_found:404,revision_conflict:409,idempotency_conflict:409,rate_limited:429};
 window.__SILL_HOST__={request:createCloudTransport(async args=>{
  await ready;const result=await bridge.callServerTool(args);
  if(result.isError){let value;try{value=JSON.parse(result.content?.find(c=>c.type==='text')?.text);}catch{}
   const code=value?.error?.code||'unavailable';throw Object.assign(new Error('云端操作未完成'),{code,status:statuses[code]||503});
  }
  if(!result.structuredContent)throw Object.assign(new Error('云端返回内容无效'),{status:503});
  return result.structuredContent;
 }),manageAccess:()=>bridge.openLink({url:'https://sill-web-preview.scs1213-temp-email.workers.dev/oauth/grants'})};
}
