import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { AI_STREAM_LIMITS,OPENAI_RESPONSES_URL,buildAiContext } from '../server/ai.mjs';
import { publicError } from '../server/schemas.mjs';

const KEY='unit-test-provider-credential-only';
const frame=event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const delta=text=>({type:'response.output_text.delta',delta:text});
const completed=(text,extra={})=>({type:'response.completed',response:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}],usage:{input_tokens:5,output_tokens:7,total_tokens:12},...extra}});
const response=events=>new Response(events.map(frame).join(''),{headers:{'content-type':'text/event-stream'}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let n=0;n<200;n++){if(fn())return;await wait(5);}assert.fail('Timed out waiting for fixture condition');}
async function fixture(t,{ai={},fetchImpl=async()=>response([completed('Fixture answer')]),env={QG_TEST_KEY:KEY}}={}){
  const directory=await mkdtemp(join(tmpdir(),'qg-ai-')),services=[];
  const config=ConfigSchema.parse({dataDir:directory,ai:{enabled:true,model:'fixture-model',apiKeyEnv:'QG_TEST_KEY',timeoutMs:2000,...ai}});
  const open=()=>{const service=new Service(config,{env,fetchImpl});services.push(service);return service;};
  const service=open();
  t.after(async()=>{for(const service of services.reverse())if(!service.ai.closed)await service.close();await rm(directory,{recursive:true,force:true});});
  return {service,config,open,directory};
}
function request(s,key='one',question='Question',cardIds=[]){
  const c=s.createConversation({title:'Test conversation',idempotencyKey:'conversation'});
  return s.createRequest({conversationId:c.id,idempotencyKey:key,question,cardIds});
}
const settle=async(s,id)=>{await s.ai.running.get(id);return s.getAi({requestId:id});};
function controlled(){
  const controls={calls:0,cancelled:false};
  controls.fetch=async(url,init)=>{
    controls.calls++;controls.url=url;controls.init=init;
    return new Response(new ReadableStream({start(c){controls.controller=c;},cancel(){controls.cancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
  };
  controls.send=event=>controls.controller.enqueue(new TextEncoder().encode(frame(event)));
  return controls;
}

test('AI is opt-in, strict and does not inspect any credential in disabled mode',async t=>{
  const defaults=ConfigSchema.parse({});assert.equal(defaults.ai.enabled,false);assert.equal(defaults.ai.model,'');
  for(const ai of [{baseURL:'https://example.com'},{apiKey:'secret'},{provider:'other'},{maxOutputTokens:0},{maxConcurrency:0},{maxRequestsPerDay:0},{maxContextChars:999},{timeoutMs:99}])assert.throws(()=>ConfigSchema.parse({ai}));
  let reads=0,calls=0;const env=new Proxy({},{get(){reads++;throw Error('Must not read a credential');}});
  const {service:s}=await fixture(t,{ai:{enabled:false},env,fetchImpl:async()=>{calls++;throw Error('Network prohibited');}}),r=request(s);
  assert.equal(s.aiStatus().enabled,false);assert.equal(s.status().ai.ready,false);assert.equal(s.getAi({requestId:r.id}).canStart,false);
  assert.throws(()=>s.startAi({requestId:r.id}),e=>e.code==='AI_DISABLED');
  assert.equal(reads,0);assert.equal(calls,0);assert.equal(s.store.list('ai-run').length,0);assert.equal(s.aiStatus().budget.used,0);
});

test('missing model or injected credential never dispatches or consumes budget',async t=>{
  for(const options of [{ai:{model:''},env:{QG_TEST_KEY:KEY}},{env:{}}]){
    const {service:s}=await fixture(t,{...options,fetchImpl:()=>assert.fail('Must not dispatch')}),r=request(s);
    assert.equal(s.aiStatus().ready,false);assert.throws(()=>s.startAi({requestId:r.id}),e=>e.code==='AI_NOT_CONFIGURED');assert.equal(s.aiStatus().budget.used,0);
  }
});

test('foreground Responses streaming uses fixed endpoint, frozen bounded data and atomic ordered answer',async t=>{
  let outgoing;const {service:s,open}=await fixture(t,{fetchImpl:async(url,init)=>{outgoing={url,init};return response([delta('Hello '),delta('世界'),completed('Hello 世界')]);}});
  const card=s.createNote({title:'Reference',content:'Original source body',idempotencyKey:'note'});
  s.updateAnnotation({cardId:card.id,set:{note:'ANNOTATION_MUST_NOT_LEAVE',tags:[]},expectedRevision:0});
  const r=request(s,'one','Answer using my frozen card',[card.id]);s.updateNote({cardId:card.id,set:{content:'NEW_CONTENT_MUST_NOT_LEAVE'},expectedRevision:1});
  assert.equal(s.getAi({requestId:r.id}).status,'idle');assert.equal(s.store.list('ai-run').length,0);
  const started=s.startAi({requestId:r.id});assert.equal(started.status,'running');assert.equal(started.canStart,false);
  assert.equal(s.startAi({requestId:r.id}).status,'running');
  const done=await settle(s,r.id);assert.equal(done.status,'completed');assert.equal(done.output,'Hello 世界');assert.deepEqual(done.usage,{inputTokens:5,outputTokens:7,totalTokens:12});assert.equal(done.billingMayContinue,false);
  assert.equal(outgoing.url,OPENAI_RESPONSES_URL);assert.equal(outgoing.init.redirect,'error');assert.equal(outgoing.init.headers.Authorization,`Bearer ${KEY}`);
  const body=JSON.parse(outgoing.init.body);assert.equal(body.store,false);assert.equal(body.background,false);assert.equal(body.stream,true);assert.deepEqual(body.tools,[]);assert.equal(body.tool_choice,'none');assert.equal(body.max_output_tokens,1024);
  assert.ok(body.input.includes('Original source body'));for(const forbidden of ['ANNOTATION_MUST_NOT_LEAVE','NEW_CONTENT_MUST_NOT_LEAVE',KEY])assert.equal(body.input.includes(forbidden),false);
  const answer=s.getRequest({requestId:r.id});assert.equal(answer.status,'answered');assert.deepEqual(answer.evidenceIds,[]);
  assert.deepEqual(s.readConversation({conversationId:r.conversationId}).messages.map(m=>[m.role,m.sequence]),[['user',1],['assistant',2]]);
  assert.deepEqual(open().startAi({requestId:r.id}),done);assert.equal(s.aiStatus().budget.used,1);
  const persisted=JSON.stringify([...s.store.list('ai-run'),...s.store.history()]);assert.equal(persisted.includes(KEY),false);assert.equal(persisted.includes('Bearer'),false);
});

test('SSE supports every-byte UTF-8, CRLF and multiline data chunk boundaries',async t=>{
  const text='Answer 🙂 中文';
  const multiline=`event: response.output_text.delta\ndata: {"type":"response.output_text.delta",\ndata: "delta":${JSON.stringify(text)}}\n\n`;
  const wire=(`: keepalive\r\n\r\n`+multiline+frame(completed(text))).replaceAll('\n','\r\n').replaceAll('\r\r\n','\r\n');
  const bytes=new TextEncoder().encode(wire);
  const {service:s}=await fixture(t,{fetchImpl:async()=>new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(Uint8Array.of(b));c.close();}}),{headers:{'content-type':'text/event-stream; charset=utf-8'}})}),r=request(s);
  s.startAi({requestId:r.id});assert.equal((await settle(s,r.id)).output,text);
});

