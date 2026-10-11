import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { digest } from '../server/store.mjs';
import { publicError } from '../server/schemas.mjs';

const invalid=fn=>assert.throws(fn,error=>publicError(error).code==='INVALID_INPUT');
const conflict=(fn,code='IDEMPOTENCY_CONFLICT')=>assert.throws(fn,error=>error.code===code);
const note={title:'Private card title',content:'Private source body',idempotencyKey:'note-fixture'};
async function fixture(t) {
  const directory=await mkdtemp(join(tmpdir(),'qg-conversations-'));
  const config=ConfigSchema.parse({dataDir:directory,connectors:[]}),services=[];
  const open=()=>{const service=new Service(config);services.push(service);return service;};
  const service=open();
  t.after(async()=>{for(const service of services.reverse())await service.close();await rm(directory,{recursive:true,force:true});});
  return {service,open,directory};
}
const createConversation=(s,key='conversation-one')=>s.createConversation({title:'Project conversation',idempotencyKey:key});
const question=(conversationId,key='request-one',extra={})=>({conversationId,idempotencyKey:key,question:'What should I consider?',cardIds:[],...extra});

// IDs here belong exclusively to the application; neither creation nor reading
// touches a host thread, invokes an AI, or calls any configured connector.
test('conversation creation is strict, payload-bound, persistent and local-only',async t=>{
  const {service:s,open}=await fixture(t);let external=0;
  s.connectors.collect=async()=>{external++;throw Error('unexpected external call');};
  for(const input of [{},{title:'ok'},{idempotencyKey:''},{idempotencyKey:'x'.repeat(201)},{title:'',idempotencyKey:'x'},{title:' ',idempotencyKey:'x'},{title:'x'.repeat(201),idempotencyKey:'x'},{title:'ok',idempotencyKey:'x',threadId:'host-thread'}])invalid(()=>s.createConversation(input));
  assert.equal(s.store.list('conversation').length,0);assert.equal(s.store.history().length,0);
  const conversation=createConversation(s),other=open();
  assert.match(conversation.id,/^conversation_[a-f0-9-]+$/);
  assert.equal(conversation.title,'Project conversation');assert.equal(conversation.messageCount,0);assert.equal(conversation.pendingCount,0);
  assert.deepEqual(createConversation(other),conversation);
  conflict(()=>s.createConversation({title:'Different',idempotencyKey:'conversation-one'}));
  const defaultTitle=s.createConversation({idempotencyKey:'default'});assert.equal(defaultTitle.title,'新对话');
  assert.equal(s.store.list('conversation').length,2);assert.equal(external,0);
  assert.equal(s.store.history().filter(event=>event.event==='conversation_created').length,2);
});

test('ordered durable messages tolerate multiple pending questions and out-of-order answers',async t=>{
  const {service:s,open}=await fixture(t),c=createConversation(s),other=open();
  const first=s.createRequest(question(c.id,'first',{question:'First turn'}));
  const second=other.createRequest(question(c.id,'second',{question:'Second turn'}));
  const answeredSecond=s.answerRequest({requestId:second.id,answer:'Answer second',evidenceIds:[]});
  const answeredFirst=other.answerRequest({requestId:first.id,answer:'Answer first',evidenceIds:[]});
  const read=other.readConversation({conversationId:c.id});
  assert.deepEqual(read.messages.map(message=>message.sequence),[1,2,3,4]);
  assert.deepEqual(read.messages.map(message=>[message.role,message.text,message.requestId]),[['user','First turn',first.id],['user','Second turn',second.id],['assistant','Answer second',second.id],['assistant','Answer first',first.id]]);
  assert.deepEqual(read.messages.slice(0,2).map(message=>message.status),['answered','answered']);
  assert.equal(read.conversation.messageCount,4);assert.equal(read.conversation.requestCount,2);assert.equal(read.conversation.pendingCount,0);
  assert.equal(read.nextOffset,null);assert.equal(read.total,4);
  assert.deepEqual(s.getRequest({requestId:first.id}),answeredFirst);assert.deepEqual(other.getRequest({requestId:second.id}),answeredSecond);
  assert.deepEqual(s.listRequests({}).requests,[]);assert.equal(s.listRequests({status:'answered'}).requests.length,2);
  assert.equal(createConversation(s).messageCount,4,'creation retry returns current conversation without undoing later turns');
});

