/* Same-server MCP adapter; no fetch, credentials, or external connector tokens. */
export function createHostTransport(call) {
  return async(path,options={})=>{
    const url=new URL(path,'https://quiet-glass.invalid'),method=options.method||'GET';
    const data=options.body?JSON.parse(options.body):{};
    let name,args;
    if(url.pathname==='/api/status'){name='qg_status';args={};}
    else if(url.pathname==='/api/settings'){name=method==='PATCH'?'qg_update_settings':'qg_read_settings';args=data;}
    else if(url.pathname==='/api/recommend'&&method==='POST'){name='qg_recommend';args=data;}
    else if(url.pathname==='/api/feed'){name='qg_search';args={query:'',limit:100,offset:Number(url.searchParams.get('offset')||0)};}
    else if(url.pathname==='/api/feedback'){name='qg_feedback';args=data;}
    else if(url.pathname==='/api/notes'&&method==='POST'){name='qg_create_note';args=data;}
    else if(/^\/api\/notes\/[^/]+$/.test(url.pathname)&&method==='PATCH'){name='qg_update_note';args={...data,cardId:decodeURIComponent(url.pathname.split('/')[3])};}
    else if(/^\/api\/cards\/[^/]+\/annotation$/.test(url.pathname)){name=method==='PATCH'?'qg_update_annotation':'qg_read_annotation';args={...data,cardId:decodeURIComponent(url.pathname.split('/')[3])};}
    else if(/^\/api\/cards\/[^/]+$/.test(url.pathname)){name='qg_get_card';args={cardId:decodeURIComponent(url.pathname.split('/')[3])};}
    else throw new Error('此操作请在独立网页或已授权的工具流程中继续');
    const result=await call({name,arguments:args});
    const value=result.structuredContent??JSON.parse(result.content?.find(c=>c.type==='text')?.text||'{}');
    if(result.isError)throw Object.assign(new Error(value.message||'工具调用失败'),value);
    return value;
  };
}
