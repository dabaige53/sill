/* Registered owner jobs only. Opening this panel never creates, resumes or runs a job. */
window.initSillJobs=({app,panels,esc,api,post,isConnected})=>{
  const kinds={'recommendation-snapshot':'推荐快照','data-quality-digest':'数据质量摘要'};
  const labels={running:'运行中',completed:'已完成',failed:'失败',cancelled:'已取消',timed_out:'已超时',interrupted:'已中断'};
  const storageKey='sill-jobs-draft-v1:'+(window.__QG_HOST__?'host':'web');
  const pageSize=10,historySize=10;
  const defaultDraft=()=>({title:'',kind:'recommendation-snapshot',intervalSeconds:'3600',startAt:new Date(Date.now()+3600000).toISOString().slice(0,16)});
  const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const validKey=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const validDraft=value=>value&&typeof value.title==='string'&&value.title.length<=120&&Object.hasOwn(kinds,value.kind)&&typeof value.intervalSeconds==='string'&&value.intervalSeconds.length<=10&&typeof value.startAt==='string'&&value.startAt.length<=30;
  const validAttempt=value=>value&&validKey(value.idempotencyKey)&&value.paused===true&&Object.hasOwn(kinds,value.kind)&&typeof value.title==='string'&&value.title.length<=120&&Number.isInteger(value.schedule?.intervalSeconds)&&value.schedule.intervalSeconds>=60&&value.schedule.intervalSeconds<=2592000&&typeof value.schedule.startAt==='string'&&value.schedule.startAt.length<=40&&Number.isFinite(Date.parse(value.schedule.startAt));
  let draft=defaultDraft(),createAttempt=null,runAttempts=Object.create(null),storageFailed=false;
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(validDraft(saved?.draft))draft=saved.draft;
    if(validAttempt(saved?.createAttempt))createAttempt=saved.createAttempt;
    if(saved?.runAttempts&&typeof saved.runAttempts==='object'&&!Array.isArray(saved.runAttempts)){
      for(const [id,key] of Object.entries(saved.runAttempts).slice(0,100))if(validId(id)&&validKey(key))runAttempts[id]=key;
    }
  }catch{/* Malformed browser data is ignored, never automatically submitted. */}
  let snapshot=null,jobs=[],offset=0,nextOffset=null,total=0,selectedId=null,history=null,historyOffset=0;
  let notice='',listError='',historyError='',listRead=null,historyRead=null,epoch=0;
  const busy=new Set();
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify({draft,createAttempt,runAttempts}));}catch{storageFailed=true;}}
  const section=()=>app.modalKind==='settings'&&app.dialog.open?document.getElementById('qg-jobs-settings'):null;
  const view=()=>({token:app.modalToken,node:section()});
  const sameView=target=>!!target.node&&target.token===app.modalToken&&target.node===section();
  const expanded=()=>!!section()?.open;
  const formatTime=value=>value?String(value).replace('T',' ').replace('.000Z',' UTC').replace(/Z$/,' UTC'):'—';
  const button=(name,text,id='',disabled=false)=>`<button type="button" class="text-button" data-action="jobs-${name}"${id?` data-id="${esc(id)}"`:''}${disabled?' disabled':''}>${esc(text)}</button>`;
  const controls='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
  const inputStyle='box-sizing:border-box;max-width:100%;width:100%;min-width:0';
  function markup(){
    const value=createAttempt?{title:createAttempt.title,kind:createAttempt.kind,intervalSeconds:String(createAttempt.schedule.intervalSeconds),startAt:createAttempt.schedule.startAt.slice(0,16)}:draft;
    return `<details id="qg-jobs-settings" style="margin:18px 0;min-width:0;overflow-wrap:anywhere"><summary style="cursor:pointer">后台任务</summary><p class="settings-note">仅支持两个已注册的本地只读操作：推荐快照、数据质量摘要。运行结果保存在 Sill；不会抓取外部来源、执行代码或发送通知。</p><p class="settings-note" id="qg-jobs-worker" role="status"></p><p class="settings-note" id="qg-jobs-status" role="status" aria-live="polite"></p><div style="${controls}">${button('refresh','刷新任务与历史')}</div><details id="qg-jobs-create-form" style="margin:14px 0"><summary style="cursor:pointer">创建已暂停任务</summary><p class="settings-note">新任务一律暂停；恢复计划需另行点击。起始时间按 UTC 保存，每次间隔为 60–2592000 秒。</p><label class="field-label" for="qg-job-title">标题（可选）</label><input id="qg-job-title" data-job-field="title" maxlength="120" style="${inputStyle}" value="${esc(value.title)}"><label class="field-label" for="qg-job-kind">注册操作</label><select id="qg-job-kind" data-job-field="kind" style="${inputStyle}">${Object.entries(kinds).map(([kind,title])=>`<option value="${kind}"${value.kind===kind?' selected':''}>${title}</option>`).join('')}</select><label class="field-label" for="qg-job-start">计划起始时间（UTC）</label><input id="qg-job-start" data-job-field="startAt" type="datetime-local" step="60" style="${inputStyle}" value="${esc(value.startAt)}"><label class="field-label" for="qg-job-interval">间隔（秒；默认 3600 秒 = 1 小时）</label><input id="qg-job-interval" data-job-field="intervalSeconds" type="number" min="60" max="2592000" step="1" style="${inputStyle}" value="${esc(value.intervalSeconds)}"><p class="settings-note" id="qg-jobs-create-note"></p><button type="button" class="solid-button" data-action="jobs-create">创建已暂停任务</button></details><div id="qg-jobs-list" aria-busy="false"></div><div id="qg-jobs-list-pages" style="${controls}"></div><div id="qg-jobs-history" style="margin-top:16px;min-width:0"></div></details>`;
  }
  function replace(node,html){if(node&&node.__qgJobsMarkup!==html){node.innerHTML=html;node.__qgJobsMarkup=html;}}
  function render(){
    const root=section();if(!root)return;
    root.querySelector('#qg-jobs-worker').textContent=!isConnected()?'连接服务后可查看任务。':!snapshot?'展开后读取任务状态。':snapshot.workerEnabled?'调度工作器已启用；只有恢复计划的任务会按时执行。':'调度工作器已停用：自动计划不会执行，仍可手动运行。此处不能启用工作器。';
    root.querySelector('#qg-jobs-status').textContent=(notice||listError||(listRead?'正在读取任务…':''))+(storageFailed?' 浏览器无法保留重试记录；请保持当前页面，完成确认后再离开。':'');
    root.querySelector('[data-action="jobs-refresh"]').disabled=!isConnected()||!!listRead;
    root.querySelectorAll('[data-job-field]').forEach(field=>field.disabled=!!createAttempt||busy.has('create'));
    const createButton=root.querySelector('[data-action="jobs-create"]');
    createButton.disabled=!isConnected()||!snapshot||busy.has('create');
    createButton.textContent=busy.has('create')?'正在确认创建…':createAttempt?'重试上次创建请求':'创建已暂停任务';
    root.querySelector('#qg-jobs-create-note').textContent=createAttempt?'上次请求的结果尚未确认；重试会使用同一请求，不创建第二个任务。表单暂时锁定。':'只有点击创建才会保存。未提交内容保留在本浏览器。';
    root.querySelector('#qg-jobs-list').setAttribute('aria-busy',String(!!listRead));
    replace(root.querySelector('#qg-jobs-list'),jobs.length?jobs.map(job=>`<article data-job-id="${esc(job.id)}" style="padding:12px 0;border-bottom:1px solid var(--line,rgba(120,120,120,.2));min-width:0"><strong>${esc(job.title||kinds[job.kind]||job.kind)}</strong><p class="settings-note">${esc(kinds[job.kind]||job.kind)} · ${job.paused?'已暂停':'计划已恢复'} · 版本 ${esc(job.revision)}<br>每 ${esc(job.schedule?.intervalSeconds)} 秒 · 下次：${esc(formatTime(job.nextRunAt))}${job.activeRunId?'<br>有运行尚未结束，可在历史中查看或取消。':''}</p><div style="${controls}">${button('run',runAttempts[job.id]?'重试上次运行请求':'运行一次',job.id,!isConnected()||busy.has('run:'+job.id)||!!job.activeRunId&&!runAttempts[job.id])}${button(job.paused?'resume':'pause',job.paused?'恢复计划':'暂停计划',job.id,!isConnected()||busy.has('update:'+job.id))}${button('history','查看运行历史',job.id,!isConnected())}</div></article>`).join(''):snapshot?'<p class="settings-note">暂无任务。可按需创建已暂停任务。</p>':'');
    replace(root.querySelector('#qg-jobs-list-pages'),snapshot?`<span class="settings-note">共 ${esc(total)} 个任务；当前 ${jobs.length?offset+1:0}–${offset+jobs.length}</span>${offset?button('previous','上一页'):''}${nextOffset!==null?button('next','下一页'):''}`:'');
    renderHistory(root);
  }
  function renderHistory(root){
    const target=root.querySelector('#qg-jobs-history');
    if(!selectedId){replace(target,'');return;}
    const job=history?.job?.id===selectedId?history.job:jobs.find(item=>item.id===selectedId);
    const runs=history?.job?.id===selectedId?history.runs:[];
    const openResults=[...target.querySelectorAll('[data-job-result][open]')].map(node=>node.dataset.jobResult);
    const rendered=runs.map(run=>{
      let output='';
      if(run.result!=null){const raw=JSON.stringify(run.result,null,2);output=`<details data-job-result="${esc(run.id)}"${openResults.includes(run.id)?' open=""':''}><summary style="cursor:pointer">查看结果${raw.length>6000?'（节选）':''}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:220px;overflow:auto;font-size:12px">${esc(raw.slice(0,6000))}</pre></details>`;}
      return `<article data-job-run-id="${esc(run.id)}" style="padding:10px 0;min-width:0"><strong>${esc(labels[run.status]||run.status)}</strong><p class="settings-note">${run.trigger==='manual'?'手动运行':'计划运行'} · ${esc(formatTime(run.startedAt))}<br>运行 ID：${esc(run.id)}${run.finishedAt?`<br>结束：${esc(formatTime(run.finishedAt))}`:''}${run.error?`<br>${esc(run.error.code||'')}：${esc(String(run.error.message||'').slice(0,1000))}`:''}</p>${run.status==='running'?button('cancel','取消运行',run.id,busy.has('cancel:'+run.id)||!isConnected()):''}${output}</article>`;
    }).join('');
    const message=historyError||(!history&&historyRead?'正在读取运行历史…':!history?'':!runs.length?'暂无运行记录。':'');
    replace(target,`<h3 style="font-size:15px">${esc(job?.title||'任务')} · 运行历史</h3><p class="settings-note">只显示当前保留的历史，每页最多 ${historySize} 条；结果仅供查看。</p><p class="settings-note" id="qg-jobs-history-status" role="status">${esc(message)}</p>${rendered}${history?`<div style="${controls}"><span class="settings-note">共 ${esc(history.total)} 条保留记录</span>${historyOffset?button('history-previous','较新记录'):''}${history.nextOffset!==null?button('history-next','更早记录'):''}</div>`:''}`);
    target.querySelectorAll('[data-job-result]').forEach(node=>{if(openResults.includes(node.dataset.jobResult))node.open=true;});
  }
  function invalidate(){epoch++;listRead=null;historyRead=null;}
  function acceptJob(job){
    const index=jobs.findIndex(item=>item.id===job.id);
    if(index>=0&&jobs[index].revision<=job.revision)jobs[index]=job;
    if(history?.job.id===job.id&&history.job.revision<=job.revision)history.job=job;
  }
  async function readList(){
    if(!expanded()||!isConnected()||listRead)return;
    const token={epoch,view:view(),offset};listRead=token;listError='';render();
    try{
      const value=await api(`/api/jobs?limit=${pageSize}&offset=${token.offset}`);
      if(listRead!==token||epoch!==token.epoch||!sameView(token.view))return;
      snapshot=value;jobs=value.jobs.map(job=>{const previous=jobs.find(item=>item.id===job.id);return previous&&previous.revision>job.revision?previous:job;});total=value.total;nextOffset=value.nextOffset;
    }catch(error){if(listRead===token&&sameView(token.view))listError=`任务暂时无法读取：${error.message}。连接恢复后可点击刷新。`;}
    finally{if(listRead===token){listRead=null;if(sameView(token.view))render();}}
  }
  async function readHistory(){
    if(!expanded()||!isConnected()||!selectedId||historyRead)return;
    const token={epoch,view:view(),id:selectedId,offset:historyOffset};historyRead=token;historyError='';render();
    try{
      const value=await api(`/api/jobs/${encodeURIComponent(token.id)}?limit=${historySize}&offset=${token.offset}`);
      if(historyRead!==token||epoch!==token.epoch||selectedId!==token.id||historyOffset!==token.offset||!sameView(token.view))return;
      history=value;acceptJob(value.job);
    }catch(error){if(historyRead===token&&sameView(token.view))historyError=`运行历史暂不可用：${error.message}。请手动刷新。`;}
    finally{if(historyRead===token){historyRead=null;if(sameView(token.view))render();}}
  }
  function refreshVisible(){
    if(!expanded()||!isConnected()||busy.size)return;
    return Promise.all([readList(),readHistory()]);
  }
  function capture(){
    const root=section();if(!root||createAttempt)return;
    const value={};root.querySelectorAll('[data-job-field]').forEach(field=>value[field.dataset.jobField]=field.value);
    draft=value;persist();
  }
  function parsedDraft(){
    const intervalSeconds=Number(draft.intervalSeconds);
    if(!Number.isInteger(intervalSeconds)||intervalSeconds<60||intervalSeconds>2592000)throw new Error('间隔必须是 60–2592000 秒之间的整数。');
    if(!Object.hasOwn(kinds,draft.kind))throw new Error('请选择已注册操作。');
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.startAt))throw new Error('请填写有效的 UTC 起始时间。');
    const date=new Date(draft.startAt+':00.000Z');
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,16)!==draft.startAt)throw new Error('请填写有效的 UTC 起始时间。');
    return {title:draft.title.trim()||kinds[draft.kind],kind:draft.kind,schedule:{intervalSeconds,startAt:date.toISOString()},paused:true,idempotencyKey:crypto.randomUUID()};
  }
  async function create(){
    if(busy.has('create')||!isConnected()||!snapshot)return;
    capture();try{if(!createAttempt)createAttempt=parsedDraft();}catch(error){notice=error.message;render();return;}
    const submitted=createAttempt,target=view();persist();invalidate();busy.add('create');notice='正在创建已暂停任务…';render();
    try{
      const job=await post('/api/jobs',submitted);
      createAttempt=null;draft=defaultDraft();persist();notice='任务已创建并保持暂停；运行一次或恢复计划需另行点击。';
      if(sameView(target)){offset=0;selectedId=job.id;historyOffset=0;history=null;const value=draft;section().querySelectorAll('[data-job-field]').forEach(field=>field.value=value[field.dataset.jobField]);}
    }catch(error){
      if(error.code==='INVALID_INPUT'){createAttempt=null;persist();notice=`创建未通过验证：${error.message}。请修改表单后重试。`;}
      else if(['JOB_LIMIT','JOB_STORAGE_LIMIT'].includes(error.code)){createAttempt=null;persist();notice=`创建未执行：${error.message} 请联系服务运营者处理限额后再试。`;}
      else notice=`创建结果尚未确认：${error.message}。请手动重试上次请求；不会自动重发。`;
    }finally{busy.delete('create');render();if(sameView(target))await refreshVisible();}
  }
  async function run(id){
    if(!validId(id)||busy.has('run:'+id)||!isConnected())return;
    const job=jobs.find(item=>item.id===id);if(!job||job.activeRunId&&!runAttempts[id])return;
    if(!runAttempts[id]&&Object.keys(runAttempts).length>=100){notice='有较多运行请求尚未确认，请先逐一重试已有请求。';render();return;}
    const key=runAttempts[id]||(runAttempts[id]=crypto.randomUUID()),target=view();persist();invalidate();busy.add('run:'+id);notice='正在确认手动运行…';render();
    try{
      const result=await post(`/api/jobs/${encodeURIComponent(id)}/run`,{idempotencyKey:key});
      delete runAttempts[id];persist();notice=`已确认运行：${labels[result.status]||result.status}。`;
      if(sameView(target)&&(selectedId===id||!selectedId)){selectedId=id;historyOffset=0;history=null;}
    }catch(error){
      if(error.code==='JOB_RUN_PRUNED'){delete runAttempts[id];persist();notice='原运行记录已按保留策略清理；这次重试没有再次运行。再次点击运行一次才会创建新运行。';}
      else if(['INVALID_INPUT','JOB_NOT_FOUND','JOB_RECEIPT_LIMIT','JOB_STORAGE_LIMIT'].includes(error.code)){delete runAttempts[id];persist();notice=`运行未执行：${error.message}${['JOB_RECEIPT_LIMIT','JOB_STORAGE_LIMIT'].includes(error.code)?' 请联系服务运营者处理限额。':''}`;}
      else if(['JOB_BUSY','JOB_CONCURRENCY_LIMIT','JOB_HISTORY_LIMIT'].includes(error.code))notice=`本次运行尚未开始：${error.message} 条件恢复后可手动重试同一请求。`;
      else notice=`运行结果尚未确认：${error.message}。请手动重试同一请求；不会自动重发。`;
    }finally{busy.delete('run:'+id);render();if(sameView(target))await refreshVisible();}
  }
  async function setPaused(id,paused){
    const job=jobs.find(item=>item.id===id);if(!job||busy.has('update:'+id)||!isConnected())return;
    const target=view();invalidate();busy.add('update:'+id);notice=paused?'正在暂停计划…':'正在恢复计划…';render();
    try{
      const result=await api(`/api/jobs/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({set:{paused},expectedRevision:job.revision})});
      acceptJob(result);notice=paused?'计划已暂停；正在运行的任务需单独取消。':snapshot?.workerEnabled?'计划已恢复。':'计划已恢复，但工作器仍停用，不会自动运行。';
    }catch(error){
      if(error.current)acceptJob(error.current);
      notice=error.code==='JOB_CONFLICT'?'任务已在另一处更新，已显示最新状态。请检查后再次选择暂停或恢复。':`计划更新未确认：${error.message}。请刷新查看最新状态后再操作。`;
    }finally{busy.delete('update:'+id);render();if(sameView(target))await refreshVisible();}
  }
  async function cancel(id){
    if(!validId(id)||busy.has('cancel:'+id)||!isConnected()||!history?.runs.some(run=>run.id===id&&run.status==='running'))return;
    const target=view();invalidate();busy.add('cancel:'+id);notice='正在取消运行…';render();
    try{const result=await post(`/api/job-runs/${encodeURIComponent(id)}/cancel`,{});notice=`运行状态：${labels[result.status]||result.status}。`;}
    catch(error){notice=`取消尚未确认：${error.message}。请刷新状态后再决定。`;}
    finally{busy.delete('cancel:'+id);render();if(sameView(target))await refreshVisible();}
  }
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>originalSettings().replace('<div class="panel-footer">',markup()+'<div class="panel-footer">');
  const originalOpen=app.openPanel.bind(app);
  app.openPanel=(...args)=>{invalidate();const result=originalOpen(...args);if(args[0]==='settings')render();return result;};
  const originalAction=app.action.bind(app);
  app.action=(name,id='',...rest)=>{
    if(!name.startsWith('jobs-'))return originalAction(name,id,...rest);
    if(!section())return;
    if(name==='jobs-create')return create();
    if(name==='jobs-run')return run(id);
    if(name==='jobs-pause'||name==='jobs-resume')return setPaused(id,name==='jobs-pause');
    if(name==='jobs-cancel')return cancel(id);
    if(name==='jobs-refresh'){notice='';invalidate();return refreshVisible();}
    if(name==='jobs-history'){selectedId=id;historyOffset=0;history=null;historyRead=null;historyError='';render();return readHistory();}
    if(name==='jobs-next'&&nextOffset!==null){offset=nextOffset;invalidate();return readList();}
    if(name==='jobs-previous'){offset=Math.max(0,offset-pageSize);invalidate();return readList();}
    if(name==='jobs-history-next'&&history&&history.nextOffset!==null){historyOffset=history.nextOffset;historyRead=null;return readHistory();}
    if(name==='jobs-history-previous'){historyOffset=Math.max(0,historyOffset-historySize);historyRead=null;return readHistory();}
  };
  document.addEventListener('input',event=>{if(event.target.matches?.('[data-job-field]'))capture();});
  document.addEventListener('change',event=>{if(event.target.matches?.('[data-job-field]'))capture();});
  document.addEventListener('toggle',event=>{if(event.target.id==='qg-jobs-settings'&&event.target.open){notice='';invalidate();refreshVisible();}},true);
  // The optional adapter may finish loading while Settings is already open.
  if(app.modalKind==='settings'&&app.dialog.open&&!document.getElementById('qg-jobs-settings'))document.querySelector('#modal .panel-footer')?.insertAdjacentHTML('beforebegin',markup());
  render();
  return {refreshVisible};
};
