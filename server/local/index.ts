import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalRepository, capabilities } from './local-state.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function startLocal({port=4318,file=resolve(root,'.sill/local/cards.json')}={}){
  const repository=new LocalRepository(file);
  let actualPort=port;
  const server=createServer(async(req,res)=>{
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    try{
      const origins=[`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`];
      if(!origins.some(origin=>new URL(origin).host===req.headers.host)||req.headers.origin&&!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'){json(403,{error:'仅接受本地同源访问'});return;}
      const url=new URL(req.url,origins[0]);
      if(req.method==='GET'&&url.pathname==='/health'){json(200,{ok:true,mode:'local'});return;}
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
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{actualPort=server.address().port;accept();});});
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await startLocal();console.log('Sill 本地卡片：http://127.0.0.1:'+server.address().port+'/#feed');
}
