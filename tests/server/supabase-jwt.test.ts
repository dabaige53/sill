import test from 'node:test';
import assert from 'node:assert/strict';
import {authenticateSupabase} from '../../server/cloud/supabase-auth.ts';
import {token,config,clientFactory} from './helpers/signed-auth.ts';
import {A,resource} from './helpers/boundary-fixture.ts';
test('official SDK verifies real ES256 signatures and rejects tampering/expiry/resource substitution',async()=>{
 const good=token();assert.equal((await authenticateSupabase('Bearer '+good,config,clientFactory)).principal.userId,A);
 const parts=good.split('.');parts[1]=Buffer.from(JSON.stringify({sub:A,exp:Date.now()/1000+600})).toString('base64url');
 for(const bad of [parts.join('.'),token({exp:1}),token({iss:'https://wrong.example/auth/v1'}),token({aud:'wrong'}),token({nbf:Date.now()/1000+300})])await assert.rejects(authenticateSupabase('Bearer '+bad,config,clientFactory),{status:401});
 const agent=token({client_id:'agent',aud:resource,user_metadata:{scopes:['*']}});
 const principal=(await authenticateSupabase('Bearer '+agent,{...config,kind:'mcp',audience:resource},clientFactory)).principal;
 assert.deepEqual(principal,{userId:A,clientId:'agent'});
 await assert.rejects(authenticateSupabase('Bearer '+agent,{...config,kind:'mcp',audience:'https://other.example/mcp'},clientFactory),{status:401});
 await assert.rejects(authenticateSupabase('Bearer '+good,{...config,kind:'mcp'},clientFactory),{status:403});
 await assert.rejects(authenticateSupabase('Bearer '+token({client_id:'agent'}),{...config,kind:'web'},clientFactory),{status:403});
});