test('context cap prioritizes question and only frozen excerpt/message allowlists',async t=>{
  const {service:s}=await fixture(t),cards=[];for(let i=0;i<20;i++)cards.push(s.createNote({title:`Card ${i}`,content:'c'.repeat(5000),idempotencyKey:`note-${i}`}).id);
  for(let i=0;i<8;i++){const r=request(s,`earlier-${i}`,'earlier question '.repeat(100));s.answerRequest({requestId:r.id,answer:'earlier answer '.repeat(200),evidenceIds:[]});}
  const r=request(s,'last','Q'.repeat(4000),cards);
  for(const limit of [1000,16000,64000]){const built=buildAiContext(r,limit);assert.ok(built.context.chars<=limit);assert.equal(built.context.chars,built.instructions.length+built.input.length);assert.ok(JSON.parse(built.input));assert.equal(built.context.truncated,true);}
});

test('cancel persists partial output, aborts local stream and never resubmits across service instances',async t=>{
  const c=controlled(),{service:s,open}=await fixture(t,{fetchImpl:c.fetch}),r=request(s),other=open();
  s.startAi({requestId:r.id});await until(()=>c.controller);c.send(delta('Partial answer'));await until(()=>s.getAi({requestId:r.id}).output==='Partial answer');
  const stopped=other.cancelAi({requestId:r.id});assert.equal(stopped.status,'cancelled');assert.equal(stopped.billingMayContinue,true);
  await settle(s,r.id);assert.equal(c.init.signal.aborted,true);assert.equal(s.getAi({requestId:r.id}).output,'Partial answer');assert.equal(s.getRequest({requestId:r.id}).status,'pending');
  assert.equal(other.startAi({requestId:r.id}).status,'cancelled');assert.equal(c.calls,1);assert.equal(other.aiStatus().budget.used,1);
});

