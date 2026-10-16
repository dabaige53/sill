import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const bundle=await build({stdin:{contents:"import {startCloudBridge} from './apps/web/cloud-bridge.ts';startCloudBridge();",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true});
let html=await readFile('dist/cloud/index.html','utf8');
const prelude=`if(location.protocol==='about:'){for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(state,title,url)=>original(state,title,typeof url==='string'&&url.startsWith('#')?location.href.split('#')[0]+url:url);}}`;
html=html.replace('<script>',()=>'<script>'+prelude+bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')+'</script><script>');
html=html.replace('所有内容均在本地运行，不需要联网。','请在 Codex 中连接 Sill 云端账号。');
await writeFile('dist/cloud/app.html',html);
console.log('Built Sill cloud MCP App');
