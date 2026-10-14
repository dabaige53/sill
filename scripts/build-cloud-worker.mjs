import {build} from 'esbuild';
// Offline bundle verification only. Never publishes a Worker or supplies environment values.
await build({entryPoints:['server/cloud/worker.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:*'],loader:{'.html':'text'},outfile:'dist/cloud/worker.mjs',logLevel:'info'});
