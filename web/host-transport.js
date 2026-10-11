/* Same-server MCP adapter; no fetch, credentials, or external connector tokens. */
export function createHostTransport(call) {
  return async(path,options={})=>{
    const url=new URL(path,'https://quiet-glass.invalid'),method=options.method||'GET';
    const data=options.body?JSON.parse(options.body):{};
    let name,args;
    const jobRoute=/^\/api\/(?:jobs(?:\/|$)|job-runs(?:\/|$))/.test(url.pathname);
    let jobQuery={};
    if(jobRoute){
      const invalid=()=>{throw Object.assign(new Error('任务参数不符合接口定义'),{code:'INVALID_INPUT'});};
      if(!data||typeof data!=='object'||Array.isArray(data))invalid();
      for(const [key,value] of url.searchParams){
        if(method!=='GET'||!['limit','offset'].includes(key)||Object.hasOwn(jobQuery,key)||!/^\d+$/.test(value))invalid();
        jobQuery[key]=Number(value);if(!Number.isSafeInteger(jobQuery[key]))invalid();
      }
      if(method==='GET'&&Object.keys(data).length)invalid();
      if(url.pathname!=='/api/jobs'&&(Object.hasOwn(data,'jobId')||Object.hasOwn(data,'runId')))invalid();
      if(/^\/api\/job-runs\/[^/]+\/cancel$/.test(url.pathname)&&Object.keys(data).length)invalid();
    }

    if(url.pathname==='/api/status'){name='qg_status';args={};}
    else if(url.pathname==='/api/settings'){name=method==='PATCH'?'qg_update_settings':'qg_read_settings';args=data;}
    else if(url.pathname==='/api/jobs'&&method==='GET'){name='qg_list_jobs';args=jobQuery;}
    else if(url.pathname==='/api/jobs'&&method==='POST'){name='qg_create_job';args=data;}
    else if(/^\/api\/jobs\/[^/]+$/.test(url.pathname)&&['GET','PATCH'].includes(method)){name=method==='PATCH'?'qg_update_job':'qg_get_job';args={...(method==='PATCH'?data:jobQuery),jobId:decodeURIComponent(url.pathname.split('/')[3])};}
    else if(/^\/api\/jobs\/[^/]+\/run$/.test(url.pathname)&&method==='POST'){name='qg_run_job';args={...data,jobId:decodeURIComponent(url.pathname.split('/')[3])};}
    else if(/^\/api\/job-runs\/[^/]+\/cancel$/.test(url.pathname)&&method==='POST'){name='qg_cancel_job_run';args={...data,runId:decodeURIComponent(url.pathname.split('/')[3])};}
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
