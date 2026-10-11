import { randomUUID, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { Store, digest, uid } from './store.mjs';
import { Connectors, at } from './connectors.mjs';
import { AiEngine } from './ai.mjs';
import { JobsEngine } from './jobs.mjs';
import { ScriptsEngine } from './scripts.mjs';
import { BackupsEngine } from './backups.mjs';
import { AccessController } from './access.mjs';
import { Collect, Search, Recommend, Draft, Ingest, Workflow, SettingsUpdate, DEFAULT_RECOMMENDATION, NoteCreate, NoteUpdate, AnnotationRead, AnnotationUpdate, ConversationCreate, ConversationList, ConversationRead, RequestCreate, RequestHttpCreate, RequestRead, RequestList, RequestAnswer, LOCAL_NOTE_SOURCE, LOCAL_NOTE_PREFIX, operations, QGError, publicError } from './schemas.mjs';

const excerpt = card => ({...card,content:card.content.slice(0,1200),contentTruncated:card.content.length>1200});
const terms = query => query.toLocaleLowerCase().split(/[\s,，;；]+/).filter(Boolean);
const brief = card => ({id:card.id,title:card.title,kind:card.kind,sourceId:card.sourceId,url:card.url,truncated:card.truncated,...(card.provenance?{revision:card.revision,provenance:card.provenance}:{})});
const nowIso = () => new Date().toISOString();
const changedFields = (set,current) => Object.keys(set).filter(key=>JSON.stringify(set[key])!==JSON.stringify(current[key])).sort();
const assertUpstreamSource = sourceId => {if(sourceId===LOCAL_NOTE_SOURCE||['host-notion','host-google-calendar','host-linear'].includes(sourceId))throw new QGError('RESERVED_SOURCE','本地笔记与宿主导入来源只能使用各自明确的创建方式');};

export class Service {
  constructor(config,options={}) { this.store=new Store(config.dataDir);this.connectors=new Connectors(config,options);this.owner=randomUUID();this.running=new Map();this.ai=new AiEngine(this,config.ai,options);this.access=new AccessController(this,config.access,options);this.jobs=new JobsEngine(this,config.jobs,options);this.scripts=new ScriptsEngine(this,config.scripts,options);this.backups=new BackupsEngine(this,options);
    // Defense in depth: adapters use the restricted facade, and the real
    // service also rejects accidental broad dispatch in a principal context.
    const guarded={listScripts:'qg_list_scripts',runScript:'qg_run_script',getScriptRun:'qg_get_script_run',listScriptRuns:'qg_list_script_runs',cancelScriptRun:'qg_cancel_script_run',listJobs:'qg_list_jobs',createJob:'qg_create_job',updateJob:'qg_update_job',runJob:'qg_run_job',getJob:'qg_get_job',cancelJobRun:'qg_cancel_job_run',status:'qg_status',aiStatus:'qg_ai_status',startAi:'qg_start_ai',getAi:'qg_get_ai',cancelAi:'qg_cancel_ai',
      exportBackup:'qg_export_content_backup',previewRestore:'qg_preview_content_restore',commitRestore:'qg_commit_content_restore',getRestore:'qg_get_content_restore',undoRestore:'qg_undo_content_restore',
      readSettings:'qg_read_settings',updateSettings:'qg_update_settings',createNote:'qg_create_note',updateNote:'qg_update_note',
      readAnnotation:'qg_read_annotation',updateAnnotation:'qg_update_annotation',collect:'qg_collect',ingest:'qg_ingest',
      search:'qg_search',getCard:'qg_get_card',recommend:'qg_recommend',feedback:'qg_feedback',
      prepareAction:'qg_prepare_action',getAction:'qg_get_action',commitAction:'qg_commit_action',
      createWorkflow:'qg_create_workflow',startWorkflow:'qg_run_workflow',getWorkflow:'qg_get_workflow',
      createConversation:'qg_create_conversation',listConversations:'qg_list_conversations',readConversation:'qg_read_conversation',
      createRequest:'qg_create_request',getRequest:'qg_get_request',listRequests:'qg_list_requests',answerRequest:'qg_answer_request'};
    for(const [method,tool] of Object.entries(guarded)){
      const original=this[method].bind(this);
      this[method]=(...args)=>{this.access.assertOperation(tool);return original(...args);};
    }
  }
  exportBackup(args={}) {return this.backups.export(args);}
  previewRestore(args) {return this.backups.preview(args);}
  commitRestore(args) {return this.backups.commit(args);}
  getRestore(args) {return this.backups.get(args);}
  undoRestore(args) {return this.backups.undo(args);}
  listScripts(args={}) {return this.scripts.list(args);}
  runScript(args) {return this.scripts.run(args);}
  getScriptRun(args) {return this.scripts.get(args);}
  listScriptRuns(args={}) {return this.scripts.listRuns(args);}
  cancelScriptRun(args) {return this.scripts.cancel(args);}
  listJobs(args={}) {return this.jobs.list(args);}
  createJob(args) {return this.jobs.create(args);}
  updateJob(args) {return this.jobs.update(args);}
  runJob(args) {return this.jobs.run(args);}
  getJob(args) {return this.jobs.get(args);}
  cancelJobRun(args) {return this.jobs.cancel(args);}
  status() {return {version:'0.2.0',mode:'single-user',connectors:this.connectors.status(),cards:this.store.list('card').length,workflows:this.store.list('workflow').map(w=>({id:w.id,goal:w.goal,status:w.status})),externalWrites:'prepare-and-confirm',ranking:'explainable-rules',ai:this.aiStatus()};}
  aiStatus() {return this.ai.status();}
  startAi(args) {return this.ai.start(args);}
  getAi(args) {return this.ai.get(args);}
  cancelAi(args) {return this.ai.cancel(args);}
  readSettings() {
    return this.store.get('settings','workspace')||{values:{sort:'priority',reduceTransparency:false},revision:0};
  }
  updateSettings(args) {
    const input=SettingsUpdate.parse(args);
    return this.store.transaction(()=>{
      const current=this.readSettings();
      if(input.expectedRevision!==current.revision)throw new QGError('SETTINGS_CONFLICT','设置已在另一处更新；请查看最新设置后再决定。',{current});
      const changedKeys=Object.keys(input.set).filter(key=>!isDeepStrictEqual(input.set[key],key==='recommendation'?(current.values.recommendation||DEFAULT_RECOMMENDATION):current.values[key])).sort();
      if(!changedKeys.length)return current;
      if(current.revision===Number.MAX_SAFE_INTEGER)throw new QGError('REVISION_LIMIT','设置修订号已达到上限');
      const next={values:{...current.values,...Object.fromEntries(changedKeys.map(key=>[key,input.set[key]]))},revision:current.revision+1};
      this.store.put('settings','workspace',next);
      this.store.audit('settings_updated',{changedKeys,fromRevision:current.revision,toRevision:next.revision});
      return next;
    });
  }
  createNote(args) {
    const {idempotencyKey,...values}=NoteCreate.parse(args),fingerprint=digest(values);
    this.access.assertNoteCreation();
    return this.store.transaction(()=>{
      const existing=this.store.get('note-key',idempotencyKey);
      if(existing){
        if(existing.digest!==fingerprint)throw new QGError('IDEMPOTENCY_CONFLICT','相同幂等键不能对应不同笔记内容');
        return this.withAnnotation(this.storedCard(existing.id));
      }
      const id=uid('local_note'),now=nowIso();
      const card={...values,id,externalId:id,sourceId:LOCAL_NOTE_SOURCE,kind:'note',local:true,revision:1,
        summary:values.content.slice(0,300),contentHash:fingerprint,truncated:false,evidenceIds:[],
        publishedAt:now,collectedAt:now,firstCollectedAt:now,createdAt:now,updatedAt:now,
        state:{read:false,bookmarked:false,dismissed:false,snoozedUntil:null}};
      this.store.put('card',id,card);
      this.store.put('note-key',idempotencyKey,{id,digest:fingerprint});
      this.store.audit('note_created',{id,revision:1});
      return this.withAnnotation(card);
    });
  }
  updateNote(args) {
    const input=NoteUpdate.parse(args);
    return this.store.transaction(()=>{
      const card=this.storedCard(input.cardId);
      if(!card.local||card.sourceId!==LOCAL_NOTE_SOURCE||!card.id.startsWith(LOCAL_NOTE_PREFIX)||card.kind!=='note')throw new QGError('NOTE_NOT_LOCAL','仅可编辑本地笔记；来源内容请使用个人备注');
      if(input.expectedRevision!==card.revision)throw new QGError('NOTE_CONFLICT','笔记已在另一处更新；请查看最新内容后再决定。',{current:this.withAnnotation(card)});
      const changedKeys=changedFields(input.set,card);
      if(!changedKeys.length)return this.withAnnotation(card);
      if(card.revision===Number.MAX_SAFE_INTEGER)throw new QGError('REVISION_LIMIT','笔记修订号已达到上限');
      const values={title:card.title,content:card.content,tags:card.tags,...input.set},now=nowIso();
      const next={...card,...values,summary:values.content.slice(0,300),contentHash:digest(values),revision:card.revision+1,updatedAt:now,publishedAt:now};
      this.store.put('card',card.id,next);
      this.store.audit('note_updated',{id:card.id,changedKeys,fromRevision:card.revision,toRevision:next.revision});
      return this.withAnnotation(next);
    });
  }
  annotationSnapshot(cardId) {return this.store.get('annotation',cardId)||{cardId,values:{note:'',tags:[]},revision:0};}
  readAnnotation(args) {
    const {cardId}=AnnotationRead.parse(args);this.storedCard(cardId);return this.annotationSnapshot(cardId);
  }
  updateAnnotation(args) {
    const input=AnnotationUpdate.parse(args);
    return this.store.transaction(()=>{
      this.storedCard(input.cardId);
      const current=this.annotationSnapshot(input.cardId);
      if(input.expectedRevision!==current.revision)throw new QGError('ANNOTATION_CONFLICT','个人备注已在另一处更新；请查看最新内容后再决定。',{current});
      const changedKeys=changedFields(input.set,current.values);
      if(!changedKeys.length)return current;
      if(current.revision===Number.MAX_SAFE_INTEGER)throw new QGError('REVISION_LIMIT','个人备注修订号已达到上限');
      const next={cardId:input.cardId,values:{...current.values,...input.set},revision:current.revision+1};
      this.store.put('annotation',input.cardId,next);
      this.store.audit('annotation_updated',{cardId:input.cardId,changedKeys,fromRevision:current.revision,toRevision:next.revision});
      return next;
    });
  }
  // Reference snapshots contain only source content/provenance, never connector
  // configuration, arbitrary source-record properties, or personal annotations.
  cardReference(cardId,capturedAt,snapshotOrigin='request-creation') {
    const card=this.store.get('card',cardId);
    if(!card&&snapshotOrigin!=='legacy-migration')throw new QGError('CARD_NOT_FOUND','卡片不存在');
    const snapshot={cardId,capturedAt,snapshotOrigin,available:!!card};
    if(card){
      Object.assign(snapshot,{sourceId:card.sourceId,externalId:card.externalId,kind:card.kind,
        title:String(card.title||'').slice(0,500),summary:String(card.summary||'').slice(0,500),content:String(card.content||'').slice(0,1200),
        contentHash:card.contentHash,contentTruncated:(card.content?.length||0)>1200,summaryTruncated:(card.summary?.length||0)>500,truncated:!!card.truncated});
      if(card.url){try{const url=new URL(card.url);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.href.length<=2048)snapshot.url=url.href;}catch{}}
      if(Number.isSafeInteger(card.revision))snapshot.revision=card.revision;
      if(card.provenance?.mode==='host-assisted'){
        // Keep attribution labels with every frozen excerpt. Select each field
        // explicitly: arbitrary record properties and annotations never leak.
        const p=card.provenance;
        snapshot.provenance={mode:'host-assisted',attribution:'host-asserted',provider:p.provider,
          upstreamId:p.upstreamId,scope:{accountId:p.scope.accountId,...(p.scope.workspaceId?{workspaceId:p.scope.workspaceId}:{}),...(p.scope.calendarId?{calendarId:p.scope.calendarId}:{})},
          retrievedAt:p.retrievedAt,...(p.upstreamUpdatedAt?{upstreamUpdatedAt:p.upstreamUpdatedAt}:{}),partial:p.partial,
          contentOrigin:p.contentOrigin,...(p.summaryOrigin?{summaryOrigin:p.summaryOrigin}:{})};
      }
    }
    return {...snapshot,snapshotHash:digest(snapshot)};
  }
  conversationRecord(id) {
    const conversation=this.store.get('conversation',id);
    if(!conversation)throw new QGError('CONVERSATION_NOT_FOUND','对话不存在');
    return conversation;
  }
  conversationMessages(id) {return this.store.list('message').filter(message=>message.conversationId===id).sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id));}
  createConversationRecord(title,createdAt=nowIso(),id=uid('conversation')) {
    const conversation={id,title,createdAt,updatedAt:createdAt,messageCount:0,requestCount:0,pendingCount:0};
    this.store.put('conversation',id,conversation);
    this.store.audit('conversation_created',{id});
    return conversation;
  }
  // Earlier versions kept isolated request records. Preserve their IDs, payloads,
  // statuses and dates while assigning one deterministic application conversation.
  // A migrated reference is explicitly captured now, not claimed as historical.
  migrateLegacyRequests() {
    if(!this.store.list('request').some(request=>!request.conversationId))return;
    this.store.transaction(()=>{
      for(const original of this.store.list('request').filter(request=>!request.conversationId)){
        const id=`conversation_legacy_${digest(original.id).slice(0,32)}`,capturedAt=nowIso();
        const createdAt=original.createdAt||capturedAt,answered=original.status==='answered';
        const cardRefs=(original.cardIds||[]).map(cardId=>this.cardReference(cardId,capturedAt,'legacy-migration'));
        const userMessageId=`message_legacy_${digest([original.id,'user']).slice(0,32)}`;
        const answerMessageId=answered?`message_legacy_${digest([original.id,'assistant']).slice(0,32)}`:undefined;
        const conversation={id,title:original.question.slice(0,200)||'历史对话',createdAt,updatedAt:original.answeredAt||createdAt,messageCount:answered?2:1,requestCount:1,pendingCount:answered?0:1};
        const user={id:userMessageId,conversationId:id,requestId:original.id,sequence:1,role:'user',text:original.question,createdAt,status:original.status,cardRefs};
        this.store.put('conversation',id,conversation);this.store.put('message',userMessageId,user);
        if(answered)this.store.put('message',answerMessageId,{id:answerMessageId,conversationId:id,requestId:original.id,sequence:2,role:'assistant',text:original.answer,createdAt:original.answeredAt||createdAt,evidenceIds:original.evidenceIds||[]});
        const request={...original,conversationId:id,userMessageId,userMessageSequence:1,cardRefs,...(answered?{answerMessageId,answerDigest:digest({answer:original.answer,evidenceIds:original.evidenceIds||[]})}:{}),legacy:true};
        request.context=this.requestContext(id,1);
        this.store.put('request',original.id,request);
        this.store.audit('request_migrated',{requestId:original.id,conversationId:id,status:original.status,cardCount:cardRefs.length});
      }
    });
  }
  createConversation(args) {
    const {title,idempotencyKey}=ConversationCreate.parse(args),fingerprint=digest({title});
    return this.store.transaction(()=>{
      const prior=this.store.get('conversation-key',idempotencyKey);
      if(prior){if(prior.digest!==fingerprint)throw new QGError('IDEMPOTENCY_CONFLICT','相同幂等键不能对应不同对话内容');return this.conversationRecord(prior.id);}
      const conversation=this.createConversationRecord(title);
      this.store.put('conversation-key',idempotencyKey,{id:conversation.id,digest:fingerprint});
      return conversation;
    });
  }
  listConversations(args={}) {
    const {limit,offset}=ConversationList.parse(args);this.migrateLegacyRequests();
    const conversations=this.store.list('conversation').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id));
    return {conversations:conversations.slice(offset,offset+limit),total:conversations.length,nextOffset:offset+limit<conversations.length?offset+limit:null};
  }
  readConversation(args) {
    const {conversationId,limit,offset}=ConversationRead.parse(args);this.migrateLegacyRequests();
    return this.store.transaction(()=>{
      const conversation=this.conversationRecord(conversationId),messages=this.conversationMessages(conversationId);
      return {conversation,messages:messages.slice(offset,offset+limit),total:messages.length,nextOffset:offset+limit<messages.length?offset+limit:null};
    });
  }
  requestContext(conversationId,throughSequence) {
    const eligible=this.conversationMessages(conversationId).filter(message=>message.sequence<=throughSequence);
    const offset=Math.max(0,eligible.length-12);
    const messages=eligible.slice(offset).map(message=>({...message,text:message.text.slice(0,2000),textTruncated:message.text.length>2000,
      ...(message.cardRefs?{cardRefs:message.cardRefs.map(({cardId,sourceId,externalId,title,contentHash,snapshotHash,available})=>({cardId,sourceId,externalId,title,contentHash,snapshotHash,available}))}:{})}));
    return {conversationId,messages,total:eligible.length,offset,hasEarlier:offset>0,throughSequence,limit:12};
  }
  createRequest(args,{allowLegacy=false}={}) {
    const input=(allowLegacy?RequestHttpCreate:RequestCreate).parse(args);
    // Bind to the exact submitted question, ordered card IDs and destination.
    // Legacy generated destination IDs are not part of the caller's payload.
    const fingerprint=digest({conversationId:input.conversationId||null,question:input.question,cardIds:input.cardIds});
    this.migrateLegacyRequests();
    return this.store.transaction(()=>{
      const idempotencyKey=input.idempotencyKey||uid('request_key'),prior=this.store.get('request-key',idempotencyKey);
      if(prior){if(prior.digest!==fingerprint)throw new QGError('IDEMPOTENCY_CONFLICT','相同幂等键不能对应不同问题、卡片引用或对话');return this.store.get('request',prior.id);}
      const createdAt=nowIso(),cardRefs=input.cardIds.map(id=>this.cardReference(id,createdAt));
      const conversation=input.conversationId?this.conversationRecord(input.conversationId):this.createConversationRecord(input.question.slice(0,200),createdAt);
      if(conversation.messageCount>=Number.MAX_SAFE_INTEGER)throw new QGError('SEQUENCE_LIMIT','对话消息序号已达到上限');
      const id=uid('request'),userMessageId=uid('message'),sequence=conversation.messageCount+1;
      const message={id:userMessageId,conversationId:conversation.id,requestId:id,sequence,role:'user',text:input.question,createdAt,status:'pending',cardRefs};
      this.store.put('message',userMessageId,message);
      const request={id,conversationId:conversation.id,question:input.question,cardIds:input.cardIds,cardRefs,status:'pending',createdAt,userMessageId,userMessageSequence:sequence,context:this.requestContext(conversation.id,sequence)};
      this.store.put('request',id,request);this.store.put('request-key',idempotencyKey,{id,digest:fingerprint});
      this.store.put('conversation',conversation.id,{...conversation,updatedAt:createdAt,messageCount:sequence,requestCount:conversation.requestCount+1,pendingCount:conversation.pendingCount+1});
      this.store.audit('request_created',{requestId:id,conversationId:conversation.id,messageId:userMessageId,sequence,cardCount:cardRefs.length});
      return request;
    });
  }
  getRequest(args) {
    const {requestId}=RequestRead.parse(args);this.migrateLegacyRequests();
    const request=this.store.get('request',requestId);if(!request)throw new QGError('REQUEST_NOT_FOUND','请求不存在');return request;
  }
  listRequests(args={}) {
    const {conversationId,status,limit,offset}=RequestList.parse(args);this.migrateLegacyRequests();
    if(conversationId)this.conversationRecord(conversationId);
    const requests=this.store.list('request').filter(request=>(!conversationId||request.conversationId===conversationId)&&(status==='all'||request.status===status)).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    return {requests:requests.slice(offset,offset+limit),total:requests.length,nextOffset:offset+limit<requests.length?offset+limit:null};
  }
  answerRequest(args) {
    const {requestId,answer,evidenceIds}=RequestAnswer.parse(args),fingerprint=digest({answer,evidenceIds});this.migrateLegacyRequests();
    return this.store.transaction(()=>this.answerRequestRecord({requestId,answer,evidenceIds},fingerprint));
  }
  // Caller holds BEGIN IMMEDIATE. AI completion uses this same primitive so the
  // ordered answer and terminal run state are committed together, or neither is.
  answerRequestRecord(args,fingerprint) {
      const {requestId,answer,evidenceIds}=RequestAnswer.parse(args);
      fingerprint??=digest({answer,evidenceIds});
      const request=this.store.get('request',requestId);if(!request)throw new QGError('REQUEST_NOT_FOUND','请求不存在');
      if(request.status==='answered'){
        if(request.answerDigest!==fingerprint)throw new QGError('ANSWER_CONFLICT','此问题已有回答；不能用不同内容或证据覆盖。',{requestId,conversationId:request.conversationId});
        return request;
      }
      evidenceIds.forEach(id=>this.storedCard(id));
      const conversation=this.conversationRecord(request.conversationId);
      if(conversation.messageCount>=Number.MAX_SAFE_INTEGER)throw new QGError('SEQUENCE_LIMIT','对话消息序号已达到上限');
      const answeredAt=nowIso(),answerMessageId=uid('message'),sequence=conversation.messageCount+1;
      const updated={...request,status:'answered',answer,evidenceIds,answeredAt,answerMessageId,answerDigest:fingerprint};
      this.store.put('message',answerMessageId,{id:answerMessageId,conversationId:conversation.id,requestId,sequence,role:'assistant',text:answer,createdAt:answeredAt,evidenceIds});
      const user=this.store.get('message',request.userMessageId);
      this.store.put('message',user.id,{...user,status:'answered'});
      this.store.put('request',requestId,updated);
      this.store.put('conversation',conversation.id,{...conversation,updatedAt:answeredAt,messageCount:sequence,pendingCount:conversation.pendingCount-1});
      this.store.audit('request_answered',{requestId,conversationId:conversation.id,messageId:answerMessageId,sequence,evidenceCount:evidenceIds.length});
      return updated;
  }
  async collect(args) {
    const input=Collect.parse(args);
    assertUpstreamSource(input.connectorId);
    const result=await this.connectors.collect(input);
    const cards=this.store.ingest(input.connectorId,result.items);
    this.store.audit('collect',{sourceId:input.connectorId,count:cards.length,partial:result.partial});
    return {items:cards.map(brief),cardIds:cards.map(c=>c.id),count:cards.length,nextCursor:result.nextCursor,partial:result.partial};
  }
  ingest(args) {
    const input=Ingest.parse(args);this.access.assertIngest(input);
    if(input.mode==='host-assisted'){
      const imported=this.store.ingestHost(input.sourceId,input.items),cards=imported.map(entry=>entry.card);
      return {items:imported.map(({card,replayed})=>({...brief(card),replayed})),cardIds:cards.map(card=>card.id),count:cards.length,replayed:imported.filter(entry=>entry.replayed).length};
    }
    assertUpstreamSource(input.sourceId);
    const known=new Set(this.store.list('card').map(c=>c.id));
    for(const item of input.items)for(const id of item.evidenceIds)if(!known.has(id))throw new QGError('EVIDENCE_NOT_FOUND','引用的证据卡片不存在');
    const cards=this.store.ingest(input.sourceId,input.items);
    this.store.audit('ingest',{sourceId:input.sourceId,count:cards.length});
    return {items:cards.map(brief),cardIds:cards.map(c=>c.id),count:cards.length};
  }
  search(args) {
    const input=Search.parse(args),words=terms(input.query);
    const cards=this.access.visibleCards(this.store.list('card')).filter(c=>(!input.sourceIds||input.sourceIds.includes(c.sourceId))&&(!input.kind||input.kind===c.kind)&&words.every(w=>[c.title,c.summary,c.content,...c.tags].join(' ').toLocaleLowerCase().includes(w))).sort((a,b)=>(b.publishedAt||b.firstCollectedAt).localeCompare(a.publishedAt||a.firstCollectedAt));
    return {items:cards.slice(input.offset,input.offset+input.limit).map(c=>excerpt(this.withAnnotation(c))),total:cards.length,nextOffset:input.offset+input.limit<cards.length?input.offset+input.limit:null};
  }
  storedCard(id) {const card=this.store.get('card',id);this.access.assertCard(card);if(!card)throw new QGError('CARD_NOT_FOUND','卡片不存在');return card;}
  withAnnotation(card) {return {...card,...(this.access.includeAnnotations()?{annotation:this.annotationSnapshot(card.id)}:{})};}
  getCard(id) {return this.withAnnotation(this.storedCard(id));}
  recommend(args) {
    const provided=Recommend.parse(args);
    // A restricted principal never loads the owner's private recommendation
    // settings, including through guarded readSettings. Explicit per-call
    // preferences still apply, only after the existing card scope checks.
    const defaults=this.access.policy()?DEFAULT_RECOMMENDATION:(this.store.get('settings','workspace')?.values.recommendation||DEFAULT_RECOMMENDATION);
    const input={...defaults,...Object.fromEntries(Object.entries(provided).filter(([,value])=>value!==undefined))};
    const now=Date.now(),words=[...new Set(terms([input.query,...input.interests].join(' ')))],excluded=new Set(input.excludedSourceIds);
    const ranked=this.access.visibleCards(this.store.list('card')).filter(c=>!excluded.has(c.sourceId)&&!c.state.dismissed&&(!c.state.snoozedUntil||Date.parse(c.state.snoozedUntil)<=now)&&(input.includeRead||!c.state.read)).map(c=>{
      let score=0;const reasons=[];
      const haystack=[c.title,c.summary,c.content,...c.tags].join(' ').toLocaleLowerCase();
      const matched=words.filter(w=>haystack.includes(w));
      if(matched.length){score+=Math.min(50,matched.length*15);reasons.push(`匹配关注词：${matched.join('、')}`);}
      const hasSourcePriority=Object.hasOwn(input.sourcePriorities,c.sourceId),sourcePriority=hasSourcePriority?input.sourcePriorities[c.sourceId]:0;
      if(hasSourcePriority){score+=sourcePriority;reasons.push(`来源偏好：${c.sourceId}（${sourcePriority>=0?'+':''}${sourcePriority}）`);}
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
      if(!reasons.length)reasons.push('符合当前筛选条件；没有额外加分');
      return {card:excerpt(this.withAnnotation(c)),score:Math.round(score*100)/100,reasons,evidence:{cardId:c.id,sourceId:c.sourceId,url:c.url,...(hasSourcePriority?{sourcePriority}:{})}};
    }).sort((a,b)=>b.score-a.score||a.card.id.localeCompare(b.card.id));
    const selected=[],deferred=[],counts=new Map();
    for(const item of ranked){const count=counts.get(item.card.sourceId)||0;if(count>=2&&item.score<100)deferred.push(item);else{selected.push(item);counts.set(item.card.sourceId,count+1);}}
    const scoreRanks=new Map(ranked.map((item,index)=>[item.card.id,index+1]));
    const ordered=[...selected,...deferred].map((item,index)=>{
      const before=scoreRanks.get(item.card.id),after=index+1;
      if(before!==after){
        item.reasons.push(before<after?'来源多样性：同一来源已有至少两条优先候选，本条后置':'来源多样性：其他来源的后续卡片后置，本条提前');
        item.evidence.sourceDiversity={scoreRank:before,displayRank:after};
      }
      return item;
    });
    return {items:ordered.slice(0,input.limit),method:'关键词、显式来源偏好、未读、收藏、时效、日程紧迫性与来源多样性；不是语义模型推断',generatedAt:nowIso()};
  }
  feedback(id,patch) {
    const parsed=z.object({read:z.boolean().optional(),bookmarked:z.boolean().optional(),dismissed:z.boolean().optional(),snoozedUntil:z.string().datetime({offset:true}).nullable().optional()}).strict().parse(patch);
    return this.store.transaction(()=>{const card=this.storedCard(id);card.state={...card.state,...parsed};this.store.put('card',id,card);if(this.access.policy())this.store.audit('feedback_updated',{cardId:id,changedKeys:Object.keys(parsed).sort()});return brief(card);});
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
  async close() {await this.scripts.close();await this.jobs.close();await this.ai.close();await Promise.allSettled(this.running.values());await this.connectors.close();this.store.close();}
}
