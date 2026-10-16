import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewConsent,consentSummary} from '../../server/cloud/consent-policy.ts';
const owner='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',card='33333333-3333-4333-8333-333333333333',authorization='44444444-4444-4444-8444-444444444444';
const input=(): Record<string, any>=>({details:{authorization_id:authorization,user:{id:owner},client:{id:client,name:'Test Codex'},redirect_uri:'http://127.0.0.1:5678/callback',scope:'openid'},principal:{userId:owner,clientId:null},policy:{clientId:client,redirectUris:['http://127.0.0.1:5678/callback'],appOrigin:'https://sill.example',audience:'https://sill.example/mcp',identityScopes:['openid'],contentScopes:['content:read'],resources:[card]},grant:{ownerId:owner,clientId:client,audience:'https://sill.example/mcp',scopes:['content:read'],resources:[card]}});
test('minimal existing-card read consent stays scoped and cannot list/create',()=>{const r=reviewConsent(input());assert.deepEqual(r.resources,[card]);assert.equal(r.canList,false);assert.equal(r.canCreate,false);assert.ok(Object.isFrozen(r.resources));assert.match(consentSummary(r),/不能列出整个工作区/);});
test('workspace writes require an explicit policy and grant on both sides',()=>{const a=input();a.policy.contentScopes.push('content:write');a.grant.scopes.push('content:write');a.policy.resources=['*'];a.grant.resources=['*'];const r=reviewConsent(a);assert.equal(r.canList,true);assert.equal(r.canCreate,true);assert.match(consentSummary(r),/含以后新增/);});
for(const [name,change] of Object.entries({
 'different owner':(a?: any)=>a.details.user.id=client,
 'OAuth identity cannot approve as a web owner':(a?: any)=>a.principal.clientId=client,
 'different client':(a?: any)=>a.details.client.id=owner,
 'callback lookalike':(a?: any)=>a.details.redirect_uri='http://127.0.0.1:5678/callback/other',
 'callback credentials':(a?: any)=>{a.details.redirect_uri='https://user:pass@example.com/callback';a.policy.redirectUris=[a.details.redirect_uri];},
 'remote insecure callback':(a?: any)=>{a.details.redirect_uri='http://evil.example/callback';a.policy.redirectUris=[a.details.redirect_uri];},
 'provider auto-approval':(a?: any)=>a.details.redirect_url='https://evil.example/',
 'generic audience':(a?: any)=>a.policy.audience='authenticated',
 'identity scope escalation':(a?: any)=>a.details.scope='openid email',
 'content scope pretending to be OAuth scope':(a?: any)=>a.details.scope='content:read',
 'delete permission':(a?: any)=>a.grant.scopes.push('content:delete'),
 'event permission':(a?: any)=>a.grant.scopes.push('event:submit'),
 'wildcard escalation':(a?: any)=>a.grant.resources=['*'],
 'different resource':(a?: any)=>a.grant.resources=[owner],
 'mixed wildcard':(a?: any)=>{a.policy.resources=['*'];a.grant.resources=['*',card];},
 'grant owner mismatch':(a?: any)=>a.grant.ownerId=client,
 'grant client mismatch':(a?: any)=>a.grant.clientId=owner,
 'grant audience mismatch':(a?: any)=>a.grant.audience='https://elsewhere.example/mcp'
}))test('rejects '+name,()=>{const a=input();change(a);assert.throws(()=>reviewConsent(a),/consent_not_allowed/);});
test('client-controlled presentation is escaped, with no remote logo or active form',()=>{const a=input();a.details.client.name='<img src=x onerror=alert(1)>';a.details.client.logo_uri='https://evil.example/track';const html=consentSummary(reviewConsent(a));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('evil.example'));assert.ok(!html.includes('<form'));});

test("full Sill access requires explicit matching policy and names every permission",()=>{const a=input();a.policy.contentScopes=["content:read","content:write","content:delete","event:read","event:submit"];a.grant.scopes=[...a.policy.contentScopes];a.policy.resources=["*"];a.grant.resources=["*"];const r=reviewConsent(a);assert.match(consentSummary(r),/删除卡片/);assert.match(consentSummary(r),/提交事件/);assert.match(consentSummary(r),/读取事件/);});
