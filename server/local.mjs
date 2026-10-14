import { createServer } from 'node:http';
import { openSync,closeSync,unlinkSync,mkdirSync } from 'node:fs';
import { createV1HTTP } from './v1-http.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalRepository, capabilities } from './local-state.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function startLocal({port=4318,file=resolve(root,'.quiet-glass/local/cards.json'),principals=[],destinations={}}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid local port');
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const lock=file+'.lock';let lockFd;
  try{lockFd=openSync(lock,'wx',0o600);}catch{throw new Error('Data file is locked by another service; after a crash verify no writer remains before removing its .lock file');}
  let repository,v1;
  try{repository=new LocalRepository(file);v1=createV1HTTP(repository,{principals,destinations});}catch(error){closeSync(lockFd);unlinkSync(lock);throw error;}
  let actualPort=port;
  const server=createServer(async(req,res)=>{
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      const origins=[`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`];
      if(!origins.some(origin=>new URL(origin).host===req.headers.host)||req.headers.origin&&!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'){json(403,{error:'仅接受本地同源访问'});return;}
      const url=new URL(req.url,origins[0]);
      if(req.method==='GET'&&url.pathname==='/health'){json(200,{ok:true,mode:'local'});return;}
      if(await v1(req,res,url,json))return;
      if(url.pathname.startsWith('/api/local/')){
        if(req.method==='GET'&&url.pathname==='/api/local/state'){json(200,repository.snapshot());return;}
        if(req.method==='GET'&&url.pathname==='/api/local/capabilities'){json(200,capabilities);return;}
        if(req.method==='GET'&&url.pathname==='/api/local/open'){
          const id=url.searchParams.get('id'),card=repository.snapshot().state?.cards.find(card=>card.id===id);
          if(!card){json(404,{error:'卡片不存在'});return;}
          json(200,{preview:origins[0]+'/#card/'+encodeURIComponent(id),reading:origins[0]+'/#read/'+encodeURIComponent(id),source:card.url||null});return;
        }
        if(req.method==='POST'&&['/api/local/initialize','/api/local/operations'].includes(url.pathname)){
          if(req.headers['content-type']?.split(';')[0]!=='application/json'){json(415,{error:'需要 application/json'});return;}
          let size=0;const chunks=[];
          for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw new Error('内容超过 8 MB');chunks.push(chunk);}
          const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
          json(200,url.pathname.endsWith('initialize')?repository.initialize(input):repository.apply(input));return;
        }
        json(404,{error:'接口不存在'});return;
      }
      if(req.method==='GET'&&['/','/index.html'].includes(url.pathname)){
        const page=await readFile(resolve(root,'index.html'),'utf8');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        res.end(page.replace('<head>','<head><script>window.__QG_LOCAL__=true;</script>'));return;
      }
      json(404,{error:'Not found'});
    }catch(error){json(error.status||400,{error:error.message});}
  });
  const unlock=()=>{if(lockFd!==undefined){closeSync(lockFd);lockFd=undefined;unlinkSync(lock);}};
  server.once('close',unlock);server.once('error',unlock);
  try{await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{actualPort=server.address().port;accept();});});}catch(error){unlock();throw error;}
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const config=process.env.SILL_MCP_CONFIG?JSON.parse(process.env.SILL_MCP_CONFIG):{};
  const server=await startLocal({port:Number(process.env.QG_LOCAL_PORT||4318),principals:config.principals||[],destinations:config.destinations||{}});
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));console.log('Quiet Glass 本地卡片：http://127.0.0.1:'+server.address().port+'/#feed');
}