test('request create retries are exact-payload-bound and preserve original immutable source snapshots',async t=>{
  const {service:s,open}=await fixture(t),c=createConversation(s),another=createConversation(s,'another'),card=s.createNote(note),card2=s.createNote({...note,idempotencyKey:'second-note'});
  const input=question(c.id,'exact',{cardIds:[card.id,card2.id],question:'  Exact question  '});
  const request=s.createRequest(input),snapshot=request.cardRefs[0];
  assert.equal(request.status,'pending');assert.equal(request.question,input.question);
  assert.equal(snapshot.cardId,card.id);assert.equal(snapshot.externalId,card.externalId);assert.equal(snapshot.sourceId,card.sourceId);assert.equal(snapshot.contentHash,card.contentHash);
  const {snapshotHash,...snapshotPayload}=snapshot;assert.equal(snapshotHash,digest(snapshotPayload));
  s.updateNote({cardId:card.id,set:{title:'Edited later',content:'Changed source'},expectedRevision:1});
  const other=open();assert.deepEqual(other.createRequest(input),request);
  assert.equal(other.getRequest({requestId:request.id}).cardRefs[0].content,note.content);
  for(const patch of [{question:'Exact question'},{cardIds:[card2.id,card.id]},{conversationId:another.id},{cardIds:[]}])conflict(()=>other.createRequest({...input,...patch}));
  assert.equal(s.readConversation({conversationId:c.id}).messages.length,1);assert.equal(s.readConversation({conversationId:another.id}).messages.length,0);
  assert.equal(s.store.history().filter(event=>event.event==='request_created').length,1);
});

test('card snapshots bound source excerpts and omit annotations, arbitrary metadata and URL credentials',async t=>{
  const {service:s}=await fixture(t),c=createConversation(s);
  const cardId=s.ingest({sourceId:'source',items:[{externalId:'original-id',title:'Source',content:'a'.repeat(50000),summary:'s'.repeat(2000),url:'https://user:SECRET@example.com/source',truncated:true}]}).cardIds[0];
  s.updateAnnotation({cardId,set:{note:'PRIVATE_PERSONAL_ANNOTATION',tags:['PRIVATE_TAG']},expectedRevision:0});
  const card=s.store.get('card',cardId);s.store.put('card',cardId,{...card,token:'PRIVATE_CREDENTIAL',arbitraryMetadata:{private:'PRIVATE_ARBITRARY'}});
  const request=s.createRequest(question(c.id,'snapshot',{cardIds:[cardId]})),reference=request.cardRefs[0];
  assert.equal(reference.content.length,1200);assert.equal(reference.summary.length,500);assert.equal(reference.contentTruncated,true);assert.equal(reference.summaryTruncated,true);assert.equal(reference.truncated,true);
  assert.equal(reference.url,undefined);assert.equal(reference.externalId,'original-id');assert.equal(reference.contentHash,card.contentHash);
  for(const secret of ['SECRET','PRIVATE_PERSONAL_ANNOTATION','PRIVATE_TAG','PRIVATE_CREDENTIAL','PRIVATE_ARBITRARY'])assert.equal(JSON.stringify(request).includes(secret),false);
  s.ingest({sourceId:'source',items:[{externalId:'original-id',title:'Refreshed',content:'Refreshed content'}]});
  assert.deepEqual(s.getRequest({requestId:request.id}).cardRefs,[reference]);
  assert.deepEqual(s.readConversation({conversationId:c.id}).messages[0].cardRefs,[reference]);
});

