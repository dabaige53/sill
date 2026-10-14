import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { V1Capabilities,errorBody,fail } from './v1-capabilities.mjs';

export function createV1HTTP(repository,{principals=[],destinations={}}={}){
  const service=new V1Capabilities(repository,{destinations});
  // Configuration is local operator input, never a request-supplied identity.
  const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).refine(v=>!['__proto__','constructor','prototype'].includes(v));
  const principal=z.object({id,owner:z.literal('local'),token:z.string().min(24).max(4096),scopes:z.array(z.enum(['content:read','content:write','content:delete','event:submit','event:read','event:result'])),cards:z.union([z.literal('*'),z.array(id)]),tools:z.array(z.string()).optional()}).strict();
  if(!z.array(principal).max(100).safeParse(principals).success)throw new Error('Invalid local MCP principal configuration');
  const destination=z.object({mode:z.literal('manual'),submitters:z.array(id),assignee:id,actions:z.array(z.enum(['summarize','complete']))}).strict();
  if(!z.record(id,destination).safeParse(destinations).success)throw new Error('Invalid manual destination configuration');
  for(const d of Object.values(destinations))if(![d.assignee,...d.submitters].every(id=>principals.some(p=>p.id===id)))throw new Error('Unknown manual destination identity');
  if(new Set(principals.map(p=>p.token)).size!==principals.length||new Set(principals.map(p=>p.id)).size!==principals.length)throw new Error('Duplicate local MCP principal');
  const authenticate=req=>{
    const token=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));
    const match=principals.find(p=>{const expected=Buffer.from(p.token);return token.length===expected.length&&timingSafeEqual(token,expected);});
    if(!match)fail(401,'unauthenticated','需要有效的本地 MCP 凭据');
    const {token:_,...actor}=match;return actor;
  };
  return async(req,res,url,json)=>{
    if(!url.pathname.startsWith('/api/v1/'))return false;
    try{
      if(url.pathname==='/api/v1/health'&&req.method==='GET'){json(200,{ok:true,mode:'local-v1',mcp:'stdio',webhook:false});return true;}
      const actor=authenticate(req);
      if(url.pathname==='/api/v1/tools'&&req.method==='GET'){json(200,{tools:service.listTools(actor)});return true;}
      let input={};
      if(['POST','PATCH','DELETE'].includes(req.method)){
        if(req.headers['content-type']?.split(';')[0]!=='application/json')fail(415,'invalid_request','需要 application/json');
        const chunks=[];let length=0;
        for await(const chunk of req){length+=chunk.length;if(length>6*1024*1024)fail(413,'invalid_request','请求过大');chunks.push(chunk);}
        try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'invalid_request','JSON 格式错误');}
      }
      const parts=url.pathname.split('/').filter(Boolean);let name,args=input;
      if(parts[2]==='tools'&&parts.length===4&&req.method==='POST')name=parts[3];
      else{
        const resource=parts[2],id=parts.length===4?decodeURIComponent(parts[3]):undefined;
        if(parts.length>4)fail(404,'not_found','接口不存在');
        if(req.method==='GET'){
          name=resource==='contents'?(id?'sill_getContent':'sill_listContents'):resource==='events'&&id?'sill_getEvent':undefined;
          args=id?{id}:Object.fromEntries(url.searchParams);if(args.limit!==undefined)args.limit=Number(args.limit);
        }else{
          name=resource==='contents'?(req.method==='POST'&&!id?'sill_createContent':req.method==='PATCH'&&id?'sill_updateContent':req.method==='DELETE'&&id?'sill_deleteContent':undefined):resource==='events'&&req.method==='POST'&&!id?'sill_submitEvent':undefined;
          args={...(id?{id}:{}),idempotency_key:req.headers['idempotency-key'],body:input};
        }
      }
      if(!name)fail(404,'not_found','接口不存在');
      const result=service.call(actor,name,args);json(name==='sill_submitEvent'?202:name==='sill_createContent'?201:200,result);
    }catch(e){json(e.status||400,errorBody(e));}
    return true;
  };
}