test('graceful close retains interrupted partial output and reopened engine cannot restart it',async t=>{
  const c=controlled(),{service:s,open}=await fixture(t,{fetchImpl:c.fetch}),r=request(s);s.startAi({requestId:r.id});await until(()=>c.controller);
  c.send(delta('Saved partial'));await until(()=>s.getAi({requestId:r.id}).output==='Saved partial');await s.close();
  const other=open(),run=other.getAi({requestId:r.id});assert.equal(run.status,'interrupted');assert.equal(run.output,'Saved partial');assert.equal(other.startAi({requestId:r.id}).status,'interrupted');assert.equal(c.calls,1);
});

test('manual answer wins before completion without duplicate message or overwrite',async t=>{
  const c=controlled(),{service:s,open}=await fixture(t,{fetchImpl:c.fetch}),r=request(s);s.startAi({requestId:r.id});await until(()=>c.controller);c.send(delta('AI partial'));await until(()=>s.getAi({requestId:r.id}).output==='AI partial');
  open().answerRequest({requestId:r.id,answer:'Manual answer',evidenceIds:[]});
  c.send(completed('AI partial'));const run=await settle(s,r.id);assert.equal(run.status,'superseded');assert.equal(s.getRequest({requestId:r.id}).answer,'Manual answer');assert.equal(s.readConversation({conversationId:r.conversationId}).messages.length,2);
});

test('completion rollback keeps answer and run terminal state atomic on storage failure',async t=>{
  const {service:s}=await fixture(t),r=request(s),audit=s.store.audit.bind(s.store);
  s.store.audit=(event,detail)=>{if(event==='ai_finished'&&detail.status==='completed')throw Error('Injected terminal commit failure');return audit(event,detail);};
  s.startAi({requestId:r.id});const run=await settle(s,r.id);assert.equal(run.status,'failed');assert.equal(s.getRequest({requestId:r.id}).status,'pending');assert.equal(s.readConversation({conversationId:r.conversationId}).messages.length,1);
});

