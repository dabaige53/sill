import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AccessConfigSchema, PRINCIPAL_TOOLS } from './config.mjs';
import { QGError, LOCAL_NOTE_SOURCE } from './schemas.mjs';

const context = new AsyncLocalStorage();
const hash = value => createHash('sha256').update(value).digest();
const equal = (a,b) => !!a&&!!b&&timingSafeEqual(a,b);
const tokenHash = value => typeof value==='string'&&Buffer.byteLength(value)>=32&&Buffer.byteLength(value)<=4096 ? hash(value) : null;
const denied = () => new QGError('ACCESS_DENIED','此身份无权执行该操作或访问该资源');
const unauthenticated = () => new QGError('AUTH_REQUIRED','有效的 Bearer 凭据是必需的');
const TOOL_METHODS = Object.freeze({
  qg_search:'search',qg_get_card:'getCard',qg_recommend:'recommend',
  qg_create_note:'createNote',qg_update_note:'updateNote',qg_read_annotation:'readAnnotation',
  qg_update_annotation:'updateAnnotation',qg_feedback:'feedback',qg_ingest:'ingest',
});
export const PRINCIPAL_METHODS = Object.freeze(Object.fromEntries(Object.entries(TOOL_METHODS).map(([tool,method])=>[method,tool])));
export const accessContext = () => context.getStore();
// Keep old owner keys byte-for-byte compatible; external keys use a separate
// record kind so even deliberately chosen owner key strings cannot collide.
export function idempotencyAddress(kind,key) {
  const actor=context.getStore()?.actor;
  return actor?.kind==='principal'?[`${kind}:principal`,hash(JSON.stringify([actor.id,key])).toString('hex')]:[kind,key];
}
export function auditAttribution() {
  const actor=context.getStore()?.actor;
  return actor?{actorId:actor.id,actorKind:actor.kind,transport:actor.transport}:null;
}

