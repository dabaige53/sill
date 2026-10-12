import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { request } from 'node:http';
import { startLocal } from '../server/local.mjs';
import { LocalRepository } from '../server/local-state.mjs';
const run=promisify(execFile);
const card={id:'test-note',type:'note',title:'本地卡片',body:['正文'],url:'https://example.com'};

test('local operations persist all card states and reject conflicts atomically',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qg-local-')),file=join(dir,'cards.json');
  try{
    const repo=new LocalRepository(file);
    repo.apply({operations:[{op:'card.upsert',card}]});
    const saved=repo.apply({expectedRevision:1,operations:[{op:'item.patch',id:card.id,values:{read:true,bookmarked:true,later:true,note:'备注',tags:['工作'],tagsEdited:true,progress:.8,snoozedUntil:123,dismissed:true,reminderDone:true}},{op:'preferences.patch',values:{sort:'time',reduceTransparency:true}},{op:'reading.add',seconds:12}]});
    assert.deepEqual(new LocalRepository(file).snapshot(),saved);
    assert.throws(()=>repo.apply({expectedRevision:1,operations:[{op:'card.delete',id:card.id}]}),/版本已变化/);
    assert.throws(()=>repo.apply({operations:[{op:'preferences.patch',values:{sort:'unread'}},{op:'item.patch',id:card.id,values:{note:'覆盖'},before:{note:'旧备注'}}]}),/同一字段/);
    assert.deepEqual(repo.snapshot(),saved,'failed batch must not partially commit');
    assert.throws(()=>repo.apply({operations:[{op:'card.upsert',card:{...card,url:'javascript:alert(1)'}}]}));
    assert.throws(()=>repo.apply({operations:[{op:'card.upsert',card:{...card,id:'__proto__'}}]}));
    assert.throws(()=>repo.apply({operations:[{op:'item.patch',id:card.id,values:{taskDone:['missing']}}]}),/任务 ID/);
    repo.apply({operations:[{op:'card.upsert',card:{id:'task',type:'task',title:'任务',tasks:[{id:'t1',text:'检查'}]}},{op:'item.patch',id:'task',values:{taskDone:['t1']}}]});
    assert.deepEqual(repo.snapshot().state.items.task.taskDone,['t1']);
    repo.apply({operations:[{op:'card.delete',id:card.id}]});
    assert.equal(repo.snapshot().state.cards.some(c=>c.id===card.id),false);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('loopback HTTP and actual agent CLI share the same data without App/MCP login',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'qg-http-')),file=join(dir,'cards.json');
  const server=await startLocal({port:0,file}),port=server.address().port,origin='http://127.0.0.1:'+port;
  const cli=async(...args)=>JSON.parse((await run(process.execPath,['scripts/qg.mjs',...args],{cwd:join(import.meta.dirname,'..'),env:{...process.env,QG_LOCAL_PORT:String(port)}})).stdout);
  try{
    assert.equal((await fetch(origin+'/health').then(r=>r.json())).mode,'local');
    assert.equal((await fetch(origin+'/api/local/state',{headers:{Origin:'https://example.com'}})).status,403);
    const status=await new Promise(resolve=>{const req=request(origin+'/api/local/state',{headers:{Host:'example.com'}},res=>{res.resume();resolve(res.statusCode);});req.end();});
    assert.equal(status,403);
    assert.equal((await fetch(origin+'/api/local/operations',{method:'POST',body:'{}'})).status,415);
    assert.equal((await fetch(origin+'/.env')).status,404);
    const response=await fetch(origin+'/api/local/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations:[{op:'card.upsert',card}]})});
    assert.equal(response.status,200);
    assert.ok((await cli('capabilities')).itemFields.includes('taskDone'));
    assert.equal((await cli('get',card.id)).card.title,card.title);
    assert.equal((await cli('list','本地')).cards.length,1);
    assert.equal((await cli('open',card.id)).source,card.url);
    assert.equal((await fetch(origin+'/mcp')).status,404);
    const again=await fetch(origin+'/api/local/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json());
    assert.equal(again.state.cards.length,1,'migration cannot replace saved data');
  }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
