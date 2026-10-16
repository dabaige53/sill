import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createSillRuntime} from '../server/cloud/http.mjs';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {token} from './helpers/signed-auth.mjs';

// Load the actual Worker entry without requiring generated site assets on disk.
const result=await build({entryPoints:['server/cloud/worker.mjs'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-assets',setup(b){b.onResolve({filter:/\.(html|png|svg)$/},args=>({path:args.path,namespace:'test-assets'}));b.onLoad({filter:/.*/,namespace:'test-assets'},()=>({contents:'export default "test asset"',loader:'js'}));}}]});
const {createWorker}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));

test('Worker fetch calls share only active refresh work, without sharing user clients or retaining session results',async()=>{
 const f=await cloudFixture();try{
  let runtimes=0;const identities=[];
  const worker=createWorker({runtimeFactory:(config,options)=>{runtimes++;return createSillRuntime(config,{...options,clientFactory:(...args)=>{const client=f.factory(...args);if(args[2].global?.headers?.Authorization)identities.push(client);return client;}});}});
  const env={SUPABASE_URL:f.config.url,SUPABASE_PUBLISHABLE_KEY:f.config.publishableKey,APP_ORIGIN:f.config.appOrigin,AGENT_AUDIENCE:f.config.agentAudience};
  const cookies='__Host-sill-access='+token({exp:Math.floor(Date.now()/1000)-60})+'; __Host-sill-refresh=synthetic-unused-refresh';
  const request=()=>new Request(f.config.appOrigin+'/auth/session',{headers:{Cookie:cookies}});
  const responses=await Promise.all([worker.fetch(request(),env),worker.fetch(request(),{...env}),worker.fetch(request(),env)]);
  assert.ok(responses.every(r=>r.status===200));assert.equal(runtimes,1);assert.equal(f.sessionState.refreshCalls,1);assert.equal(new Set(identities).size,identities.length);
  for(const r of responses)assert.equal(r.headers.getSetCookie().length,2);
  assert.equal((await worker.fetch(request(),env)).status,200);assert.equal(f.sessionState.refreshCalls,2,'completed refresh result was discarded');
  const anonymous=await worker.fetch(new Request(f.config.appOrigin+'/auth/session'),env);assert.equal(anonymous.status,401,'previous user state did not leak into a new request');
  const changed={...env,MCP_ENABLE:'true'};assert.equal((await worker.fetch(request(),changed)).status,200);assert.equal(runtimes,2,'configuration changes replace the sole runtime');
 }finally{await f.close();}
});
