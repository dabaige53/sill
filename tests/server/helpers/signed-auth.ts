import {generateKeyPairSync,sign} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {claims} from './boundary-fixture.ts';
export const config: Record<string, any>={url:'https://sill-test.supabase.co',publishableKey:'sb_publishable_synthetic',appOrigin:'https://sill.example'};
// Ephemeral synthetic signer. No cloud credentials or persisted signing keys.
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
export const jwk: Record<string, any>={...publicKey.export({format:'jwk'}),kid:'sill-test-key',alg:'ES256',use:'sig'};
const encode=(value?: any)=>Buffer.from(JSON.stringify(value)).toString('base64url');
export function token(extra: any={}){
 const data=encode({alg:'ES256',kid:jwk.kid,typ:'JWT'})+'.'+encode({...claims(),iss:config.url+'/auth/v1',iat:Math.floor(Date.now()/1000),...extra});
 return data+'.'+sign('sha256',Buffer.from(data),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
export const clientFactory=(url?: any,key?: any,options?: any)=>createClient(url,key,{...options,global:{...options.global,fetch:async (input?: any)=>{
 const target=String(input);if(target===config.url+'/auth/v1/.well-known/jwks.json')return Response.json({keys:[jwk]});
 return Response.json({message:'Invalid token'},{status:401});
}}});
