/* Owner-only, registered WebAssembly routines. Opening or refreshing never runs code. */
window.initQuietGlassScripts=({app,panels,esc,api,post,isConnected})=>{
  const definitions=Object.freeze({
    'integer-stats':{title:'整数统计',example:'{"values":[1,2,3]}',help:'仅接受 values：最多 1000 个整数，每个在 -1000000 到 1000000 之间。'},
    'bounded-echo':{title:'有限文本回显',example:'{"text":"你好"}',help:'仅接受 text：最多 1024 个 UTF-16 单元（部分表情计为 2 个）。文本只作为数据传入，不作为代码执行。'},
  });
  const labels={running:'运行中',completed:'已完成',failed:'失败',cancelled:'已取消',timed_out:'已超时',interrupted:'已中断'};
  const storageKey='quiet-glass-scripts-draft-v1:'+(window.__QG_HOST__?'host':'web');
  const pageSize=10,inputCharacters=12000,inputBytes=16000;
  const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const validVersion=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(value);
  const defaultDraft=()=>({scriptId:'integer-stats',parameters:definitions['integer-stats'].example});
  function validateParameters(scriptId,value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('参数必须是 JSON 对象。');
    if(scriptId==='integer-stats'){
      if(Object.keys(value).length!==1||!Object.hasOwn(value,'values')||!Array.isArray(value.values)||value.values.length>1000||!value.values.every(item=>Number.isInteger(item)&&Math.abs(item)<=1000000))throw new Error(definitions[scriptId].help);
    }else if(scriptId==='bounded-echo'){
      if(Object.keys(value).length!==1||!Object.hasOwn(value,'text')||typeof value.text!=='string'||value.text.length>1024)throw new Error(definitions[scriptId].help);
    }else throw new Error('请选择已注册的 WebAssembly 脚本。');
    if(new TextEncoder().encode(JSON.stringify(value)).length>inputBytes)throw new Error('参数超过 16000 字节上限。');
    return value;
  }
  const validDraft=value=>value&&Object.hasOwn(definitions,value.scriptId)&&typeof value.parameters==='string'&&value.parameters.length<=inputCharacters;
  const validPending=value=>{
    if(!value||Object.keys(value).sort().join(',')!=='idempotencyKey,parameters,scriptId,version'||!validId(value.idempotencyKey)||!validVersion(value.version))return false;
    try{validateParameters(value.scriptId,value.parameters);return true;}catch{return false;}
  };
  let draft=defaultDraft(),pending=null,notice='',storageFailed=false;
  const parameterDrafts=Object.fromEntries(Object.entries(definitions).map(([id,value])=>[id,value.example]));
  try{
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(validDraft(saved?.draft))draft=saved.draft;
    for(const id of Object.keys(definitions))if(typeof saved?.parameterDrafts?.[id]==='string'&&saved.parameterDrafts[id].length<=inputCharacters)parameterDrafts[id]=saved.parameterDrafts[id];
    if(validPending(saved?.pending)){pending=saved.pending;draft={scriptId:pending.scriptId,parameters:JSON.stringify(pending.parameters,null,2)};}
    if(typeof saved?.notice==='string')notice=saved.notice.slice(0,2000);
  }catch{/* Browser data is untrusted; it never causes automatic submission. */}
  parameterDrafts[draft.scriptId]=draft.parameters;
  let snapshot=null,runs=[],offset=0,total=0,nextOffset=null,selectedId=null,detail=null;
  let listError='',detailError='',registryError='',listRead=null,registryRead=null,detailRead=null,epoch=0;
  const busy=new Set();
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({draft,parameterDrafts,pending,notice:notice.slice(0,2000)}));storageFailed=false;return true;}catch{storageFailed=true;return false;}};
  const setNotice=value=>{notice=value;persist();};
  const section=()=>app.modalKind==='settings'&&app.dialog.open?document.getElementById('qg-scripts-settings'):null;
  const view=()=>({token:app.modalToken,node:section()});
  const sameView=target=>!!target.node&&target.node===section()&&target.token===app.modalToken;
  const expanded=()=>!!section()?.open;
  const button=(name,text,id='',disabled=false)=>`<button type="button" class="text-button" data-action="scripts-${name}"${id?` data-id="${esc(id)}"`:''}${disabled?' disabled':''}>${esc(text)}</button>`;
  const controls='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
  const inputStyle='box-sizing:border-box;max-width:100%;width:100%;min-width:0';
  const formatTime=value=>value?String(value).replace('T',' ').replace('.000Z',' UTC').replace(/Z$/,' UTC'):'—';
  const entryFor=id=>snapshot?.registry?.find(entry=>entry.id===id||entry.scriptId===id);
  const availability=()=>snapshot?.runtimeAvailability;
  const runtimeReady=()=>availability()?.available===true;
  const canRun=()=>isConnected()&&snapshot?.enabled===true&&runtimeReady()&&!!entryFor(pending?.scriptId||draft.scriptId)&&!busy.has('run');
  function markup(){
    return `<details id="qg-scripts-settings" style="margin:18px 0;min-width:0;overflow-wrap:anywhere"><summary style="cursor:pointer">WebAssembly 脚本（受限 v1）</summary><p class="settings-note">只运行运营者预先注册并固定版本与 SHA-256 的两个 WebAssembly 模块。这里不能上传、注册、编辑源代码或填写文件路径，也不能执行任意 JavaScript、Python 或 shell。</p><p class="settings-note">执行限 Linux + 固定版本 Wasmtime。访客模块没有文件、网络、环境变量或宿主函数导入；资源限制由可信运行器实施。可信 Python 运行器本身不具备操作系统文件／网络隔离。运行时不可用或限制无法建立时拒绝执行。</p><p id="qg-scripts-runtime" class="settings-note" role="status"></p><p id="qg-scripts-status" class="settings-note" role="status" aria-live="polite"></p><div style="${controls}">${button('refresh','刷新状态与历史')}</div><details style="margin:12px 0"><summary style="cursor:pointer">检查注册版本与哈希</summary><div id="qg-scripts-registry"></div></details><label class="field-label" for="qg-script-id">已注册 WebAssembly 脚本</label><select id="qg-script-id" data-script-field="scriptId" style="${inputStyle}">${Object.entries(definitions).map(([id,value])=>`<option value="${id}"${draft.scriptId===id?' selected':''}>${value.title} · ${id}</option>`).join('')}</select><p id="qg-script-selection" class="settings-note"></p><label class="field-label" for="qg-script-parameters">JSON 参数（仅数据）</label><textarea id="qg-script-parameters" data-script-field="parameters" rows="5" maxlength="${inputCharacters}" spellcheck="false" style="${inputStyle};resize:vertical" aria-describedby="qg-script-input-help">${esc(draft.parameters)}</textarea><p id="qg-script-input-help" class="settings-note"></p><p id="qg-script-attempt" class="settings-note"></p><button type="button" class="solid-button" data-action="scripts-run">运行一次</button><h3 style="font-size:15px;margin-top:20px">运行历史</h3><p class="settings-note">每页最多 10 条保留记录。结果只供查看；不会自动再次运行。参数草稿与待确认请求保留在本浏览器，请勿填写密码或密钥。</p><p id="qg-scripts-history-status" class="settings-note" role="status"></p><div id="qg-scripts-history" aria-busy="false"></div><div id="qg-scripts-pages" style="${controls}"></div><div id="qg-script-detail" style="margin-top:16px;min-width:0"></div></details>`;
  }
  function replace(node,html){if(node&&node.__qgScriptsMarkup!==html){node.innerHTML=html;node.__qgScriptsMarkup=html;}}
  function render(){
    const root=section();if(!root)return;
    const runtime=availability(),entry=entryFor(pending?.scriptId||draft.scriptId);
    root.querySelector('#qg-scripts-runtime').textContent=!isConnected()?'连接服务后可检查注册脚本。':!snapshot?(registryError||'展开后读取运行器状态。'):!snapshot.enabled?'脚本执行已停用：包括手动运行也被拒绝。此界面不能启用执行。':runtimeReady()?'运营者已启用受限执行，Linux / Wasmtime 运行器可用。仅点击运行一次才会执行。':`运行器不可用，已拒绝执行。${String(runtime?.message||runtime?.reason||runtime?.code||'请联系服务运营者检查固定运行时与资源限制。').slice(0,1000)}`;
    root.querySelector('#qg-scripts-status').textContent=notice+(storageFailed?' 浏览器无法保存请求凭据；新运行不会提交，请恢复本地存储后重试。':'');
    root.querySelector('[data-action="scripts-refresh"]').disabled=!isConnected()||!!listRead||!!registryRead;
    root.querySelectorAll('[data-script-field]').forEach(node=>node.disabled=!!pending||busy.has('run'));
    root.querySelector('#qg-script-selection').textContent=entry?`版本：${entry.version} · SHA-256：${entry.sha256||entry.hash||entry.registryHash||'未提供'}`:'尚未确认该脚本的注册版本。';
    root.querySelector('#qg-script-input-help').textContent=definitions[draft.scriptId].help;
    root.querySelector('#qg-script-attempt').textContent=pending?`上次请求结果尚未确认。重试使用同一参数、版本与请求键，表单暂时锁定。请求键：${pending.idempotencyKey}`:'修改参数不会执行；只有明确点击运行一次才会提交。';
    const runButton=root.querySelector('[data-action="scripts-run"]');runButton.disabled=!canRun();runButton.textContent=busy.has('run')?'正在确认运行…':pending?'重试上次运行请求':'运行一次';
    replace(root.querySelector('#qg-scripts-registry'),snapshot?.registry?.filter(entry=>Object.hasOwn(definitions,entry.id||entry.scriptId)).map(entry=>`<p class="settings-note"><strong>${esc(definitions[entry.id||entry.scriptId].title)}</strong><br>ID：${esc(entry.id||entry.scriptId)} · 版本：${esc(entry.version)}<br>SHA-256：${esc(entry.sha256||entry.hash||entry.registryHash||'未提供')}</p>`).join('')||'<p class="settings-note">尚未读取注册表。</p>');
    root.querySelector('#qg-scripts-history-status').textContent=listError||(listRead?'正在读取历史…':'');
    root.querySelector('#qg-scripts-history').setAttribute('aria-busy',String(!!listRead));
    replace(root.querySelector('#qg-scripts-history'),runs.length?runs.map(run=>`<article data-script-run-id="${esc(run.id)}" style="padding:10px 0;border-bottom:1px solid var(--line,rgba(120,120,120,.2));min-width:0"><strong>${esc(definitions[run.scriptId]?.title||run.scriptId)} · ${esc(labels[run.status]||run.status)}</strong><p class="settings-note">版本 ${esc(run.version)} · ${esc(formatTime(run.startedAt))}<br>运行 ID：${esc(run.id)}</p><div style="${controls}">${button('detail','查看运行详情',run.id,!isConnected())}${run.status==='running'?button('cancel','取消运行',run.id,!isConnected()||busy.has('cancel:'+run.id)):''}</div></article>`).join(''):snapshot?'<p class="settings-note">暂无保留的运行记录。</p>':'');
    replace(root.querySelector('#qg-scripts-pages'),snapshot?`<span class="settings-note">共 ${esc(total)} 条记录；当前 ${runs.length?offset+1:0}–${offset+runs.length}</span>${offset?button('previous','较新记录'):''}${nextOffset!==null?button('next','更早记录'):''}`:'');
    renderDetail(root);
  }
  function renderDetail(root){
    const target=root.querySelector('#qg-script-detail');if(!selectedId){replace(target,'');return;}
    if(!detail||detail.id!==selectedId){replace(target,`<p class="settings-note" role="status">${esc(detailError||'正在读取运行详情…')}</p>`);return;}
    const result=detail.result==null?'':JSON.stringify(detail.result,null,2),parameters=JSON.stringify(detail.parameters||{},null,2);
    replace(target,`<h3 style="font-size:15px">运行详情 · ${esc(labels[detail.status]||detail.status)}</h3><p class="settings-note">${esc(detail.scriptId)} · 版本 ${esc(detail.version)}<br>运行 ID：${esc(detail.id)}<br>注册快照 SHA-256：${esc(detail.registryHash||'未提供')}<br>开始：${esc(formatTime(detail.startedAt))}<br>结束：${esc(formatTime(detail.finishedAt))}</p>${detailError?`<p class="settings-note" role="status">${esc(detailError)}</p>`:''}${detail.error?`<p class="settings-note" data-script-error="" role="status">${esc(detail.error.code||'')}：${esc(String(detail.error.message||'').slice(0,1000))}</p>`:''}<details><summary style="cursor:pointer">本次参数</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;font-size:12px">${esc(parameters.slice(0,12000))}</pre></details>${result?`<div data-script-result="${esc(detail.id)}"><p class="settings-note">运行结果${result.length>6000?'（节选）':''}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:240px;overflow:auto;font-size:12px">${esc(result.slice(0,6000))}</pre></div>`:''}`);
  }
  function invalidate(){epoch++;listRead=null;registryRead=null;detailRead=null;}
  async function readRegistry(){
    if(!expanded()||!isConnected()||registryRead)return;
    const token={epoch,view:view()};registryRead=token;registryError='';render();
    try{const value=await api('/api/scripts');if(registryRead===token&&epoch===token.epoch&&sameView(token.view)){snapshot=value;}}
    catch(error){if(registryRead===token&&sameView(token.view)){snapshot=null;registryError=`注册表暂时无法读取：${error.message}。请手动刷新。`;}}
    finally{if(registryRead===token){registryRead=null;if(sameView(token.view))render();}}
  }
  async function readList(){
    if(!expanded()||!isConnected()||listRead)return;
    const token={epoch,view:view(),offset};listRead=token;listError='';render();
    try{const value=await api(`/api/script-runs?limit=${pageSize}&offset=${token.offset}`);if(listRead===token&&epoch===token.epoch&&offset===token.offset&&sameView(token.view)){runs=value.runs;total=value.total;nextOffset=value.nextOffset;}}
    catch(error){if(listRead===token&&sameView(token.view))listError=`历史暂时无法读取：${error.message}。已显示的结果与草稿仍保留。`;}
    finally{if(listRead===token){listRead=null;if(sameView(token.view))render();}}
  }
  async function readDetail(){
    if(!expanded()||!isConnected()||!selectedId||detailRead)return;
    const token={epoch,view:view(),id:selectedId};detailRead=token;detailError='';render();
    try{const value=await api('/api/script-runs/'+encodeURIComponent(token.id));if(detailRead===token&&epoch===token.epoch&&selectedId===token.id&&sameView(token.view))detail=value;}
    catch(error){if(detailRead===token&&sameView(token.view))detailError=`详情暂时无法读取：${error.message}。请手动刷新。`;}
    finally{if(detailRead===token){detailRead=null;if(sameView(token.view))render();}}
  }
  function refreshVisible(){if(!expanded()||!isConnected()||busy.size)return;return Promise.all([readRegistry(),readList(),readDetail()]);}
  function capture(){
    const root=section();if(!root||pending||busy.has('run'))return;
    draft={scriptId:root.querySelector('#qg-script-id').value,parameters:root.querySelector('#qg-script-parameters').value};parameterDrafts[draft.scriptId]=draft.parameters;persist();
  }
  function parsedDraft(){
    const entry=entryFor(draft.scriptId);if(!entry||!validVersion(entry.version))throw new Error('请先读取有效的注册版本。');
    if(draft.parameters.length>inputCharacters||new TextEncoder().encode(draft.parameters).length>inputBytes)throw new Error('参数文本过长。');
    let parameters;try{parameters=JSON.parse(draft.parameters);}catch{throw new Error('请输入有效 JSON 参数；未提交，草稿已保留。');}
    return {scriptId:draft.scriptId,version:entry.version,parameters:validateParameters(draft.scriptId,parameters),idempotencyKey:crypto.randomUUID()};
  }
  async function run(){
    if(!canRun())return;capture();const recovering=!!pending;
    try{if(!pending)pending=parsedDraft();}catch(error){setNotice(error.message);render();return;}
    // A durable request key must exist before dispatch; no unsafe storage fallback.
    if(!persist()){render();return;}
    const submitted=pending,target=view();invalidate();busy.add('run');setNotice('正在确认运行…');render();
    try{
      const result=await post('/api/script-runs',submitted);pending=null;persist();
      setNotice(`已确认运行：${labels[result.status]||result.status}。再次运行需要另行点击。`);
      if(sameView(target)){selectedId=result.id;detail=result;offset=0;}
    }catch(error){
      if(error.code==='SCRIPT_RUN_PRUNED'){pending=null;setNotice('原运行记录已按保留策略清理；此次重试没有再次执行。再次点击运行一次才会提交新请求。');}
      else if(['INVALID_INPUT','SCRIPT_DISABLED','SCRIPT_NOT_FOUND','SCRIPT_VERSION_MISMATCH','SCRIPT_INPUT_LIMIT','SCRIPT_RECEIPT_LIMIT','SCRIPT_STORAGE_LIMIT'].includes(error.code)){
        // Some rejections precede the server receipt lookup. After an ambiguous
        // prior submission they cannot prove that the original run never ran.
        if(!recovering){pending=null;setNotice(`运行未执行：${error.message}。参数草稿已保留。`);}
        else setNotice(`原请求目前无法重试：${error.message}。上次结果仍需确认，保留相同请求键与参数；请检查运行历史，恢复后再手动重试。`);
      }
      else if(error.code==='SCRIPT_IDEMPOTENCY_CONFLICT')setNotice('请求键与服务保存的请求不一致。已保留原参数与请求键；请联系服务运营者核对，不会自动生成新请求。');
      else if(['SCRIPT_CONCURRENCY_LIMIT','SCRIPT_HISTORY_LIMIT'].includes(error.code))setNotice(`本次运行尚未开始：${error.message}。条件恢复后可手动重试同一请求。`);
      else setNotice(`运行结果尚未确认：${error.message}。请手动重试上次请求；不会自动重发。`);
    }finally{busy.delete('run');if(sameView(target)){render();await refreshVisible();}}
  }
  async function cancel(id){
    if(!validId(id)||busy.has('cancel:'+id)||!isConnected()||!runs.some(run=>run.id===id&&run.status==='running'))return;
    const target=view();invalidate();busy.add('cancel:'+id);setNotice('正在取消运行…');render();
    try{const result=await post(`/api/script-runs/${encodeURIComponent(id)}/cancel`,{});setNotice(`运行状态：${labels[result.status]||result.status}。`);if(sameView(target)&&selectedId===id)detail=result;}
    catch(error){setNotice(`取消尚未确认：${error.message}。请刷新状态后再决定。`);}
    finally{busy.delete('cancel:'+id);if(sameView(target)){render();await refreshVisible();}}
  }
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>originalSettings().replace('<div class="panel-footer">',markup()+'<div class="panel-footer">');
  const originalOpen=app.openPanel.bind(app);
  app.openPanel=(...args)=>{invalidate();const result=originalOpen(...args);if(args[0]==='settings')render();return result;};
  const originalAction=app.action.bind(app);
  app.action=(name,id='',...rest)=>{
    if(!name.startsWith('scripts-'))return originalAction(name,id,...rest);if(!section())return;
    if(name==='scripts-run')return run();
    if(name==='scripts-cancel')return cancel(id);
    if(name==='scripts-refresh'){invalidate();return refreshVisible();}
    if(name==='scripts-detail'&&validId(id)){selectedId=id;detail=null;detailRead=null;detailError='';render();return readDetail();}
    if(name==='scripts-next'&&nextOffset!==null){offset=nextOffset;listRead=null;return readList();}
    if(name==='scripts-previous'){offset=Math.max(0,offset-pageSize);listRead=null;return readList();}
  };
  document.addEventListener('input',event=>{if(event.target.id==='qg-script-parameters')capture();});
  document.addEventListener('change',event=>{
    if(!event.target.matches?.('[data-script-field]')||pending||busy.has('run'))return;
    if(event.target.id==='qg-script-id'&&Object.hasOwn(definitions,event.target.value))section().querySelector('#qg-script-parameters').value=parameterDrafts[event.target.value];
    capture();render();
  });
  document.addEventListener('toggle',event=>{if(event.target.id==='qg-scripts-settings'&&event.target.open){invalidate();refreshVisible();}},true);
  if(app.modalKind==='settings'&&app.dialog.open&&!document.getElementById('qg-scripts-settings'))document.querySelector('#modal .panel-footer')?.insertAdjacentHTML('beforebegin',markup());
  render();return {refreshVisible};
};
