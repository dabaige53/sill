import {build} from 'esbuild';
// Build only: no deployment, credentials or environment values.
await build({entryPoints:['server/cloud/worker.mjs'],bundle:true,minify:process.argv.includes('--minify'),format:'esm',platform:'browser',target:'es2022',external:['node:*'],loader:{'.html':'text'},outfile:'dist/cloud/worker.mjs',logLevel:'info'});
