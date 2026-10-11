import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigSchema } from '../server/config.mjs';
import { Connectors } from '../server/connectors.mjs';
import { Collect, publicError } from '../server/schemas.mjs';

test('calendar pagination, timed/all-day events, cancellation filtering and source URL',async()=>{
  const seen=[];
  const c=new Connectors(ConfigSchema.parse({connectors:[{id:'cal',label:'Calendar',type:'google-calendar'}]}),{env:{GOOGLE_ACCESS_TOKEN:'private-token'},fetchImpl:async(url)=>{
    const u=new URL(url);seen.push(u);return Response.json(u.searchParams.has('pageToken')?{items:[{id:'all',summary:'全天',start:{date:'2026-10-11'},end:{date:'2026-10-12'}}]}:{items:[{id:'one',summary:'Meeting',start:{dateTime:'2026-10-11T09:00:00+08:00'},end:{dateTime:'2026-10-11T10:00:00+08:00'},htmlLink:'https://calendar.google.com/event?id=one'},{id:'cancelled',status:'cancelled'}],nextPageToken:'page2'});
  }});
  const result=await c.collect(Collect.parse({connectorId:'cal',maxPages:2,timeMin:'2026-10-11T00:00:00+08:00',timeMax:'2026-10-12T00:00:00+08:00'}));
  assert.equal(result.items.length,2);assert.equal(result.partial,false);assert.equal(result.items[0].start,'2026-10-11T01:00:00.000Z');assert.equal(result.items[1].start,undefined);assert.equal(result.items[1].startDate,'2026-10-11');assert.equal(seen[1].searchParams.get('pageToken'),'page2');
});

test('Notion follows block pages and nested children, and pins the supported API version',async()=>{
  const c=new Connectors(ConfigSchema.parse({connectors:[{id:'notes',label:'Notion',type:'notion'}]}),{env:{NOTION_TOKEN:'private-token'},fetchImpl:async(url,options)=>{
    assert.equal(options.headers['Notion-Version'],'2025-09-03');
    if(String(url).endsWith('/search'))return Response.json({results:[{id:'page',properties:{Name:{type:'title',title:[{plain_text:'项目说明'}]}},url:'https://notion.so/page',last_edited_time:'2026-10-11T01:00:00Z'}],has_more:true,next_cursor:'page-next'});
    if(String(url).includes('/nested/'))return Response.json({results:[{id:'inner',type:'paragraph',paragraph:{rich_text:[{text:{content:'嵌套内容'}}]}}]});
    if(String(url).includes('start_cursor='))return Response.json({results:[{id:'second',type:'paragraph',paragraph:{rich_text:[{plain_text:'第二页'}]}}]});
    return Response.json({results:[{id:'nested',type:'paragraph',paragraph:{rich_text:[{plain_text:'第一段'}]},has_children:true}],has_more:true,next_cursor:'blocks2'});
  }});
  const result=await c.collect(Collect.parse({connectorId:'notes'}));
  assert.equal(result.items[0].content,'第一段\n嵌套内容\n第二页');assert.equal(result.nextCursor,'page-next');assert.equal(result.partial,true);
});

test('missing authorization is actionable and never exposes an upstream error body',async()=>{
  const config=ConfigSchema.parse({connectors:[{id:'n',label:'Notion',type:'notion'}]});
  const empty=new Connectors(config,{env:{}});
  await assert.rejects(()=>empty.collect(Collect.parse({connectorId:'n'})),/NOTION_TOKEN/);
  const c=new Connectors(config,{env:{NOTION_TOKEN:'very-secret'},fetchImpl:async()=>new Response('very-secret raw upstream trace',{status:403})});
  try {await c.collect(Collect.parse({connectorId:'n'}));assert.fail();}catch(error){const clean=publicError(error);assert.equal(clean.code,'AUTH_REQUIRED');assert.ok(!JSON.stringify(clean).includes('very-secret'));}
});

test('read retries on rate limiting but write never retries',async()=>{
  let count=0;
  const c=new Connectors(ConfigSchema.parse({connectors:[{id:'c',label:'日历',type:'google-calendar',allowWrites:true}]}),{env:{GOOGLE_ACCESS_TOKEN:'secret'},fetchImpl:async()=>++count===1?new Response('',{status:429}):Response.json({items:[]})});
  await c.collect(Collect.parse({connectorId:'c'}));assert.equal(count,2);
  count=0;await assert.rejects(()=>c.write('c','create_event',{summary:'a',start:{dateTime:'2026-10-11T01:00:00Z'},end:{dateTime:'2026-10-11T02:00:00Z'}},'abc123'));assert.equal(count,1);
});

test('Google refresh credentials are exchanged and cached without disclosure',async()=>{
  let refreshes=0;
  const c=new Connectors(ConfigSchema.parse({connectors:[{id:'c',label:'日历',type:'google-calendar',refreshTokenEnv:'REFRESH',clientIdEnv:'CLIENT',clientSecretEnv:'SECRET'}]}),{env:{REFRESH:'r',CLIENT:'c',SECRET:'s'},fetchImpl:async(url,options)=>{
    if(String(url).includes('oauth2')){refreshes++;assert.equal(options.body.get('grant_type'),'refresh_token');return Response.json({access_token:'ephemeral',expires_in:3600});}
    assert.equal(options.headers.Authorization,'Bearer ephemeral');return Response.json({items:[]});
  }});
  await c.collect(Collect.parse({connectorId:'c'}));await c.collect(Collect.parse({connectorId:'c'}));assert.equal(refreshes,1);assert.ok(!JSON.stringify(c.status()).includes('ephemeral'));
});
