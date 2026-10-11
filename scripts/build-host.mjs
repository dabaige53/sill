import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {ROOT} from '../server/config.mjs';
import {resolve} from 'node:path';
const bundle=await build({entryPoints:[resolve(ROOT,'web/host.js')],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'inline'});
let html=await readFile(resolve(ROOT,'index.html'),'utf8');
const prelude=`window.__QG_RUNTIME__=true;window.__QG_HOST__=true;
// srcdoc has an inherited base URL; keep hash navigation on its own document.
if(location.protocol==='about:'){for(const method of ['pushState','replaceState']){const original=history[method].bind(history);history[method]=(state,title,url)=>original(state,title,typeof url==='string'&&url.startsWith('#')?location.href.split('#')[0]+url:url);}}
`;
html=html.replace('<script>window.__PAGE__=',()=>'<script>'+prelude+'window.__PAGE__=');
const liveBootstrap="if(window.__QG_RUNTIME__){const script=document.createElement('script');script.src='/web/live.js';document.body.appendChild(script);}";
if(!html.includes(liveBootstrap)||!html.includes('window.__QG_HOST__=true'))throw new Error('Shared page runtime changed; update the host bundler before publishing');
html=html.replace(liveBootstrap,'');
html=html.replace('</body>',()=>`<script>${bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script></body>`);
await mkdir(resolve(ROOT,'dist'),{recursive:true});await writeFile(resolve(ROOT,'dist/host-app.html'),html);
console.log('Built credential-free MCP App resource: dist/host-app.html');
