import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthFixture,AUTH} from './helpers/oauth-fixture.ts';
test('password login resumes consent without approval, rejects wrong credentials and cross-origin',async()=>{
 const f=await oauthFixture();try{
  const jar=new Map<any, any>();const page=await f.call('/auth/login',{cookieJar:jar});assert.equal(page.status,200);assert.match(await page.text(),/current-password/);
  const start=await f.call('/oauth/consent?authorization_id='+AUTH,{cookieJar:jar});assert.match(await start.text(),/href="\/auth\/login"/);
  const post=(password?: any,headers: any={})=>f.call('/auth/password',{cookieJar:jar,method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({email:'synthetic@example.com',password})});
  assert.equal((await post('wrong')).status,401);assert.ok(!jar.get('__Host-sill-access'));
  assert.equal((await post('synthetic-password',{Origin:'https://evil.example'})).status,403);
  const login=await post('synthetic-password');assert.equal(login.status,200);assert.equal((await login.json()).location,f.config.appOrigin+'/oauth/consent?authorization_id='+AUTH);
  assert.ok(jar.get('__Host-sill-refresh'));assert.equal(await f.grant(),undefined);
  assert.equal((await f.call('/oauth/consent?authorization_id='+AUTH,{cookieJar:jar})).status,200);
 }finally{await f.close();}
});
test('email verification can set a password and preserve the pending authorization',async()=>{
 const f=await oauthFixture();try{
  const jar=new Map<any, any>();const post=(path?: any,value?: any)=>f.call(path,{cookieJar:jar,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  assert.equal((await post('/auth/password/update',{password:'synthetic-password'})).status,401);
  await f.call('/oauth/consent?authorization_id='+AUTH,{cookieJar:jar});
  assert.equal((await post('/auth/login',{email:'synthetic@example.com',setupPassword:true})).status,202);
  const callback=await f.call('/auth/callback?code=synthetic-code',{cookieJar:jar});assert.equal(callback.headers.get('location'),f.config.appOrigin+'/auth/password/new');
  assert.equal((await f.call('/auth/password/new',{cookieJar:jar})).status,200);
  assert.equal((await post('/auth/password/update',{password:'short'})).status,400);
  const saved=await post('/auth/password/update',{password:'synthetic-new-password'});assert.equal(saved.status,200);assert.equal((await saved.json()).location,f.config.appOrigin+'/oauth/consent?authorization_id='+AUTH);assert.equal(f.sessionState.passwordUpdated,true);assert.equal(await f.grant(),undefined);
 }finally{await f.close();}
});
