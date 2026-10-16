import {build} from 'esbuild';
import './build-cloud-app.ts';
// Build only: no deployment, credentials or environment values.
await build({entryPoints:['server/cloud/worker.ts'],bundle:true,minify:process.argv.includes('--minify'),format:'esm',platform:'browser',target:'es2022',external:['node:*'],loader:{'.html':'text','.png':'binary','.svg':'text'},outfile:'dist/cloud/worker.mjs',logLevel:'info'});
