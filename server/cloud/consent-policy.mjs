/** Offline consent policy. Not imported by the Worker and never writes grants or calls OAuth. */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=()=>{throw new Error('consent_not_allowed');};
const exactSet=(values,allowed)=>Array.isArray(values)&&values.length>0&&new Set(values).size===values.length&&values.every(v=>typeof v==='string'&&allowed.includes(v));
function callback(value){
 if(typeof value!=='string'||value.length>2048)fail();
 let u;try{u=new URL(value);}catch{fail();}
 // Real callbacks must be explicitly recorded after discovery, never inferred from a display name.
 if(u.username||u.password||u.hash||u.search||u.href!==value||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','[::1]'].includes(u.hostname)))fail();
 return u.href;
}
/** All inputs except details come from server-verified identity/configuration, not the form. */
export function reviewConsent({details,principal,policy,grant}){
 if(!details||!principal||!policy||!grant||!UUID.test(principal.userId||'')||principal.clientId!==null)fail();
 if(!UUID.test(details.authorization_id||'')||details.user?.id!==principal.userId||!UUID.test(policy.clientId||'')||details.client?.id!==policy.clientId)fail();
 // A provider auto-redirect is not proof that Sill-specific access was reviewed.
 if(details.redirect_url||!Array.isArray(policy.redirectUris)||!policy.redirectUris.includes(details.redirect_uri))fail();
 const redirectUri=callback(details.redirect_uri);
 let origin;try{origin=new URL(policy.appOrigin);}catch{fail();}
 if(origin.protocol!=='https:'||origin.origin!==policy.appOrigin||policy.audience!==policy.appOrigin+'/mcp')fail();
 // OIDC identity scopes are NOT Sill content scopes. No email/profile default is silently accepted.
 const identityScopes=typeof details.scope==='string'?details.scope.trim().split(/\s+/).filter(Boolean):[];
 if(!exactSet(policy.identityScopes,['openid','email','profile','phone'])||!exactSet(identityScopes,policy.identityScopes))fail();
 if(grant.ownerId!==principal.userId||grant.clientId!==policy.clientId||grant.audience!==policy.audience)fail();
 if(!exactSet(policy.contentScopes,['content:read','content:write'])||!exactSet(grant.scopes,policy.contentScopes)||!grant.scopes.includes('content:read'))fail();
 if(!Array.isArray(policy.resources)||!Array.isArray(grant.resources)||!grant.resources.length||new Set(grant.resources).size!==grant.resources.length)fail();
 // A workspace wildcard must be an explicit singleton on both sides. It is never synthesized.
 if(grant.resources.includes('*')){if(grant.resources.length!==1||policy.resources.length!==1||policy.resources[0]!=='*')fail();}
 else if(!grant.resources.every(id=>UUID.test(id)&&policy.resources.includes(id)))fail();
 const review={authorizationId:details.authorization_id,userId:principal.userId,clientId:policy.clientId,clientName:typeof details.client.name==='string'?details.client.name.slice(0,200):policy.clientId,redirectUri,audience:policy.audience,identityScopes:[...identityScopes],contentScopes:[...grant.scopes],resources:[...grant.resources],canList:grant.resources[0]==='*',canCreate:grant.resources[0]==='*'&&grant.scopes.includes('content:write')};
 return Object.freeze({...review,identityScopes:Object.freeze(review.identityScopes),contentScopes:Object.freeze(review.contentScopes),resources:Object.freeze(review.resources)});
}
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Escaped review fragment. The authenticated controller owns the active form. */
export function consentSummary(review){
 const range=review.resources[0]==='*'?'整个个人工作区（含以后新增的内容）':review.resources.map(escape).join('、');
 return `<section aria-labelledby="consent-title"><h1 id="consent-title">允许 ${escape(review.clientName)} 访问 Sill？</h1><dl><dt>客户端 ID</dt><dd>${escape(review.clientId)}</dd><dt>回调地址</dt><dd>${escape(review.redirectUri)}</dd><dt>服务地址</dt><dd>${escape(review.audience)}</dd><dt>身份信息</dt><dd>${review.identityScopes.map(escape).join('、')}</dd><dt>Sill 内容权限</dt><dd>${review.contentScopes.map(s=>s==='content:read'?'读取':'创建与修改').join('、')}</dd><dt>内容范围</dt><dd>${range}</dd></dl><p>不授予删除、事件提交或结果回写权限。</p>${review.canList?'':'<p>仅可按已知 ID 访问所选卡片，不能列出整个工作区或创建卡片。</p>'}</section>`;
}
