import { randomUUID, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Store, digest, uid } from './store.mjs';
import { Connectors, at } from './connectors.mjs';
import { Collect, Search, Recommend, Draft, Ingest, Workflow, operations, QGError, publicError } from './schemas.mjs';

const excerpt = card => ({...card,content:card.content.slice(0,1200),contentTruncated:card.content.length>1200});
const terms = query => query.toLocaleLowerCase().split(/[\s,，;；]+/).filter(Boolean);
const brief = card => ({id:card.id,title:card.title,kind:card.kind,sourceId:card.sourceId,url:card.url,truncated:card.truncated});
const nowIso = () => new Date().toISOString();

export class Service {
  constructor(config,options={}) { this.store=new Store(config.dataDir);this.connectors=new Connectors(config,options);this.owner=randomUUID();this.running=new Map(); }
  status() {return {version:'0.2.0',mode:'single-user',connectors:this.connectors.status(),cards:this.store.list('card').length,workflows:this.store.list('workflow').map(w=>({id:w.id,goal:w.goal,status:w.status})),externalWrites:'prepare-and-confirm',ranking:'explainable-rules',ai:'Codex conversation orchestrates; no embedded model or borrowed connector credentials'};}
  async collect(args) {
    const input=Collect.parse(args);
    const result=await this.connectors.collect(input);
    const cards=this.store.ingest(input.connectorId,result.items);
    this.store.audit('collect',{sourceId:input.connectorId,count:cards.length,partial:result.partial});
    return {items:cards.map(brief),cardIds:cards.map(c=>c.id),count:cards.length,nextCursor:result.nextCursor,partial:result.partial};
  }
  ingest(args) {
    const input=Ingest.parse(args);
    const known=new Set(this.store.list('card').map(c=>c.id));
    for(const item of input.items)for(const id of item.evidenceIds)if(!known.has(id))throw new QGError('EVIDENCE_NOT_FOUND','引用的证据卡片不存在');
    const cards=this.store.ingest(input.sourceId,input.items);
    this.store.audit('ingest',{sourceId:input.sourceId,count:cards.length});
    return {items:cards.map(brief),cardIds:cards.map(c=>c.id),count:cards.length};
  }
  search(args) {
    const input=Search.parse(args),words=terms(input.query);
    const cards=this.store.list('card').filter(c=>(!input.sourceIds||input.sourceIds.includes(c.sourceId))&&(!input.kind||input.kind===c.kind)&&words.every(w=>[c.title,c.summary,c.content,...c.tags].join(' ').toLocaleLowerCase().includes(w))).sort((a,b)=>(b.publishedAt||b.firstCollectedAt).localeCompare(a.publishedAt||a.firstCollectedAt));
    return {items:cards.slice(input.offset,input.offset+input.limit).map(excerpt),total:cards.length,nextOffset:input.offset+input.limit<cards.length?input.offset+input.limit:null};
  }
  getCard(id) {const card=this.store.get('card',id);if(!card)throw new QGError('CARD_NOT_FOUND','卡片不存在');return card;}
  recommend(args) {
    const input=Recommend.parse(args),now=Date.now(),words=terms([input.query,...input.interests].join(' '));
    const ranked=this.store.list('card').filter(c=>!c.state.dismissed&&(!c.state.snoozedUntil||Date.parse(c.state.snoozedUntil)<=now)&&(input.includeRead||!c.state.read)).map(c=>{
      let score=0;const reasons=[];
      const haystack=[c.title,c.summary,c.content,...c.tags].join(' ').toLocaleLowerCase();
      const matched=words.filter(w=>haystack.includes(w));
      if(matched.length){score+=Math.min(50,matched.length*15);reasons.push(`匹配关注词：${matched.join('、')}`);}
      if(!c.state.read){score+=10;reasons.push('尚未读完');}
      if(c.state.bookmarked){score+=12;reasons.push('已收藏');}
      const hours=(now-Date.parse(c.publishedAt||c.firstCollectedAt))/3600000;
      if(hours>=0&&hours<72){score+=20*Math.exp(-hours/24);reasons.push(c.publishedAt?'来源近期更新':'最近采集，来源更新时间未知');}
      if(c.kind==='event'&&c.start){
        const minutes=(Date.parse(c.start)-now)/60000;
        if(minutes>=0&&minutes<=1440){score+=minutes<=60?100:35;reasons.push(minutes<=60?'一小时内开始':'未来 24 小时内开始');}
        else if(c.end&&Date.parse(c.start)<=now&&Date.parse(c.end)>now){score+=110;reasons.push('日程正在进行');}
        else if(c.end&&Date.parse(c.end)<=now){score-=50;reasons.push('日程已结束');}
      }
      return {card:excerpt(c),score:Math.round(score*100)/100,reasons,evidence:{cardId:c.id,sourceId:c.sourceId,url:c.url}};
    }).sort((a,b)=>b.score-a.score||a.card.id.localeCompare(b.card.id));
    const selected=[],deferred=[],counts=new Map();
    for(const item of ranked){const count=counts.get(item.card.sourceId)||0;if(count>=2&&item.score<100)deferred.push(item);else{selected.push(item);counts.set(item.card.sourceId,count+1);}}
    return {items:[...selected,...deferred].slice(0,input.limit),method:'关键词、未读、收藏、时效、日程紧迫性与来源多样性；不是语义模型推断',generatedAt:nowIso()};
  }
  feedback(id,patch) {
    const parsed=z.object({read:z.boolean().optional(),bookmarked:z.boolean().optional(),dismissed:z.boolean().optional(),snoozedUntil:z.string().datetime({offset:true}).nullable().optional()}).strict().parse(patch);
    return this.store.transaction(()=>{const card=this.getCard(id);card.state={...card.state,...parsed};this.store.put('card',id,card);return brief(card);});
  }
  prepareAction(args) {
    const input=Draft.parse(args),payload=this.connectors.validateWrite(input.connectorId,input.action,input.payload);
    const fingerprint=digest([input.connectorId,input.action,payload]);
    return this.store.transaction(()=>{
      const existing=this.store.get('action-key',input.idempotencyKey);
      if(existing){const action=this.store.get('action',existing.id);if(action.digest!==fingerprint)throw new QGError('IDEMPOTENCY_CONFLICT','相同幂等键不能对应不同操作');return action;}
      const id=uid('action');
      const action={id,connectorId:input.connectorId,action:input.action,payload,digest:fingerprint,approvalToken:randomBytes(24).toString('hex'),status:'awaiting_approval',createdAt:nowIso(),expiresAt:new Date(Date.now()+30*60000).toISOString()};
      this.store.put('action-key',input.idempotencyKey,{id});this.store.put('action',id,action);this.store.audit('action_prepared',{id,connectorId:input.connectorId,action:input.action});return action;
    });
  }
  async commitAction({actionId,expectedDigest,approvalToken,approved}) {
    const action=this.store.transaction(()=>{
      const a=this.store.get('action',actionId);
      if(!a)throw new QGError('ACTION_NOT_FOUND','操作草稿不存在');
      if(!approved||a.digest!==expectedDigest||a.approvalToken!==approvalToken)throw new QGError('APPROVAL_REQUIRED','需要用户批准当前草稿，且摘要与确认令牌必须匹配');
      if(a.status==='completed')return a;
      if(a.status!=='awaiting_approval')throw new QGError('ACTION_NOT_RETRYABLE','操作已尝试或结果未知；请核对外部服务，不能重复提交');
      if(Date.parse(a.expiresAt)<Date.now())throw new QGError('APPROVAL_EXPIRED','草稿已过期；请用新的幂等键准备并确认');
      this.connectors.validateWrite(a.connectorId,a.action,a.payload);
      a.status='executing';a.startedAt=nowIso();this.store.put('action',a.id,a);return a;
    });
    if(action.status==='completed')return {actionId:action.id,status:action.status,result:action.result};
    try {
      const result=await this.connectors.write(action.connectorId,action.action,action.payload,action.id);
      this.store.put('action',action.id,{...action,status:'completed',result,finishedAt:nowIso()});
      this.store.audit('action_completed',{id:action.id});return {actionId:action.id,status:'completed',result};
    } catch(error) {
      const failure=publicError(error);
      // Once dispatched, never retry automatically: many providers lack idempotency guarantees.
      this.store.put('action',action.id,{...action,status:'needs_review',error:failure,finishedAt:nowIso()});
      this.store.audit('action_needs_review',{id:action.id,code:failure.code});throw error;
    }
  }
  createWorkflow(args) {
    const input=Workflow.parse(args),ids=new Set(input.steps.map(s=>s.id));
    if(ids.size!==input.steps.length)throw new QGError('INVALID_WORKFLOW','步骤 ID 重复');
    const done=new Set(),remaining=[...input.steps];
    for(const step of remaining)if(step.dependsOn.some(d=>!ids.has(d)||d===step.id))throw new QGError('INVALID_WORKFLOW','步骤依赖不存在或自引用');
    while(remaining.length){const index=remaining.findIndex(s=>s.dependsOn.every(d=>done.has(d)));if(index<0)throw new QGError('INVALID_WORKFLOW','步骤依赖存在循环');done.add(remaining.splice(index,1)[0].id);}
    const workflow={...input,id:uid('workflow'),status:'pending',createdAt:nowIso(),steps:input.steps.map(s=>({...s,status:'pending'}))};
    this.store.put('workflow',workflow.id,workflow);this.store.audit('workflow_created',{id:workflow.id,steps:workflow.steps.length});return workflow;
  }
  getWorkflow(id) {const w=this.store.get('workflow',id);if(!w)throw new QGError('WORKFLOW_NOT_FOUND','任务不存在');return w;}
  resolveInput(value,step,workflow,depth=0) {
    if(depth>20)throw new QGError('INVALID_REFERENCE','输入嵌套过深');
    if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.$ref==='string'){
      const [id,...path]=value.$ref.split('.');
      if(!step.dependsOn.includes(id))throw new QGError('INVALID_REFERENCE','引用步骤必须声明在 dependsOn 中');
      const upstream=workflow.steps.find(s=>s.id===id&&s.status==='completed');
      const resolved=at(upstream?.output,path.join('.'));
      if(resolved===undefined)throw new QGError('INVALID_REFERENCE','步骤结果路径不存在');return resolved;
    }
    if(Array.isArray(value))return value.map(v=>this.resolveInput(v,step,workflow,depth+1));
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,this.resolveInput(v,step,workflow,depth+1)]));
    return value;
  }
  startWorkflow(id) {
    const workflow=this.store.transaction(()=>{
      const w=this.getWorkflow(id);
      if(w.status==='completed')return w;
      if(w.status==='running'&&w.leaseUntil>Date.now())return w;
      w.status='running';w.owner=this.owner;w.leaseUntil=Date.now()+60000;
      for(const step of w.steps)if(step.status!=='completed'){step.status='pending';delete step.error;}
      this.store.put('workflow',id,w);return w;
    });
    if(workflow.status==='running'&&workflow.owner===this.owner&&!this.running.has(id)){
      const promise=this.executeWorkflow(id).finally(()=>this.running.delete(id));this.running.set(id,promise);
    }
    return workflow;
  }
  async executeWorkflow(id) {
    const heartbeat=setInterval(()=>{try{this.store.transaction(()=>{const w=this.getWorkflow(id);if(w.owner===this.owner&&w.status==='running'){w.leaseUntil=Date.now()+60000;this.store.put('workflow',id,w);}});}catch{}},10000);
    heartbeat.unref();
    try {
      let workflow=this.getWorkflow(id);
      while(workflow.steps.some(s=>s.status!=='completed')) {
        const step=workflow.steps.find(s=>s.status==='pending'&&s.dependsOn.every(d=>workflow.steps.find(s=>s.id===d)?.status==='completed'));
        if(!step)throw new QGError('INVALID_WORKFLOW','没有可执行步骤');
        step.status='running';step.startedAt=nowIso();this.store.put('workflow',id,workflow);
        try{
          const input=operations[step.operation].parse(this.resolveInput(step.input,step,workflow));
          step.output=await (step.operation==='draft'?this.prepareAction(input):this[step.operation](input));
          step.status='completed';step.finishedAt=nowIso();
        }catch(error){step.status='failed';step.error=publicError(error);workflow.status='failed';workflow.leaseUntil=0;this.store.put('workflow',id,workflow);this.store.audit('workflow_failed',{id,step:step.id,code:step.error.code});return;}
        workflow.leaseUntil=Date.now()+60000;this.store.put('workflow',id,workflow);
      }
      workflow.status='completed';workflow.finishedAt=nowIso();workflow.leaseUntil=0;this.store.put('workflow',id,workflow);this.store.audit('workflow_completed',{id});
    } catch(error) {const w=this.getWorkflow(id);w.status='failed';w.error=publicError(error);w.leaseUntil=0;this.store.put('workflow',id,w);}
    finally{clearInterval(heartbeat);}
  }
  getAction(id) {const action=this.store.get('action',id);if(!action)throw new QGError('ACTION_NOT_FOUND','操作草稿不存在');return action;}
  async close() {await Promise.allSettled(this.running.values());await this.connectors.close();this.store.close();}
}