test('answer retries are identical and atomic while changed answers or evidence conflict',async t=>{
  const {service:s,open}=await fixture(t),c=createConversation(s),card=s.createNote(note),otherCard=s.createNote({...note,idempotencyKey:'second-note'});
  const request=s.createRequest(question(c.id)),args={requestId:request.id,answer:'Grounded answer',evidenceIds:[card.id,otherCard.id]};
  conflict(()=>s.answerRequest({...args,evidenceIds:['missing']}),'CARD_NOT_FOUND');
  assert.equal(s.getRequest({requestId:request.id}).status,'pending');
  const answer=s.answerRequest(args),other=open();assert.deepEqual(other.answerRequest(args),answer);
  for(const patch of [{answer:'Changed answer'},{answer:'Grounded answer '},{evidenceIds:[]},{evidenceIds:[otherCard.id,card.id]}])conflict(()=>other.answerRequest({...args,...patch}),'ANSWER_CONFLICT');
  assert.equal(s.readConversation({conversationId:c.id}).messages.length,2);
  assert.equal(s.store.history().filter(event=>event.event==='request_answered').length,1);
  assert.equal(s.getRequest({requestId:request.id}).answerMessageId,answer.answerMessageId);
  assert.deepEqual(s.createRequest(question(c.id)),answer,'lost creation ACK can safely recover even after answer');
});

test('queued workers receive bounded frozen multi-turn context with full history pagination available',async t=>{
  const {service:s}=await fixture(t),c=createConversation(s),card=s.createNote(note);
  for(let i=0;i<8;i++){
    const request=s.createRequest(question(c.id,`turn-${i}`,{question:`Question ${i}:`+'q'.repeat(3000),cardIds:[card.id]}));
    s.answerRequest({requestId:request.id,answer:`Answer ${i}:`+'a'.repeat(5000),evidenceIds:[card.id]});
  }
  const latest=s.createRequest(question(c.id,'latest',{question:'Continue this discussion',cardIds:[card.id]}));
  assert.equal(latest.context.messages.length,12);assert.equal(latest.context.total,17);assert.equal(latest.context.offset,5);assert.equal(latest.context.hasEarlier,true);assert.equal(latest.context.throughSequence,17);
  for(const message of latest.context.messages){assert.ok(message.text.length<=2000);if(message.cardRefs)for(const ref of message.cardRefs){assert.equal(ref.content,undefined);assert.equal(ref.summary,undefined);assert.ok(ref.snapshotHash);}}
  assert.equal(latest.context.messages.at(-1).text,'Continue this discussion');assert.ok(latest.context.messages.some(message=>message.textTruncated));
  const all=[];let offset=0;
  do {const page=s.readConversation({conversationId:c.id,limit:3,offset});all.push(...page.messages);offset=page.nextOffset;}while(offset!==null);
  assert.equal(all.length,17);assert.deepEqual(all.map(message=>message.sequence),Array.from({length:17},(_,i)=>i+1));assert.ok(all.some(message=>message.text.length>5000));
  const frozen=structuredClone(latest.context);
  s.answerRequest({requestId:latest.id,answer:'Done',evidenceIds:[]});
  assert.deepEqual(s.getRequest({requestId:latest.id}).context,frozen,'context records the submission boundary and does not shift after answering');
});

test('schemas reject unbounded pagination, forged IDs, unknown fields and invalid request/answer data',async t=>{
  const {service:s}=await fixture(t),c=createConversation(s),input=question(c.id);
  for(const patch of [{conversationId:'chatgpt-thread'},{conversationId:'conversation_'},{conversationId:'conversation_'+ 'a'.repeat(100)},{question:''},{question:'  '},{question:'x'.repeat(4001)},{cardIds:['same','same']},{cardIds:['invalid/path']},{cardIds:Array.from({length:21},(_,i)=>`card_${i}`)},{idempotencyKey:''},{idempotencyKey:'x'.repeat(201)},{threadId:'host'}, {cardIds:null}])invalid(()=>s.createRequest({...input,...patch}));
  invalid(()=>s.createRequest({question:'Legacy accepted only over HTTP',cardIds:[]}));
  conflict(()=>s.createRequest({...input,conversationId:'conversation_missing'}),'CONVERSATION_NOT_FOUND');
  conflict(()=>s.createRequest({...input,cardIds:['missing']}),'CARD_NOT_FOUND');
  assert.equal(s.store.list('request').length,0);assert.equal(s.store.list('message').length,0);
  for(const patch of [{offset:-1},{offset:1.2},{offset:1000001},{offset:'1'},{limit:0},{limit:101},{limit:'10'},{cursor:'ignored'}]){
    invalid(()=>s.listConversations(patch));invalid(()=>s.listRequests(patch));invalid(()=>s.readConversation({conversationId:c.id,...patch}));
  }
  assert.deepEqual(s.readConversation({conversationId:c.id,offset:1000000,limit:100}).messages,[]);
  const request=s.createRequest(input);
  for(const patch of [{answer:''},{answer:' '},{answer:'a'.repeat(20001)},{evidenceIds:['same','same']},{evidenceIds:Array.from({length:51},(_,i)=>`id_${i}`)},{extra:true},{requestId:'host-thread'}])invalid(()=>s.answerRequest({requestId:request.id,answer:'Fine',evidenceIds:[],...patch}));
  conflict(()=>s.getRequest({requestId:'request_missing'}),'REQUEST_NOT_FOUND');
  conflict(()=>s.readConversation({conversationId:'conversation_missing'}),'CONVERSATION_NOT_FOUND');
  invalid(()=>s.getRequest({requestId:request.id,extra:true}));
});

