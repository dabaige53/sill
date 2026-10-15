import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ROOT } from './config.mjs';
import { QGError, SettingsValues, publicError } from './schemas.mjs';

export const WORKSPACE_URI = 'ui://sill/workspace';
export const WORKSPACE_MIME_TYPE = 'text/html;profile=mcp-app';
export const WORKSPACE_META_KEY = 'sill/workspace';
export const INITIAL_CARD_LIMIT = 20;
const DEFAULT_APP_PATH = resolve(ROOT, 'dist/host-app.html');
const EMPTY_ARGUMENTS = z.object({}).strict();
const result = value => ({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});

// Static policy is visible both at discovery and resource read. The app talks to
// its host over the MCP bridge, never directly to providers or a loopback API.
const resourceMetadata = () => ({ui:{
  csp:{connectDomains:[],resourceDomains:[],frameDomains:[],baseUriDomains:[]},
  permissions:{},
  prefersBorder:false,
}});

async function readBundledApp(appPath) {
  try {
    const html = await readFile(appPath,'utf8');
    if(!/<!doctype html[\s>]/i.test(html)||!/<html[\s>]/i.test(html))throw new Error('Invalid bundle');
    return html;
  } catch {
    // Do not reveal local paths, render private data into HTML, fetch a remote
    // replacement, or silently substitute the standalone authenticated web UI.
    throw new QGError('HOST_APP_UNAVAILABLE','Sill host UI is unavailable. Build the local host-app bundle with npm run build:host, then retry.');
  }
}

const clipped = (value,max) => typeof value==='string'?value.slice(0,max):'';
const strings = (value,count,length) => Array.isArray(value)?value.slice(0,count).filter(v=>typeof v==='string').map(v=>v.slice(0,length)):[];
const safeUrl = value => {
  if(typeof value!=='string'||value.length>2048)return undefined;
  try {
    const url=new URL(value);
    return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;
  } catch {return undefined;}
};

function initialCard(card) {
  // Deliberate allowlist: never spread source records, annotation text, connector
  // configuration, credentials, arbitrary metadata, or idempotency keys.
  const snapshot={
    id:clipped(card.id,100),title:clipped(card.title,500),
    kind:clipped(card.kind,32),sourceId:clipped(card.sourceId,64),
    summary:clipped(card.summary,500),content:clipped(card.content,1200),
    contentTruncated:!!card.contentTruncated||(card.content?.length||0)>1200,
    summaryTruncated:(card.summary?.length||0)>500,
    truncated:!!card.truncated,local:card.local===true,
    tags:strings(card.tags,30,60),evidenceIds:strings(card.evidenceIds,100,100),
    state:{read:card.state?.read===true,bookmarked:card.state?.bookmarked===true,
      dismissed:card.state?.dismissed===true,snoozedUntil:card.state?.snoozedUntil?clipped(card.state.snoozedUntil,50):null},
  };
  if(card.provenance?.mode==='host-assisted'){
    const p=card.provenance;
    snapshot.provenance={mode:'host-assisted',attribution:'host-asserted',provider:clipped(p.provider,32),upstreamId:clipped(p.upstreamId,300),scope:Object.fromEntries(['accountId','workspaceId','calendarId'].filter(key=>typeof p.scope?.[key]==='string').map(key=>[key,clipped(p.scope[key],300)])),retrievedAt:clipped(p.retrievedAt,50),partial:p.partial===true,contentOrigin:clipped(p.contentOrigin,32),...(p.summaryOrigin?{summaryOrigin:clipped(p.summaryOrigin,32)}:{}),...(p.upstreamUpdatedAt?{upstreamUpdatedAt:clipped(p.upstreamUpdatedAt,50)}:{})};
  }
  if(Number.isSafeInteger(card.revision)&&card.revision>=0)snapshot.revision=card.revision;
  const url=safeUrl(card.url);if(url)snapshot.url=url;
  for(const key of ['publishedAt','collectedAt','firstCollectedAt','createdAt','updatedAt','start','end','startDate','endDate']) {
    if(typeof card[key]==='string')snapshot[key]=clipped(card[key],50);
  }
  if(typeof card.allDay==='boolean')snapshot.allDay=card.allDay;
  return snapshot;
}

function initialWorkspace(service) {
  const current=service.readSettings();
  const settings={values:SettingsValues.parse({sort:current.values.sort,reduceTransparency:current.values.reduceTransparency,...(current.values.recommendation?{recommendation:current.values.recommendation}:{})}),
    revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(current.revision)};
  const recommended=service.recommend({limit:INITIAL_CARD_LIMIT,includeRead:true});
  const items=recommended.items.slice(0,INITIAL_CARD_LIMIT).map(item=>{
    const card=initialCard(item.card);
    return {card,score:Number.isFinite(item.score)?item.score:0,reasons:strings(item.reasons,8,200),
      evidence:{cardId:card.id,sourceId:card.sourceId,...(card.url?{url:card.url}:{})}};
  });
  return {version:1,settings,recommendations:{items,method:clipped(recommended.method,500),generatedAt:clipped(recommended.generatedAt,50)}};
}

// Keep this registration SDK-v1 compatible. The OpenAI extension SDK's server helpers
// target SDK v2; these metadata fields are the published wire contract instead.
export function registerHostApp(server,service,{hostAppPath=DEFAULT_APP_PATH}={}) {
  server.registerTool('qg_open_workspace',{
    title:'Sill',
    description:'Open the Sill content workspace in the host. Reads ordinary settings and up to 20 recommended card excerpts. Does not collect sources, write content, change settings, or expose credentials. Hosts without MCP Apps can use the existing Sill tools.',
    inputSchema:EMPTY_ARGUMENTS,
    annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true},
    _meta:{ui:{resourceUri:WORKSPACE_URI,visibility:['model','app']},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}},
  },async args=>{
    try {
      EMPTY_ARGUMENTS.parse(args);
      await readBundledApp(hostAppPath);
      const workspace=initialWorkspace(service);
      const summary={mode:'host',resourceUri:WORKSPACE_URI,cardCount:workspace.recommendations.items.length,version:1};
      // Only this bounded snapshot reaches the app. The model-facing fields
      // contain no private card titles, source text, or personal annotations.
      return {...result(summary),_meta:{[WORKSPACE_META_KEY]:workspace}};
    } catch(error) {return {...result(publicError(error)),isError:true};}
  });
  server.registerResource('sill-workspace',WORKSPACE_URI,{
    title:'Sill workspace',description:'Bundled Sill MCP App; no external network access.',
    mimeType:WORKSPACE_MIME_TYPE,_meta:resourceMetadata(),
  },async uri=>{
    try {
      return {contents:[{uri:uri.href,mimeType:WORKSPACE_MIME_TYPE,text:await readBundledApp(hostAppPath),_meta:resourceMetadata()}]};
    } catch(error) {
      const failure=publicError(error);
      throw new McpError(ErrorCode.InternalError,`${failure.code}: ${failure.message}`);
    }
  });
}
