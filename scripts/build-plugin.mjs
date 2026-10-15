import {mkdir,readFile,writeFile,cp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8'));
const release=JSON.parse(await readFile(resolve(root,'deploy/sill/release.json'),'utf8'));
const binding=JSON.parse(await readFile(resolve(root,'.app.json'),'utf8'));
const appId='asdk_app_6ad03f09b6048191a8826a236ac9097d';
if(release.plugin_id!=='plugin_'+appId||release.app_id!==appId||manifest.name!=='dev-6ad03f09b6048191a8826a236ac9097d'||manifest.version!==release.candidate_version||Object.values(binding.apps).length!==1||Object.values(binding.apps)[0].id!==appId)throw new Error('Sill identity mismatch: refusing to build a second plugin');
const directory=resolve(root,'dist/plugin/sill');
await rm(directory,{recursive:true,force:true});
await mkdir(resolve(directory,'.codex-plugin'),{recursive:true});
for(const file of ['plugin.json','.app.json'])await cp(resolve(root,file),resolve(directory,file));
await cp(resolve(root,'skills/sill'),resolve(directory,'skills/sill'),{recursive:true});
const extension=manifest.extensions['com.openai'];
await writeFile(resolve(directory,'.codex-plugin/plugin.json'),JSON.stringify({name:manifest.name,version:manifest.version,description:manifest.description,author:manifest.author,skills:'./skills/',apps:extension.apps,interface:extension.interface},null,2)+'\n');
console.log(`Unpublished Sill candidate: ${directory}. Existing App identity preserved; no installation or publication performed.`);