test('legacy requests migrate without loss, with honest snapshot timing and deterministic durable mapping',async t=>{
  const {service:s,open}=await fixture(t),card=s.createNote(note);
  const pending={id:'request_legacy_pending',question:'Historical pending question',cardIds:[card.id,'card_missing'],status:'pending',createdAt:'2026-01-01T00:00:00.000Z'};
  const answered={id:'request_legacy_answered',question:'Historical answered question',cardIds:[card.id],status:'answered',createdAt:'2026-01-02T00:00:00.000Z',answer:'Historical answer',evidenceIds:[card.id],answeredAt:'2026-01-02T01:00:00.000Z'};
  s.store.put('request',pending.id,pending);s.store.put('request',answered.id,answered);
  const listed=s.listConversations({});assert.equal(listed.total,2);
  const request=s.getRequest({requestId:pending.id}),savedAnswer=s.getRequest({requestId:answered.id});
  for(const [key,value] of Object.entries(pending))assert.deepEqual(request[key],value);
  for(const [key,value] of Object.entries(answered))assert.deepEqual(savedAnswer[key],value);
  assert.equal(request.legacy,true);assert.match(request.conversationId,/^conversation_legacy_/);
  assert.equal(request.cardRefs[0].snapshotOrigin,'legacy-migration');assert.ok(request.cardRefs[0].capturedAt>pending.createdAt);
  assert.equal(request.cardRefs[1].available,false);assert.equal(request.cardRefs[1].cardId,'card_missing');
  assert.equal(s.readConversation({conversationId:request.conversationId}).total,1);
  assert.deepEqual(s.readConversation({conversationId:savedAnswer.conversationId}).messages.map(message=>message.text),[answered.question,answered.answer]);
  const other=open();assert.deepEqual(other.getRequest({requestId:pending.id}),request);assert.equal(other.listConversations({}).total,2);
  assert.deepEqual(other.answerRequest({requestId:answered.id,answer:answered.answer,evidenceIds:answered.evidenceIds}),savedAnswer);
  assert.equal(s.store.history().filter(event=>event.event==='request_migrated').length,2);
});