export class AccessController {
  #service; #config; #env; #now; #actors=new WeakMap(); #buckets=new Map(); #ownerHash=null;
  constructor(service,config={},options={}) {
    this.#service=service;this.#config=config;this.#env=options.env||process.env;this.#now=options.now||Date.now;
    AccessConfigSchema.parse(config);
  }
  #policies() {
    const parsed=AccessConfigSchema.safeParse(this.#config);
    if(!parsed.success)throw new QGError('AUTH_CONFIG','访问配置无效；外部访问已关闭');
    return parsed.data.principals;
  }
  #issue(kind,id,transport,credentialHash=null) {
    if(!['http','mcp-http','stdio','http-session','test'].includes(transport))throw unauthenticated();
    const actor=Object.freeze({kind,id,transport});this.#actors.set(actor,{credentialHash});return actor;
  }
  #credentials() {return this.#policies().map(policy=>({policy,hash:tokenHash(this.#env[policy.tokenEnv])}));}
  authenticate(token,{ownerToken,transport='http'}={}) {
    if(ownerToken!==undefined)this.#ownerHash=tokenHash(ownerToken);
    const candidate=tokenHash(token);if(!candidate)throw unauthenticated();
    const credentials=this.#credentials(),matches=credentials.filter(entry=>equal(candidate,entry.hash));
    const owner=equal(candidate,this.#ownerHash);
    // Aliased credentials are ambiguous even if one principal is disabled.
    // In particular an external credential can never resolve as an owner.
    if(matches.length>1||(owner&&matches.length))throw unauthenticated();
    if(owner)return this.#issue('owner','owner',transport,candidate);
    if(matches.length!==1||!matches[0].policy.enabled)throw unauthenticated();
    return this.#issue('principal',matches[0].policy.id,transport,candidate);
  }
  owner({transport='stdio'}={}) {return this.#issue('owner','owner',transport);}
  #resolve(actor) {
    if(!actor||!this.#actors.has(actor))throw unauthenticated();
    const stored=this.#actors.get(actor);
    if(actor.kind==='owner'){
      if(stored.credentialHash&&(!equal(stored.credentialHash,this.#ownerHash)||this.#credentials().some(entry=>equal(stored.credentialHash,entry.hash))))throw unauthenticated();
      return null;
    }
    const entries=this.#credentials(),entry=entries.find(value=>value.policy.id===actor.id);
    if(!entry?.policy.enabled||!equal(entry.hash,stored.credentialHash)||equal(entry.hash,this.#ownerHash)||entries.filter(value=>equal(value.hash,entry.hash)).length!==1)throw unauthenticated();
    return entry.policy;
  }
  requestLimit(actor) {return this.#resolve(actor)?.limits.maxRequestBytes||524288;}
  assertRequestSize(actor,size) {if(!Number.isSafeInteger(size)||size<0||size>this.requestLimit(actor))throw new QGError('BODY_TOO_LARGE','请求超过此身份的大小限制');}
  limits(actor) {const policy=this.#resolve(actor);return policy?{...policy.limits}:null;}
  allowedTools(actor) {
    const policy=this.#resolve(actor);
    return policy?policy.tools.filter(tool=>tool!=='qg_update_annotation'||policy.tools.includes('qg_read_annotation')):null;
  }
  assertTool(actor,tool) {
    const policy=this.#resolve(actor);
    if(policy&&(!PRINCIPAL_TOOLS.includes(tool)||!policy.tools.includes(tool)||(tool==='qg_update_annotation'&&!policy.tools.includes('qg_read_annotation')))){
      this.#service.store.audit('access_denied',{actorId:actor.id,actorKind:actor.kind,transport:actor.transport,...(PRINCIPAL_TOOLS.includes(tool)?{tool}:{})});
      throw denied();
    }
  }
  run(actor,fn,{requestBytes=0}={}) {
    const policy=this.#resolve(actor),active=context.getStore();
    if(policy&&(!Number.isSafeInteger(requestBytes)||requestBytes<0||requestBytes>policy.limits.maxRequestBytes))throw new QGError('BODY_TOO_LARGE','请求超过此身份的大小限制');
    if(active?.controller===this&&active.actor===actor)return fn();
    if(policy){
      const now=this.#now(),key=actor.id;
      const bucket=this.#buckets.get(key)||{since:now,count:0,active:0};
      if(now-bucket.since>=60000){bucket.since=now;bucket.count=0;}
      if(bucket.active>=policy.limits.maxConcurrent)throw new QGError('RATE_LIMITED','此身份同时运行的请求过多');
      if(bucket.count>=policy.limits.requestsPerMinute)throw new QGError('RATE_LIMITED','此身份的请求速率已达上限');
      bucket.count++;bucket.active++;this.#buckets.set(key,bucket);
      const release=()=>{bucket.active--;};
      try{
        const result=context.run({actor,controller:this},fn);
        if(result&&typeof result.then==='function')return Promise.resolve(result).finally(release);
        release();return result;
      }catch(error){release();throw error;}
    }
    return context.run({actor,controller:this},fn);
  }
  facade(actor) {
    this.#resolve(actor);
    if(actor.kind==='owner')return this.#service;
    // No store, connectors, helpers, constructor or prototype to forward to.
    const facade=Object.create(null);
    for(const [method,tool] of Object.entries(PRINCIPAL_METHODS))facade[method]=(...args)=>{
      this.assertTool(actor,tool);
      const requestBytes=Buffer.byteLength(JSON.stringify(args));
      return this.run(actor,()=>{
        try{
          const result=this.#service[method](...args);
          this.#service.store.audit('access_operation',{tool,outcome:'completed'});return result;
        }catch(error){this.#service.store.audit('access_operation',{tool,outcome:'rejected'});throw error;}
      },{requestBytes});
    };
    return Object.freeze(facade);
  }
  policy() {
    const active=context.getStore();
    return active?.controller===this?this.#resolve(active.actor):null;
  }
  assertOperation(tool) {
    const active=context.getStore();if(active?.controller===this)this.assertTool(active.actor,tool);
  }
  #inBounds(card,policy) {
    return !!card&&policy.resources.sourceIds.includes(card.sourceId)&&(!policy.resources.cardIds||policy.resources.cardIds.includes(card.id));
  }
  // Owner-only dry-run disclosure. Normal authentication still validates tokens;
  // visibility computation uses only configured scopes, never credential values.
  backupVisibility(beforeCards,afterCards,changedIds=[]) {
    if(this.policy())throw denied();
    if(!Array.isArray(beforeCards)||!Array.isArray(afterCards)||beforeCards.length>1100||afterCards.length>1100)throw new QGError('BACKUP_TARGET_LIMIT','目标卡片图超过备份预览上限');
    const policies=this.#policies().map(policy=>({id:policy.id,enabled:policy.enabled,tokenEnv:policy.tokenEnv,limits:{...policy.limits},tools:[...policy.tools].sort(),resources:{sourceIds:[...policy.resources.sourceIds].sort(),...(policy.resources.cardIds?{cardIds:[...policy.resources.cardIds].sort()}:{}),ingestSourceIds:[...policy.resources.ingestSourceIds].sort()}})).sort((a,b)=>a.id.localeCompare(b.id));
    const policyDigest=hash(JSON.stringify(policies)).toString('hex'),changed=new Set(changedIds),afterMap=new Map(afterCards.map(card=>[card.id,card]));
    // Same transitive source/card bounds as canReadCard, evaluated in O(V+E)
    // per policy. Cycles wholly in bounds remain readable; an invalid dependency
    // propagates to every parent, including through cycles.
    const readable=(cards,policy)=>{
      const map=new Map(cards.map(card=>[card.id,card])),reverse=new Map(),invalid=new Set(),queue=[];
      for(const card of cards){
        if(!this.#inBounds(card,policy)){invalid.add(card.id);queue.push(card.id);}
        for(const id of card.evidenceIds||[]){
          if(!reverse.has(id))reverse.set(id,[]);reverse.get(id).push(card.id);
          if(!map.has(id)&&!invalid.has(card.id)){invalid.add(card.id);queue.push(card.id);}
        }
      }
      for(let n=0;n<queue.length;n++)for(const parent of reverse.get(queue[n])||[])if(!invalid.has(parent)){invalid.add(parent);queue.push(parent);}
      return new Set(cards.filter(card=>!invalid.has(card.id)).map(card=>card.id));
    };
    const principals=[];
    for(const policy of policies.filter(policy=>policy.enabled)){
      const before=readable(beforeCards,policy),after=readable(afterCards,policy);
      const newly=[...after].filter(id=>!before.has(id)).sort(),affected=[...after].filter(id=>changed.has(id)).sort();
      const exposed=[...new Set([...newly,...affected])];if(!exposed.length)continue;
      principals.push({id:policy.id,sourceIds:[...new Set(exposed.map(id=>afterMap.get(id).sourceId))].sort(),newlyVisibleCount:newly.length,affectedVisibleCount:affected.length,newlyVisibleCardIds:newly.slice(0,20),affectedVisibleCardIds:affected.slice(0,20),idsTruncated:newly.length>20||affected.length>20,annotationsVisible:policy.tools.includes('qg_read_annotation')});
    }
    return {policyDigest,principals,requiresAcknowledgement:principals.length>0,notice:'现有已配置身份的来源/卡片权限会立即适用于恢复后的内容；这不是凭据可用性验证。撤销不能收回其他身份已经读取的信息。'};
  }
  canReadCard(card,policy=this.policy()) {
    if(!policy)return true;
    const pending=[card],seen=new Set();
    while(pending.length){
      const current=pending.pop();
      if(!this.#inBounds(current,policy))return false;
      if(seen.has(current.id))continue;seen.add(current.id);
      for(const id of current.evidenceIds||[]){
        if(!seen.has(id))pending.push(this.#service.store.get('card',id));
      }
    }
    return true;
  }
  assertCard(card) {if(!this.canReadCard(card))throw denied();return card;}
  visibleCards(cards) {const policy=this.policy();return policy?cards.filter(card=>this.canReadCard(card,policy)):cards;}
  includeAnnotations() {const policy=this.policy();return !policy||policy.tools.includes('qg_read_annotation');}
  assertNoteCreation() {
    const policy=this.policy();
    if(policy&&(!policy.resources.sourceIds.includes(LOCAL_NOTE_SOURCE)||policy.resources.cardIds))throw denied();
  }
  assertIngest(input) {
    const policy=this.policy();if(!policy)return;
    if(input.mode||!policy.resources.ingestSourceIds.includes(input.sourceId)||!policy.resources.sourceIds.includes(input.sourceId))throw denied();
    for(const item of input.items){
      const id=`card_${hash(JSON.stringify([input.sourceId,item.externalId])).toString('hex').slice(0,32)}`;
      const candidate={...item,id,sourceId:input.sourceId};
      if(!this.canReadCard(candidate,policy))throw denied();
      const existing=this.#service.store.get('card',id);
      if(existing&&!this.canReadCard(existing,policy))throw denied();
    }
  }
}
