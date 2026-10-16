/** Read-only, credential-free loopback probe. Does not start or modify a service. */
const args=process.argv.slice(2);
const v1=args.includes('--v1');
const positional=args.filter((x?: any)=>x!=='--v1');
if(positional.length>1||args.filter((x?: any)=>x==='--v1').length>1)throw new Error('Usage: node scripts/smoke-health.ts [http://127.0.0.1:4318] [--v1]');
const origin=new URL(positional[0]||'http://127.0.0.1:4318');
if(origin.protocol!=='http:'||!['127.0.0.1','[::1]'].includes(origin.hostname)||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw new Error('Only literal loopback HTTP origins without credentials/path are allowed');
try{
  const response=await fetch(new URL(v1?'/api/v1/health':'/health',origin),{redirect:'error',signal:AbortSignal.timeout(3000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const value=await response.json();
  if(v1){
    if(value.status!=='ready'||value.contract!=='sill-v1-draft1')throw new Error('V1 contract not reported ready');
    console.log('V1 health responds; CRUD, permissions, Webhook and native clients NOT verified.');
  }else{
    if(value.ok!==true||value.mode!=='local')throw new Error('Not the current Sill local health response');
    console.log('Current local health responds. V1 APIs are NOT verified or implied implemented.');
  }
}catch(error){console.error('NOT VERIFIED: '+error.message);process.exitCode=1;}

export {};
