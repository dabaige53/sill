import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createMcpServer } from './mcp.mjs';
import { ROOT } from './config.mjs';
import { QGError, publicError } from './schemas.mjs';
import { uid } from './store.mjs';

const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value));}
async function body(req) {
  if(!req.headers['content-type']?.startsWith('application/json'))throw new QGError('CONTENT_TYPE','需要 application/json');
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>512*1024)throw new QGError('BODY_TOO_LARGE','请求超过 512 KB');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new QGError('INVALID_JSON','JSON 格式无效');}
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
        const input=await body(req);
        if(!equal(input.token,token)){json(res,401,{error:'访问密钥无效'});return;}
        for(const [id,expires] of sessions)if(expires<Date.now())sessions.delete(id);
        if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
        const session=randomBytes(32).toString('hex');sessions.set(session,Date.now()+8*3600000);
        res.setHeader('Set-Cookie',`qg_session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${publicOrigin?.startsWith('https:')?'; Secure':''}`);
        json(res,200,{ok:true});return;
      }
      const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('qg_session='))?.slice(11);
      const authenticated=equal(req.headers.authorization,`Bearer ${token}`)||(cookie&&sessions.get(cookie)>Date.now());
      if(url.pathname==='/mcp'||url.pathname.startsWith('/api/')) {
        if(!authenticated){json(res,401,{error:'请先连接 Quiet Glass'});return;}
        if(url.pathname==='/mcp') {
          // MCP uses bearer auth, not browser cookies, to keep the two trust boundaries explicit.
          if(!equal(req.headers.authorization,`Bearer ${token}`)){json(res,401,{error:'Bearer token required'});return;}
          if(req.method!=='POST'){res.setHeader('Allow','POST');json(res,405,{error:'Method not allowed'});return;}
          const parsed=await body(req),mcp=createMcpServer(service);
          const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
          res.on('close',()=>{transport.close();mcp.close();});
          await mcp.connect(transport);await transport.handleRequest(req,res,parsed);return;
        }
        if(req.method==='GET'&&url.pathname==='/api/status'){json(res,200,service.status());return;}
        if(req.method==='GET'&&url.pathname==='/api/feed'){json(res,200,service.search({limit:100,offset:Number(url.searchParams.get('offset')||0)}));return;}
        const cardMatch=url.pathname.match(/^\/api\/cards\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&cardMatch){json(res,200,service.getCard(cardMatch[1]));return;}
        if(req.method==='POST'&&url.pathname==='/api/feedback'){const a=await body(req);json(res,200,service.feedback(a.cardId,a.state));return;}
        if(req.method==='POST'&&url.pathname==='/api/collect'){
          const a=z.object({connectorIds:z.array(z.string()).min(1).max(30)}).strict().parse(await body(req));
          a.connectorIds.forEach(id=>service.connectors.get(id));
          const w=service.createWorkflow({goal:'从信息流刷新已配置的数据源',steps:a.connectorIds.map((id,i)=>({id:`source_${i}`,operation:'collect',input:{connectorId:id,pageSize:20,maxPages:1}}))});
          json(res,202,service.startWorkflow(w.id));return;
        }
        const workflowMatch=url.pathname.match(/^\/api\/workflows\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&workflowMatch){json(res,200,service.getWorkflow(workflowMatch[1]));return;}
        if(req.method==='POST'&&url.pathname==='/api/requests'){
          const a=z.object({question:z.string().min(1).max(4000),cardIds:z.array(z.string()).max(20)}).strict().parse(await body(req));
          a.cardIds.forEach(id=>service.getCard(id));
          const r={...a,id:uid('request'),status:'pending',createdAt:new Date().toISOString()};service.store.put('request',r.id,r);json(res,201,r);return;
        }
        const requestMatch=url.pathname.match(/^\/api\/requests\/([a-z0-9_-]+)$/i);
        if(req.method==='GET'&&requestMatch){const r=service.store.get('request',requestMatch[1]);json(res,r?200:404,r||{error:'请求不存在'});return;}
        json(res,404,{error:'Not found'});return;
      }
      const paths={'/':'index.html','/index.html':'index.html','/components.html':'components.html','/cards.html':'cards.html','/icons.html':'icons.html','/research.html':'research.html','/web/live.js':'web/live.js'};
      if(req.method!=='GET'||!Object.hasOwn(paths,url.pathname)){json(res,404,{error:'Not found'});return;}
      let content=await readFile(resolve(ROOT,paths[url.pathname]),'utf8');
      if(paths[url.pathname]==='index.html')content=content.replace('<head>','<head><script>window.__QG_RUNTIME__=true;</script>');
      res.writeHead(200,{'Content-Type':url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'}).end(content);
    }catch(error){if(!res.headersSent)json(res,400,publicError(error));else res.end();}
  });
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,()=>{actualPort=server.address().port;accept();});});
  return server;
}
