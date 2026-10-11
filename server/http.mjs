import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createMcpServer } from './mcp.mjs';
import { JobUpdate, JobRun, JobGet } from './jobs.mjs';
import { ROOT } from './config.mjs';
import { NotePatch, AnnotationPatch, ConversationRead, RequestAnswer, QGError, publicError } from './schemas.mjs';

const parsedBody=Symbol('parsedBody'),bodyBytes=Symbol('bodyBytes');
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));}
async function body(req,maxBytes=512*1024) {
  if(Object.hasOwn(req,parsedBody))return req[parsedBody];
  if(!req.headers['content-type']?.startsWith('application/json'))throw new QGError('CONTENT_TYPE','需要 application/json');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>maxBytes)throw new QGError('BODY_TOO_LARGE','请求超过允许大小');chunks.push(chunk);}
  try{req[bodyBytes]=size;return req[parsedBody]=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new QGError('INVALID_JSON','JSON 格式无效');}
}
function queryArgs(url) {
  const result=Object.create(null);
  for(const [key,value] of url.searchParams){
    if(Object.hasOwn(result,key))throw new QGError('INVALID_INPUT','查询参数不能重复');
    if(['limit','offset'].includes(key)){
      if(!/^\d+$/.test(value))throw new QGError('INVALID_INPUT','分页参数必须是非负整数');
      result[key]=Number(value);
    }else result[key]=value;
  }
  return result;
}
export async function startHttp(service,{host='127.0.0.1',port=4317,token=process.env.QG_AUTH_TOKEN,publicOrigin=process.env.QG_PUBLIC_ORIGIN}={}) {
  if(!token||Buffer.byteLength(token)<32)throw new QGError('AUTH_CONFIG','HTTP 服务需要至少 32 字节的 QG_AUTH_TOKEN');
  if(!['127.0.0.1','localhost','::1'].includes(host)&&(!publicOrigin||new URL(publicOrigin).protocol!=='https:'))throw new QGError('HTTPS_REQUIRED','非本机监听需要 HTTPS 反向代理和 QG_PUBLIC_ORIGIN');
  const sessions=new Map(),loginAttempts=new Map();
  let actualPort=port;
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      const origins=new Set([`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`,`http://[::1]:${actualPort}`,...(publicOrigin?[new URL(publicOrigin).origin]:[])]);
      const hosts=new Set([...origins].map(o=>new URL(o).host));
      if(!hosts.has(req.headers.host)||req.headers.origin&&!origins.has(req.headers.origin)){json(res,403,{error:'Origin or Host rejected'});return;}
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/health'){json(res,200,{ok:true});return;}
      if(req.method==='POST'&&url.pathname==='/api/session'){
        const key=req.socket.remoteAddress,attempt=loginAttempts.get(key)||{count:0,until:Date.now()+60000};
        if(attempt.until<Date.now()){attempt.count=0;attempt.until=Date.now()+60000;}
        if(++attempt.count>10){json(res,429,{error:'Too many login attempts'});return;}
        loginAttempts.set(key,attempt);
        const input=z.object({token:z.string().max(4096)}).strict().parse(await body(req));
        const loginActor=service.access.authenticate(input.token,{ownerToken:token,transport:'http'});
        if(loginActor.kind!=='owner'){json(res,401,{error:'仅所有者可创建网页会话'});return;}
        for(const [id,expires] of sessions)if(expires<Date.now())sessions.delete(id);
        if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
        const session=randomBytes(32).toString('hex');sessions.set(session,Date.now()+8*3600000);
        res.setHeader('Set-Cookie',`qg_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicOrigin?.startsWith('https:')?'; Secure':''}`);
        json(res,200,{ok:true});return;
      }
      const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('qg_session='))?.slice(11);
      if(url.pathname==='/mcp'||url.pathname.startsWith('/api/')) {
        const transportName=url.pathname==='/mcp'?'mcp-http':'http';let actor;
        // An explicit bearer always wins. An invalid/restricted bearer cannot inherit an owner cookie.
        if(Object.hasOwn(req.headers,'authorization')){
          const bearer=typeof req.headers.authorization==='string'?/^Bearer (.+)$/.exec(req.headers.authorization)?.[1]:undefined;
          actor=service.access.authenticate(bearer,{ownerToken:token,transport:transportName});
        }else if(url.pathname!=='/mcp'&&cookie&&sessions.get(cookie)>Date.now())actor=service.access.owner({transport:transportName});
        else throw new QGError('AUTH_REQUIRED','请先连接 Quiet Glass');
        return await service.access.run(actor,async()=>{
        const scoped=service.access.facade(actor);
        if(actor.kind==='principal'&&url.pathname!=='/mcp'){
          const allowed=[['GET',/^\/api\/feed$/,'qg_search'],['POST',/^\/api\/search$/,'qg_search'],['POST',/^\/api\/recommend$/,'qg_recommend'],['GET',/^\/api\/cards\/[a-z0-9_-]+$/i,'qg_get_card'],['GET',/^\/api\/cards\/[a-z0-9_-]+\/annotation$/i,'qg_read_annotation'],['PATCH',/^\/api\/cards\/[a-z0-9_-]+\/annotation$/i,'qg_update_annotation'],['POST',/^\/api\/notes$/,'qg_create_note'],['PATCH',/^\/api\/notes\/[a-z0-9_-]+$/i,'qg_update_note'],['POST',/^\/api\/feedback$/,'qg_feedback'],['POST',/^\/api\/ingest$/,'qg_ingest']].find(([method,path])=>method===req.method&&path.test(url.pathname));
          if(!allowed)throw new QGError('ACCESS_DENIED','此身份无权执行该操作');
          service.access.assertTool(actor,allowed[2]);
          const query=queryArgs(url);if(url.pathname==='/api/feed')delete query.offset;z.object({}).strict().parse(query);
        }
        if(['POST','PATCH','PUT'].includes(req.method))await body(req,service.access.requestLimit(actor));
        service.access.assertRequestSize(actor,(req[bodyBytes]||0)+Buffer.byteLength(req.url||''));
        if(url.pathname==='/mcp') {
          // MCP uses bearer auth, not browser cookies, to keep the two trust boundaries explicit.
          if(req.method!=='POST'){res.setHeader('Allow','POST');json(res,405,{error:'Method not allowed'});return;}
          const parsed=await body(req),mcp=createMcpServer(service,{actor});
          const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
          res.on('close',()=>{transport.close();mcp.close();});
          await mcp.connect(transport);await transport.handleRequest(req,res,parsed);return;
        }
        if(req.method==='POST'&&url.pathname==='/api/search'){json(res,200,scoped.search(await body(req)));return;}
        if(req.method==='POST'&&url.pathname==='/api/recommend'){json(res,200,scoped.recommend(await body(req)));return;}
        if(req.method==='GET'&&url.pathname==='/api/status'){json(res,200,scoped.status());return;}
        if(req.method==='GET'&&url.pathname==='/api/ai'){z.object({}).strict().parse(queryArgs(url));json(res,200,scoped.aiStatus());return;}
        const aiMatch=url.pathname.match(/^\/api\/requests\/([a-z0-9_-]+)\/ai(?:\/(start|cancel|events))?$/i);
        if(aiMatch){
          z.object({}).strict().parse(queryArgs(url));const requestId=aiMatch[1],operation=aiMatch[2];
          if(req.method==='POST'&&['start','cancel'].includes(operation)){
            z.object({}).strict().parse(await body(req));json(res,operation==='start'?202:200,operation==='start'?scoped.startAi({requestId}):scoped.cancelAi({requestId}));return;
          }
          if(req.method==='GET'&&!operation){json(res,200,scoped.getAi({requestId}));return;}
          if(req.method==='GET'&&operation==='events'){
            scoped.getAi({requestId});
            res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
            let previous='',closed=false,blocked=false,timer;
            const close=()=>{closed=true;clearInterval(timer);};
            res.on('close',close);res.on('drain',()=>{blocked=false;});
            const send=()=>{
              if(closed||blocked)return;
              try{const snapshot=scoped.getAi({requestId}),serialized=JSON.stringify(snapshot);
                if(serialized!==previous){previous=serialized;blocked=!res.write('event: snapshot\ndata: '+serialized+'\n\n');}
                if(snapshot.status!=='running'){close();res.end();}
              }catch{close();res.end();}
            };
            timer=setInterval(send,500);send();return;
          }
        }
        if(req.method==='GET'&&url.pathname==='/api/settings'){json(res,200,scoped.readSettings());return;}
        if(req.method==='PATCH'&&url.pathname==='/api/settings'){json(res,200,scoped.updateSettings(await body(req)));return;}
        if(req.method==='POST'&&url.pathname==='/api/ingest'){z.object({}).strict().parse(queryArgs(url));json(res,200,scoped.ingest(await body(req)));return;}
        if(req.method==='POST'&&url.pathname==='/api/notes'){json(res,201,scoped.createNote(await body(req)));return;}
        const noteMatch=url.pathname.match(/^\/api\/notes\/([a-z0-9_-]+)$/i);
        if(req.method==='PATCH'&&noteMatch){
          const input=NotePatch.parse(await body(req));
          json(res,200,scoped.updateNote({...input,cardId:noteMatch[1]}));return;
        }
        const annotationMatch=url.pathname.match(/^\/api\/cards\/([a-z0-9_-]+)\/annotation$/i);
        if(req.method==='GET'&&annotationMatch){json(res,200,scoped.readAnnotation({cardId:annotationMatch[1]}));return;}
        if(req.method==='PATCH'&&annotationMatch){
          const input=AnnotationPatch.parse(await body(req));
          json(res,200,scoped.updateAnnotation({...input,cardId:annotationMatch[1]}));return;
        }
        if(req.method==='GET'&&url.pathname==='/api/feed'){json(res,200,scoped.search({limit:100,offset:Number(url.searchParams.get('offset')||0)}));return;}
        const cardMatch=url.pathname.match(/^\/api\/cards\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&cardMatch){json(res,200,scoped.getCard(cardMatch[1]));return;}
        if(req.method==='POST'&&url.pathname==='/api/feedback'){const a=z.object({cardId:z.string(),state:z.object({read:z.boolean().optional(),bookmarked:z.boolean().optional(),dismissed:z.boolean().optional(),snoozedUntil:z.string().datetime({offset:true}).nullable().optional()}).strict()}).strict().parse(await body(req));json(res,200,scoped.feedback(a.cardId,a.state));return;}
        if(req.method==='POST'&&url.pathname==='/api/collect'){
          const a=z.object({connectorIds:z.array(z.string()).min(1).max(30)}).strict().parse(await body(req));
          a.connectorIds.forEach(id=>scoped.connectors.get(id));
          const w=scoped.createWorkflow({goal:'从信息流刷新已配置的数据源',steps:a.connectorIds.map((id,i)=>({id:`source_${i}`,operation:'collect',input:{connectorId:id,pageSize:20,maxPages:1}}))});
          json(res,202,scoped.startWorkflow(w.id));return;
        }
        const workflowMatch=url.pathname.match(/^\/api\/workflows\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&workflowMatch){json(res,200,scoped.getWorkflow(workflowMatch[1]));return;}
        if(req.method==='GET'&&url.pathname==='/api/scripts'){json(res,200,await scoped.listScripts(queryArgs(url)));return;}
        if(url.pathname==='/api/script-runs'){
          if(req.method==='GET'){json(res,200,scoped.listScriptRuns(queryArgs(url)));return;}
          if(req.method==='POST'){z.object({}).strict().parse(queryArgs(url));json(res,202,scoped.runScript(await body(req)));return;}
        }
        const scriptRunMatch=url.pathname.match(/^\/api\/script-runs\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&scriptRunMatch){z.object({}).strict().parse(queryArgs(url));json(res,200,scoped.getScriptRun({runId:scriptRunMatch[1]}));return;}
        const scriptCancelMatch=url.pathname.match(/^\/api\/script-runs\/([a-z0-9_-]+)\/cancel$/i);
        if(req.method==='POST'&&scriptCancelMatch){z.object({}).strict().parse(queryArgs(url));z.object({}).strict().parse(await body(req));json(res,200,scoped.cancelScriptRun({runId:scriptCancelMatch[1]}));return;}
        if(url.pathname==='/api/jobs'){
          if(req.method==='GET'){json(res,200,scoped.listJobs(queryArgs(url)));return;}
          if(req.method==='POST'){z.object({}).strict().parse(queryArgs(url));json(res,201,scoped.createJob(await body(req)));return;}
        }
        const jobMatch=url.pathname.match(/^\/api\/jobs\/([a-z0-9_-]+)$/i);
        if(jobMatch){
          if(req.method==='GET'){const input=JobGet.omit({jobId:true}).parse(queryArgs(url));json(res,200,scoped.getJob({...input,jobId:jobMatch[1]}));return;}
          if(req.method==='PATCH'){z.object({}).strict().parse(queryArgs(url));const input=JobUpdate.omit({jobId:true}).parse(await body(req));json(res,200,scoped.updateJob({...input,jobId:jobMatch[1]}));return;}
        }
        const runJobMatch=url.pathname.match(/^\/api\/jobs\/([a-z0-9_-]+)\/run$/i);
        if(req.method==='POST'&&runJobMatch){z.object({}).strict().parse(queryArgs(url));const input=JobRun.omit({jobId:true}).parse(await body(req));json(res,202,scoped.runJob({...input,jobId:runJobMatch[1]}));return;}
        const cancelJobMatch=url.pathname.match(/^\/api\/job-runs\/([a-z0-9_-]+)\/cancel$/i);
        if(req.method==='POST'&&cancelJobMatch){z.object({}).strict().parse(queryArgs(url));z.object({}).strict().parse(await body(req));json(res,200,scoped.cancelJobRun({runId:cancelJobMatch[1]}));return;}
        if(req.method==='POST'&&url.pathname==='/api/conversations'){json(res,201,scoped.createConversation(await body(req)));return;}
        if(req.method==='GET'&&url.pathname==='/api/conversations'){json(res,200,scoped.listConversations(queryArgs(url)));return;}
        const conversationMatch=url.pathname.match(/^\/api\/conversations\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&conversationMatch){
          const input=ConversationRead.omit({conversationId:true}).parse(queryArgs(url));
          json(res,200,scoped.readConversation({...input,conversationId:conversationMatch[1]}));return;
        }
        if(req.method==='POST'&&url.pathname==='/api/requests'){json(res,201,scoped.createRequest(await body(req),{allowLegacy:true}));return;}
        if(req.method==='GET'&&url.pathname==='/api/requests'){json(res,200,scoped.listRequests(queryArgs(url)));return;}
        const answerMatch=url.pathname.match(/^\/api\/requests\/([a-z0-9_-]+)\/answer$/i);
        if(req.method==='POST'&&answerMatch){
          const input=RequestAnswer.omit({requestId:true}).parse(await body(req));
          json(res,200,scoped.answerRequest({...input,requestId:answerMatch[1]}));return;
        }
        const requestMatch=url.pathname.match(/^\/api\/requests\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&requestMatch){z.object({}).strict().parse(queryArgs(url));json(res,200,scoped.getRequest({requestId:requestMatch[1]}));return;}
        json(res,404,{error:'Not found'});return;
        });
      }
      const paths={'/':'index.html','/index.html':'index.html','/components.html':'components.html','/cards.html':'cards.html','/icons.html':'icons.html','/research.html':'research.html','/web/live.js':'web/live.js','/web/jobs.js':'web/jobs.js','/web/scripts.js':'web/scripts.js','/web/preferences.js':'web/preferences.js','/web/content.js':'web/content.js','/web/conversations.js':'web/conversations.js','/web/ai.js':'web/ai.js'};
      if(req.method!=='GET'||!Object.hasOwn(paths,url.pathname)){json(res,404,{error:'Not found'});return;}
      let content=await readFile(resolve(ROOT,paths[url.pathname]),'utf8');
      if(paths[url.pathname]==='index.html')content=content.replace('<head>','<head><script>window.__QG_RUNTIME__=true;</script>');
      res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(content);
    }catch(error){if(!res.headersSent)json(res,error instanceof QGError&&['AUTH_REQUIRED'].includes(error.code)?401:error instanceof QGError&&['ACCESS_DENIED'].includes(error.code)?403:error instanceof QGError&&['RATE_LIMITED','CONCURRENCY_LIMIT','JOB_LIMIT','JOB_CONCURRENCY_LIMIT','JOB_HISTORY_LIMIT','JOB_RECEIPT_LIMIT','SCRIPT_CONCURRENCY_LIMIT','SCRIPT_HISTORY_LIMIT','SCRIPT_RECEIPT_LIMIT'].includes(error.code)?429:error instanceof QGError&&['BODY_TOO_LARGE'].includes(error.code)?413:error instanceof QGError&&['SETTINGS_CONFLICT','NOTE_CONFLICT','ANNOTATION_CONFLICT','IDEMPOTENCY_CONFLICT','ANSWER_CONFLICT','AI_CONCURRENCY_LIMIT','AI_DAILY_LIMIT','REQUEST_ALREADY_ANSWERED','INGEST_CONFLICT','JOB_CONFLICT','JOB_IDEMPOTENCY_CONFLICT','JOB_BUSY','JOB_RUN_PRUNED','SCRIPT_IDEMPOTENCY_CONFLICT','SCRIPT_RUN_PRUNED'].includes(error.code)?409:error instanceof QGError&&['CONVERSATION_NOT_FOUND','REQUEST_NOT_FOUND','JOB_NOT_FOUND','JOB_RUN_NOT_FOUND','SCRIPT_NOT_FOUND','SCRIPT_RUN_NOT_FOUND'].includes(error.code)?404:error instanceof QGError&&['JOB_UNAVAILABLE','JOB_STORAGE_LIMIT','SCRIPT_RUNTIME_UNAVAILABLE','SCRIPT_UNAVAILABLE','SCRIPT_STORAGE_LIMIT'].includes(error.code)?503:400,publicError(error));else res.end();}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,()=>{actualPort=server.address().port;accept();});});
  return server;
}