test('daily attempt budget is durable, conservative and never recharged on idempotent start',async t=>{
  let calls=0;const {service:s,open}=await fixture(t,{ai:{maxRequestsPerDay:1},fetchImpl:async()=>{calls++;throw Error('unknown dispatch');}}),r=request(s);
  s.startAi({requestId:r.id});const done=await settle(s,r.id);assert.equal(done.error.code,'AI_NETWORK_UNCERTAIN');
  assert.equal(open().startAi({requestId:r.id}).status,'failed');const next=request(s,'two');assert.throws(()=>s.startAi({requestId:next.id}),e=>e.code==='AI_DAILY_LIMIT');assert.equal(calls,1);assert.equal(s.aiStatus().budget.used,1);
});

test('claim audit failure rolls back both run and daily budget before dispatch',async t=>{
  let calls=0;const {service:s}=await fixture(t,{fetchImpl:async()=>{calls++;return response([completed('Unexpected')]);}}),r=request(s),audit=s.store.audit.bind(s.store);
  s.store.audit=(event,detail)=>{if(event==='ai_started')throw Error('Injected claim failure');return audit(event,detail);};
  assert.throws(()=>s.startAi({requestId:r.id}),/Injected claim failure/);assert.equal(calls,0);assert.equal(s.store.list('ai-run').length,0);assert.equal(s.aiStatus().budget.used,0);
});

test('timeout handles an uncooperative fetch and never retries unknown network outcome',async t=>{
  let calls=0;const {service:s}=await fixture(t,{ai:{timeoutMs:100},fetchImpl:()=>{calls++;return new Promise(()=>{});}}),r=request(s);s.startAi({requestId:r.id});
  // Test-only live handle; production HTTP/stdio already keeps the event loop alive.
  const keep=setInterval(()=>{},1000);t.after(()=>clearInterval(keep));
  const done=await settle(s,r.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'AI_TIMEOUT');assert.equal(done.billingMayContinue,true);assert.equal(calls,1);
});

test('provider errors and response headers cannot leak secrets or arbitrary diagnostic text',async t=>{
  for(const fetchImpl of [async()=>new Response(`SECRET ${KEY}`,{status:429,headers:{'x-request-id':KEY}}),async()=>response([{type:'error',message:`SECRET ${KEY}`,code:KEY}]),async()=>{throw Error(`SECRET ${KEY}`);}]){
    const {service:s}=await fixture(t,{fetchImpl}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);
    assert.equal(run.status,'failed');for(const value of [run,s.store.list('ai-run'),s.store.history()]){assert.equal(JSON.stringify(value).includes(KEY),false);assert.equal(JSON.stringify(value).includes('SECRET'),false);}
  }
});

test('a provider echo of the configured key is redacted even across delta boundaries',async t=>{
  const {service:s}=await fixture(t,{fetchImpl:async()=>response([delta(KEY.slice(0,10)),delta(KEY.slice(10)),completed(KEY)])}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);
  assert.equal(run.output,'[REDACTED]');assert.equal(s.getRequest({requestId:r.id}).answer,'[REDACTED]');assert.equal(JSON.stringify(s.store.list('ai-run')).includes(KEY),false);
});

test('redaction cannot expand stored partials or answers beyond the answer cap',async t=>{
  for(const events of [[completed('x'.repeat(20000))],[delta('x'.repeat(20000)),completed('x'.repeat(20000))]]){
    const {service:s}=await fixture(t,{env:{QG_TEST_KEY:'x'},fetchImpl:async()=>response(events)}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);
    assert.equal(run.status,'failed');assert.equal(run.error.code,'AI_OUTPUT_LIMIT');assert.ok(run.output.length<=AI_STREAM_LIMITS.outputChars);assert.equal(s.getRequest({requestId:r.id}).status,'pending');
  }
});

test('refusal and incomplete responses preserve terminal state but never fabricate an answer',async t=>{
  for(const [events,expected] of [
    [[{type:'response.refusal.delta',delta:'Cannot comply'},completed('',{output:[{type:'message',role:'assistant',content:[{type:'refusal',refusal:'Cannot comply'}]}]})],'refused'],
    [[delta('Part'),{type:'response.incomplete',response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:2,output_tokens:3,total_tokens:5}}}],'incomplete'],
  ]){
    const {service:s}=await fixture(t,{fetchImpl:async()=>response(events)}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);assert.equal(run.status,expected);assert.equal(s.getRequest({requestId:r.id}).status,'pending');assert.equal(s.startAi({requestId:r.id}).status,expected);
    if(expected==='incomplete'){assert.equal(run.output,'Part');assert.equal(run.usage.totalTokens,5);}
  }
});