test('transactions roll back creation, keys, messages, answers and migration if metadata audit fails',async t=>{
  const {service:s}=await fixture(t),audit=s.store.audit.bind(s.store);
  s.store.audit=()=>{throw Error('simulated audit failure');};
  assert.throws(()=>createConversation(s),/audit failure/);assert.equal(s.store.list('conversation').length,0);assert.equal(s.store.list('conversation-key').length,0);
  s.store.audit=audit;const c=createConversation(s),before=s.store.history();s.store.audit=()=>{throw Error('simulated audit failure');};
  assert.throws(()=>s.createRequest(question(c.id)),/audit failure/);assert.equal(s.store.list('request').length,0);assert.equal(s.store.list('request-key').length,0);assert.equal(s.store.list('message').length,0);assert.equal(s.conversationRecord(c.id).messageCount,0);
  assert.throws(()=>s.createRequest({question:'Legacy HTTP',cardIds:[]},{allowLegacy:true}),/audit failure/);assert.equal(s.store.list('conversation').length,1);
  assert.deepEqual(s.store.history(),before);
  s.store.audit=audit;const request=s.createRequest(question(c.id));s.store.audit=()=>{throw Error('simulated audit failure');};
  assert.throws(()=>s.answerRequest({requestId:request.id,answer:'Failed answer',evidenceIds:[]}),/audit failure/);
  assert.equal(s.getRequest({requestId:request.id}).status,'pending');assert.equal(s.conversationRecord(c.id).messageCount,1);assert.equal(s.readConversation({conversationId:c.id}).messages[0].status,'pending');
  const legacy={id:'request_old',question:'Older',cardIds:[],status:'pending',createdAt:'2026-01-01T00:00:00.000Z'};s.store.put('request',legacy.id,legacy);
  assert.throws(()=>s.listConversations({}),/audit failure/);assert.deepEqual(s.store.get('request',legacy.id),legacy);assert.equal(s.store.list('conversation').length,1);
  s.store.audit=audit;assert.equal(s.listConversations({}).total,2);
});

test('conversation audits contain metadata only, with no titles, questions, answers, source excerpts or keys',async t=>{
  const {service:s}=await fixture(t),c=s.createConversation({title:'SECRET_CONVERSATION_TITLE',idempotencyKey:'SECRET_CONVERSATION_KEY'}),card=s.createNote(note);
  const request=s.createRequest(question(c.id,'SECRET_REQUEST_KEY',{question:'SECRET_QUESTION',cardIds:[card.id]}));
  s.answerRequest({requestId:request.id,answer:'SECRET_ANSWER',evidenceIds:[card.id]});
  const audit=JSON.stringify(s.store.history());
  for(const secret of ['SECRET_CONVERSATION_TITLE','SECRET_CONVERSATION_KEY','SECRET_REQUEST_KEY','SECRET_QUESTION','SECRET_ANSWER',note.title,note.content,note.idempotencyKey])assert.equal(audit.includes(secret),false);
  const event=s.store.history().find(event=>event.event==='request_created');assert.equal(event.detail.cardCount,1);assert.equal(event.detail.requestId,request.id);
});

