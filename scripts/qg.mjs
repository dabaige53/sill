import { readFile } from 'node:fs/promises';

// JSON on stdin or --file avoids shell escaping and keeps agent output bounded.
const [command='help',...args]=process.argv.slice(2);
const port=Number(process.env.QG_LOCAL_PORT||4318);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('QG_LOCAL_PORT 无效');
const origin='http://127.0.0.1:'+port;
if(command==='help'){
  console.log('Sill · 窗台本地操作\n  node scripts/qg.mjs capabilities\n  node scripts/qg.mjs list [关键词]\n  node scripts/qg.mjs get <卡片ID>\n  node scripts/qg.mjs open <卡片ID>\n  node scripts/qg.mjs state\n  node scripts/qg.mjs apply [--file JSON文件]\napply 输入：{operations:[...],expectedRevision?:number}；无 --file 时从 stdin 读取 JSON。');
}else try{
  let path='/api/local/state',options;
  if(command==='capabilities')path='/api/local/capabilities';
  else if(command==='open')path='/api/local/open?id='+encodeURIComponent(args[0]||'');
  else if(command==='apply'){
    let source;
    if(args[0]==='--file'&&args[1])source=await readFile(args[1],'utf8');
    else{const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);source=Buffer.concat(chunks).toString('utf8');}
    options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.parse(source))};path='/api/local/operations';
  }else if(!['state','list','get'].includes(command))throw new Error('未知命令，运行 help 查看用法');
  const response=await fetch(origin+path,{...options,signal:AbortSignal.timeout(5000)}),value=await response.json();
  if(!response.ok)throw new Error(value.error||'操作失败');
  let result=value;
  if(command==='list'){
    const query=args.join(' ').toLowerCase();result={revision:value.revision,cards:(value.state?.cards||[]).filter(card=>!query||[card.title,card.summary,...(card.sources||[]).map(source=>source.name),...(card.tags||[])].join(' ').toLowerCase().includes(query)).map(card=>({id:card.id,type:card.type,title:card.title,url:card.url,state:value.state.items[card.id]||{}}))};
  }else if(command==='get'){
    const card=value.state?.cards.find(card=>card.id===args[0]);if(!card)throw new Error('卡片不存在');result={revision:value.revision,card,state:value.state.items[card.id]||{}};
  }else if(command==='apply')result={ok:true,revision:value.revision,count:value.state.cards.length};
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(JSON.stringify({error:error.message,cause:error.cause?.code,suggestion:error.cause?'请先在项目目录运行 npm start':undefined}));process.exitCode=1;}