test('malformed, unterminated, mismatched and oversized streams terminate safely without automatic retries',async t=>{
  const fixtures=[
    [()=>new Response('data: {broken}\n\n',{headers:{'content-type':'text/event-stream'}}),'AI_STREAM_FORMAT'],
    [()=>new Response('data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}),'AI_STREAM_FORMAT'],
    [()=>new Response('not an SSE response'),'AI_STREAM_FORMAT'],
    [()=>response([delta('partial')]),'AI_STREAM_INTERRUPTED'],
    [()=>response([delta('one'),completed('different')]),'AI_STREAM_FORMAT'],
    [()=>response([completed('')]),'AI_EMPTY_OUTPUT'],
    [()=>response([delta('a'.repeat(AI_STREAM_LIMITS.outputChars+1))]),'AI_OUTPUT_LIMIT'],
    [()=>new Response('data: '+ 'a'.repeat(AI_STREAM_LIMITS.eventChars+1),{headers:{'content-type':'text/event-stream'}}),'AI_STREAM_LIMIT'],
    [()=>new Response(':'+ 'a'.repeat(AI_STREAM_LIMITS.bytes),{headers:{'content-type':'text/event-stream'}}),'AI_STREAM_LIMIT'],
    [()=>response(Array.from({length:AI_STREAM_LIMITS.events+1},()=>({type:'response.in_progress'}))),'AI_STREAM_LIMIT'],
    [()=>new Response(new Uint8Array([0xff,0xff]),{headers:{'content-type':'text/event-stream'}}),'AI_STREAM_FORMAT'],
    [()=>response([{type:'response.failed',response:{error:{message:KEY}}}]),'AI_PROVIDER_ERROR'],
  ];
  for(const [make,code] of fixtures){let calls=0;const {service:s}=await fixture(t,{fetchImpl:async()=>{calls++;return make();}}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);assert.equal(run.status,'failed');assert.equal(run.error.code,code);assert.equal(s.getRequest({requestId:r.id}).status,'pending');s.startAi({requestId:r.id});assert.equal(calls,1);}
});

test('all tool outputs are rejected, even in a completed or incomplete envelope',async t=>{
  const tool={type:'function_call',name:'delete_records',arguments:'{}'};
  for(const events of [[{type:'response.function_call_arguments.delta',delta:'{}'}],[{type:'response.output_item.added',item:tool}],[completed('ignored',{output:[tool]})],[{type:'response.incomplete',response:{status:'incomplete',output:[tool]}}]]){
    const {service:s}=await fixture(t,{fetchImpl:async()=>response(events)}),r=request(s);s.startAi({requestId:r.id});const run=await settle(s,r.id);assert.equal(run.error.code,'AI_UNEXPECTED_TOOL');assert.equal(s.getRequest({requestId:r.id}).status,'pending');assert.equal(s.store.list('action').length,0);
  }
});

const serviceUrl=new URL('../server/service.mjs',import.meta.url).href;
function launch(directory,requestId,{maxConcurrency=1,maxRequestsPerDay=20,crash=false,barrier=false}={}){
  const script=`import { Service } from ${JSON.stringify(serviceUrl)};import { appendFileSync } from 'node:fs';
const directory=process.argv[1],requestId=process.argv[2];
const service=new Service({dataDir:directory,connectors:[],ai:{enabled:true,model:'fixture',apiKeyEnv:'QG_TEST_KEY',timeoutMs:10000,maxConcurrency:${maxConcurrency},maxRequestsPerDay:${maxRequestsPerDay}}},{env:{QG_TEST_KEY:'process-fixture-only'},fetchImpl:async()=>{appendFileSync(directory+'/calls.log','call\\n');return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(${JSON.stringify(frame(delta('Durable partial')))}));}}),{headers:{'content-type':'text/event-stream'}});}});
${barrier?"console.log('READY');await new Promise(resolve=>process.stdin.once('data',resolve));":''}
try{const run=service.startAi({requestId});setTimeout(()=>console.log(JSON.stringify(service.getAi({requestId}))),80);}catch(error){console.log(JSON.stringify({code:error.code}));}
${crash?'setInterval(()=>{},1000);':'setTimeout(async()=>{await service.close();},500);'}`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,directory,requestId],{env:{NODE_NO_WARNINGS:'1'},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const result=once(child,'exit').then(([code,signal])=>({code,signal,stdout,stderr}));
  return {child,result,read:()=>stdout};
}

test('independent processes atomically deduplicate claims and enforce shared concurrency/daily limits',async t=>{
  for(const scenario of ['dedupe','concurrency','budget']){
    const {service:s,directory}=await fixture(t),one=request(s,'one'),two=request(s,'two');
    const options={barrier:true,...(scenario==='budget'?{maxConcurrency:2,maxRequestsPerDay:1}:{})};
    const a=launch(directory,one.id,options),b=launch(directory,scenario==='dedupe'?one.id:two.id,options);
    t.after(()=>{a.child.kill();b.child.kill();});await until(()=>a.read().includes('READY')&&b.read().includes('READY'));a.child.stdin.end('go');b.child.stdin.end('go');const results=await Promise.all([a.result,b.result]);
    for(const result of results){assert.equal(result.code,0,result.stderr);assert.equal(result.stderr,'');}
    const calls=(await readFile(join(directory,'calls.log'),'utf8')).trim().split('\n');assert.equal(calls.length,1,scenario);
    const outputs=results.map(r=>JSON.parse(r.stdout.trim().split('\n').at(-1)));
    if(scenario==='concurrency')assert.ok(outputs.some(out=>out.code==='AI_CONCURRENCY_LIMIT'));
    if(scenario==='budget')assert.ok(outputs.some(out=>out.code==='AI_DAILY_LIMIT'));
    assert.equal(s.store.list('ai-run').length,1);assert.equal(s.aiStatus().budget.used,1);
  }
});

test('abrupt owner death recovers as interrupted without another provider call or budget charge',async t=>{
  const {service:s,directory,open}=await fixture(t),r=request(s),worker=launch(directory,r.id,{crash:true});
  t.after(()=>worker.child.kill('SIGKILL'));await until(()=>worker.read().includes('Durable partial'));
  worker.child.kill('SIGKILL');await worker.result;
  const other=open(),run=other.getAi({requestId:r.id});assert.equal(run.status,'interrupted');assert.equal(run.output,'Durable partial');assert.equal(other.startAi({requestId:r.id}).status,'interrupted');assert.equal(other.aiStatus().budget.used,1);
  assert.equal((await readFile(join(directory,'calls.log'),'utf8')).trim(),'call');
});

test('AI request schemas and already-answered requests reject accidental payload expansion',async t=>{
  const {service:s}=await fixture(t),r=request(s);
  for(const method of ['startAi','getAi','cancelAi'])for(const args of [{},{requestId:'not-a-request'},{requestId:r.id,prompt:'override'}])assert.throws(()=>s[method](args),e=>publicError(e).code==='INVALID_INPUT');
  assert.throws(()=>s.cancelAi({requestId:r.id}),e=>e.code==='AI_NOT_STARTED');
  s.answerRequest({requestId:r.id,answer:'Already done',evidenceIds:[]});assert.throws(()=>s.startAi({requestId:r.id}),e=>e.code==='REQUEST_ALREADY_ANSWERED');assert.equal(s.aiStatus().budget.used,0);
});