test('HTTP and MCP share strict conversation, queue, read and answer contracts behind existing authentication',async t=>{
  const {service:s}=await fixture(t),token='conversation-test-token-012345678901234567890';
  const server=await startHttp(s,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'conversation-test',version:'1'});
  t.after(async()=>{await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const http=(path,method='GET',value,extra={})=>fetch(origin+path,{method,headers:{...headers,...extra},...(value===undefined?{}:{body:JSON.stringify(value)})});
  for(const path of ['/api/conversations','/api/conversations/conversation_missing','/api/requests','/api/requests/request_missing'])assert.equal((await fetch(origin+path)).status,401);
  assert.equal((await http('/api/conversations','POST',{idempotencyKey:'origin'},{Origin:'https://evil.example'})).status,403);
  const tools=(await client.listTools()).tools;assert.equal(tools.length,49);
  for(const name of ['qg_open_workspace','qg_create_conversation','qg_list_conversations','qg_read_conversation','qg_create_request','qg_get_request','qg_list_requests','qg_answer_request'])assert.ok(tools.some(tool=>tool.name===name));
  assert.equal(tools.some(tool=>tool.name.includes('delete')),false);
  const created=await call('qg_create_conversation',{title:'Shared contract',idempotencyKey:'shared'});assert.notEqual(created.isError,true);const conversation=created.structuredContent;
  const list=await (await http('/api/conversations?limit=1&offset=0')).json();assert.equal(list.conversations[0].id,conversation.id);
  const input=question(conversation.id,'http-request');const queuedResponse=await http('/api/requests','POST',input);assert.equal(queuedResponse.status,201);const queued=await queuedResponse.json();
  assert.deepEqual((await call('qg_get_request',{requestId:queued.id})).structuredContent,queued);
  assert.equal((await call('qg_list_requests')).structuredContent.requests[0].id,queued.id);
  assert.deepEqual((await call('qg_read_conversation',{conversationId:conversation.id})).structuredContent,await (await http(`/api/conversations/${conversation.id}`)).json());
  const answerArgs={requestId:queued.id,answer:'MCP saved answer',evidenceIds:[]};const answer=(await call('qg_answer_request',answerArgs)).structuredContent;
  assert.deepEqual(await (await http(`/api/requests/${queued.id}`)).json(),answer);
  assert.deepEqual(await (await http(`/api/requests/${queued.id}/answer`,'POST',{answer:answerArgs.answer,evidenceIds:[]})).json(),answer);
  assert.equal((await http(`/api/requests/${queued.id}/answer`,'POST',{answer:'Different',evidenceIds:[]})).status,409);
  assert.equal((await http('/api/requests','POST',{...input,question:'Different'})).status,409);
  assert.equal((await call('qg_answer_request',{...answerArgs,answer:'Different'})).structuredContent.code,'ANSWER_CONFLICT');
  const legacy=await http('/api/requests','POST',{question:'Old UI still works',cardIds:[]});assert.equal(legacy.status,201);assert.match((await legacy.json()).conversationId,/^conversation_/);
  assert.equal((await call('qg_create_request',{question:'MCP requires IDs',cardIds:[]})).isError,true);
  for(const path of ['/api/conversations?unknown=1','/api/conversations?__proto__=ignored','/api/conversations?offset=-1','/api/conversations?offset=','/api/conversations?offset=1.5','/api/conversations?limit=101','/api/conversations?limit=1&limit=2',`/api/conversations/${conversation.id}?conversationId=conversation_other`,`/api/requests/${queued.id}?unexpected=1`])assert.equal((await http(path)).status,400,path);
  for(const [name,args] of [['qg_create_conversation',{idempotencyKey:'invalid',extra:true}],['qg_list_conversations',{extra:true}],['qg_read_conversation',{conversationId:conversation.id,extra:true}],['qg_create_request',{...input,extra:true}],['qg_get_request',{requestId:queued.id,extra:true}],['qg_list_requests',{extra:true}],['qg_answer_request',{...answerArgs,extra:true}]])assert.equal((await call(name,args)).isError,true,name);
  assert.equal((await http('/api/requests/request_missing')).status,404);assert.equal((await http('/api/conversations/conversation_missing')).status,404);
  assert.equal((await http(`/api/conversations/${conversation.id}`,'DELETE')).status,404);
  assert.equal((await http(`/api/requests/${queued.id}/answer`,'POST',{...answerArgs})).status,400,'path-owned IDs cannot also arrive in the body');
  assert.equal(s.readConversation({conversationId:conversation.id}).total,2);
});

test('concurrent independent processes deduplicate request and answer commits using SQLite transactions',async t=>{
  const {service:s,directory}=await fixture(t),c=createConversation(s);
  const serviceUrl=new URL('../server/service.mjs',import.meta.url).href,configUrl=new URL('../server/config.mjs',import.meta.url).href;
  const execute=promisify(execFile);
  const run=async expression=>{const code=`import {Service} from ${JSON.stringify(serviceUrl)};import {ConfigSchema} from ${JSON.stringify(configUrl)};const s=new Service(ConfigSchema.parse({dataDir:${JSON.stringify(directory)},connectors:[]}));try{console.log(JSON.stringify(${expression}));}finally{await s.close();}`;const {stdout}=await execute(process.execPath,['--input-type=module','-e',code]);return JSON.parse(stdout.trim());};
  const input=question(c.id,'cross-process');const created=await Promise.all(Array.from({length:4},()=>run(`s.createRequest(${JSON.stringify(input)})`)));
  assert.equal(new Set(created.map(request=>request.id)).size,1);assert.equal(s.readConversation({conversationId:c.id}).total,1);
  const args={requestId:created[0].id,answer:'Exactly once answer',evidenceIds:[]};const answered=await Promise.all(Array.from({length:4},()=>run(`s.answerRequest(${JSON.stringify(args)})`)));
  assert.equal(new Set(answered.map(request=>request.answerMessageId)).size,1);assert.equal(s.readConversation({conversationId:c.id}).total,2);
  assert.equal(s.store.history().filter(event=>event.event==='request_created').length,1);assert.equal(s.store.history().filter(event=>event.event==='request_answered').length,1);
});
