import { readFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { content,reconcileContents } from './v1-state.mjs';

const contract=JSON.parse(readFileSync(new URL('../docs/examples/v1/mcp-tools.json',import.meta.url)));
const ajv=new Ajv({strict:false,allErrors:false});addFormats(ajv);
const definitions=contract.tools.map(t=>({...t,description:t.description.replace('Draft ','').replace('Not registered.','Local scoped capability; external delivery is not enabled.')+(t.name==='sill_createContent'?' Creation supports article, mail, note, reminder, insight, digest, suggestion only; specialized types return not_supported.':['sill_listContents','sill_getContent'].includes(t.name)?' Returns V1 common fields only; specialized task/event/media fields are preserved in storage but not exposed.':''),validate:ajv.compile(t.inputSchema),validateOutput:ajv.compile(t.outputSchema)}));
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
export const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export const errorBody=e=>({error:{code:e.code|| (e.status===409?'revision_conflict':'invalid_request'),message:e.code||e.status===409?e.message:'请求未通过校验',request_id:randomUUID()}});
export class V1Capabilities{
  constructor(repository,{destinations={}}={}){this.repository=repository;this.destinations=destinations;this.cursors=new Map();}
  visible(actor,id){return actor.cards==='*'||actor.cards?.includes(id);}
  authorize(actor,tool,id){
    if(!actor)fail(401,'unauthenticated','需要本地 MCP 身份');
    if(actor.owner!=='local'||!actor.scopes?.includes(tool['x-required-scope'])||actor.tools&&!actor.tools.includes(tool.name))fail(403,'forbidden','此身份没有该能力');
    if(id&&!this.visible(actor,id))fail(404,'not_found','内容不存在');
  }
  listTools(actor){return definitions.filter(t=>{try{this.authorize(actor,t);return true;}catch{return false;}}).map(({validate,validateOutput,...t})=>({name:t.name,description:t.description,inputSchema:t.inputSchema,outputSchema:t.outputSchema,annotations:{readOnlyHint:['listContents','getContent','getEvent'].includes(t['x-operationId']),idempotentHint:true,openWorldHint:false}}));}
  value(){
    const r=this.repository;
    const state=r.value?.state||{cards:[],items:{},seconds:0,preferences:{}};
    return {...structuredClone(r.value||{revision:0,state}),v1:structuredClone(r.value?.v1||reconcileContents(r.value,state))};
  }
  call(actor,name,args={}){
    const t=definitions.find(t=>t.name===name);if(!t)fail(404,'not_found','工具不存在');
    this.authorize(actor,t);
    if(!t.validate(args))fail(400,'invalid_request','工具参数不符合契约');
    for(const value of [args.id,args.body?.event_id,args.body?.card_id,args.body?.destination_ref,args.body?.metadata?.event_id])if(['__proto__','constructor','prototype'].includes(value))fail(400,'invalid_request','无效的资源 ID');
    const op=t['x-operationId'],v=this.value(),body=args.body;
    if(args.id&&op!=='getEvent')this.authorize(actor,t,args.id);
    if(body?.metadata&&!actor.scopes.includes('event:result'))fail(403,'forbidden','需要 event:result');
    const get=id=>{if(!this.visible(actor,id))fail(404,'not_found','内容不存在');const c=content(v,id);if(!c||c.deleted)fail(404,'not_found','内容不存在');return c;};
    if(op==='listContents')return this.list(actor,args,v);
    if(op==='getContent')return get(args.id);
    if(op==='getEvent'){
      const e=v.v1.events[args.id];if(!e||!this.visible(actor,e.record.card_id)||![e.submitter,e.assignee].includes(actor.id))fail(404,'not_found','事件不存在');return e.record;
    }
    // Reauthorization precedes replay. Keys bind identity and the complete canonical operation.
    const key=createHash('sha256').update(actor.id+'\0'+args.idempotency_key).digest('hex'),digest=createHash('sha256').update(canonical({name,args})).digest('hex');
    const receipt=v.v1.receipts[key];
    if(receipt){if(receipt.digest!==digest)fail(409,'idempotency_conflict','同一幂等键不能用于不同请求');if(receipt.cardId&&!this.visible(actor,receipt.cardId))fail(404,'not_found','内容不存在');return receipt.result;}
    if(Object.keys(v.v1.receipts).length>=10000)fail(503,'unavailable','幂等记录容量已满，需维护后重试');
    let operations=[],result,cardId=args.id,event;
    if(op==='createContent'){
      if(actor.cards!=='*')fail(403,'forbidden','此身份不能创建新的资源');
      // Dedicated types require their legacy fields; do not manufacture tasks/dates/files.
      if(['task','event','media','photo','file'].includes(body.type))fail(400,'not_supported','此类型创建需要尚未开放的专属字段；现有卡片仍可读取和更新');
      cardId=randomUUID();operations=this.changes(v,cardId,body,true);
    }else if(op==='submitEvent'){
      const c=get(body.card_id),dest=this.destinations[body.destination_ref];cardId=c.id;
      if(!dest||dest.mode!=='manual'||!dest.submitters?.includes(actor.id)||!dest.actions?.includes(body.action))fail(501,'not_supported','该目标未启用本地人工交付；Webhook 尚未实现');
      const old=v.v1.events[body.event_id];
      if(old){if(old.submitter!==actor.id||canonical(old.input)!==canonical(body))fail(409,'revision_conflict','事件 ID 已用于其他请求');result=old.record;}
      else{
        if(c.revision!==body.card_version)fail(409,'revision_conflict','事件的内容版本已变化');
        const now=new Date().toISOString();result={...body,delivery:'queued',outcome:'pending',created_at:now,updated_at:now,result_revision:null,summary:''};
        v.v1.events[body.event_id]={record:result,input:body,submitter:actor.id,assignee:dest.assignee};
      }
    }else{
      const c=get(args.id);
      if(c.revision!==body.expectedRevision)fail(409,'revision_conflict','内容已变化，请保留草稿并重新读取合并');
      if(body.metadata){
        event=v.v1.events[body.metadata.event_id];
        if(!event||event.assignee!==actor.id||event.record.card_id!==args.id)fail(404,'not_found','关联事件不存在');
        if(event.record.outcome!=='pending'){
          if(!body.changes&&event.record.outcome===body.metadata.outcome&&event.record.summary===body.metadata.summary){result=c;event=null;}
          else fail(409,'revision_conflict','事件已有结果，不能再次产生副作用');
        }
        if(event&&event.record.card_version!==c.revision)fail(409,'revision_conflict','事件起点已变化，请人工核对原意图');
        if(body.metadata.outcome!=='succeeded'&&body.changes)fail(400,'invalid_request','失败或未知结果不能同时修改内容');
      }
      operations=op==='deleteContent'?[{op:'card.delete',id:args.id}]:this.changes(v,args.id,body.changes||{});
    }
    const state=operations.length?this.repository.prepare({operations,expectedRevision:v.revision}):v.state;
    const next=this.repository.preview(state,v.v1);
    if(event){Object.assign(next.v1.events[body.metadata.event_id].record,{outcome:body.metadata.outcome,summary:body.metadata.summary,delivery:'accepted',result_revision:next.v1.contents[cardId].revision,updated_at:new Date().toISOString()});}
    result??=content(next,cardId);
    if(!t.validateOutput(result))fail(500,'unavailable','服务端结果不符合契约');
    next.v1.receipts[key]={digest,result,cardId};this.repository.commitValue(next);return result;
  }
  changes(v,id,changes,create=false){
    const {state,...fields}=changes,ops=[];
    if(create||Object.keys(fields).length)ops.push({op:'card.upsert',card:{...(create?{id,kind:'local',source:'本地'}:v.state.cards.find(c=>c.id===id)),...fields}});
    if(state&&Object.keys(state).length){
      const c=create?changes:{...v.state.cards.find(c=>c.id===id),...fields},values={};
      if(state.read!==undefined){values.read=state.read;values.readAt=state.read?Date.now():0;}
      if(state.archived!==undefined)values.archived=state.archived;
      if(state.done!==undefined){if(c.type==='task')values.taskDone=state.done?c.tasks.map(t=>t.id):[];else if(c.type==='reminder')values.reminderDone=state.done;else values.done=state.done;}
      ops.push({op:'item.patch',id,values});
    }
    return ops;
  }
  list(actor,args,v){
    const binding=canonical(actor),now=Date.now();
    for(const [k,x]of this.cursors)if(x.expires<now)this.cursors.delete(k);
    const remember=x=>{if(this.cursors.size>=512)fail(503,'unavailable','同步游标容量已满，请稍后重试');const token=randomUUID();this.cursors.set(token,{...x,binding,expires:now+600000});return token;};
    const lookup=(token,kind)=>{const x=this.cursors.get(token);if(!x||x.binding!==binding||x.kind!==kind)fail(410,'cursor_expired','游标已过期，请重新全量同步');return x;};
    if(args.cursor&&args.since)fail(400,'invalid_request','cursor 与 since 不能并用');
    let items,watermark;
    if(args.cursor)({items,watermark}=lookup(args.cursor,'page'));
    else{const since=args.since?lookup(args.since,'sync').watermark:0;watermark=v.revision;items=Object.keys(v.v1.contents).filter(id=>this.visible(actor,id)&&(!args.since||v.v1.contents[id].sequence>since)).sort().map(id=>content(v,id));}
    const limit=args.limit||50,remaining=items.slice(limit);
    return {items:items.slice(0,limit),next_cursor:remaining.length?remember({kind:'page',items:remaining,watermark}):null,sync_cursor:remaining.length?null:remember({kind:'sync',watermark})};
  }
}
