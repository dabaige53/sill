import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { Item, QGError } from './schemas.mjs';

const MAX_RESPONSE = 4 * 1024 * 1024;
const TIMEOUT = 20000;
const richText = parts => (parts || []).map(p=>p.plain_text ?? p.text?.content ?? '').join('');
const safeUrl = value => { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol)?u.href:undefined; } catch { return undefined; } };
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
export function at(object, path='') {
  if (!path || path==='$') return object;
  return path.replace(/^\$\./,'').split('.').reduce((v,k)=>v!=null && Object.hasOwn(v,k) && !['__proto__','constructor','prototype'].includes(k) ? v[k] : undefined,object);
}
async function readJson(response) {
  const reader=response.body?.getReader();
  if(!reader) throw new QGError('UPSTREAM_FORMAT','数据源返回空响应');
  let size=0; const chunks=[];
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE)throw new QGError('RESPONSE_TOO_LARGE','数据源响应超过 4 MB，请缩小采集范围');chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch(e) { if(e instanceof QGError)throw e;throw new QGError('UPSTREAM_FORMAT','数据源未返回有效 JSON'); }
  finally { await reader.cancel().catch(()=>{}); }
}

export class Connectors {
  constructor(config, { env=process.env, fetchImpl=fetch }={}) { this.config=config;this.env=env;this.fetch=fetchImpl;this.clients=new Map();this.googleTokens=new Map(); }
  get(id) {
    const c=this.config.connectors.find(c=>c.id===id&&c.enabled);
    if(!c)throw new QGError('CONNECTOR_NOT_FOUND','连接器未配置或已停用');
    return c;
  }
  status() {
    return this.config.connectors.map(c=>({id:c.id,label:c.label,type:c.type,enabled:c.enabled,credentialConfigured:c.type==='google-calendar'&&c.refreshTokenEnv ? !!(this.env[c.refreshTokenEnv]&&this.env[c.clientIdEnv]&&this.env[c.clientSecretEnv]) : !c.tokenEnv||!!this.env[c.tokenEnv],authorizationVerified:false,allowWrites:c.allowWrites,collectionConfigured:c.type!=='mcp'||!!c.collect}));
  }
  async token(c) {
    if(c.type==='google-calendar'&&c.refreshTokenEnv) {
      const cached=this.googleTokens.get(c.id);
      if(cached?.expires>Date.now()+60000)return cached.token;
      const refresh=this.env[c.refreshTokenEnv],clientId=this.env[c.clientIdEnv],clientSecret=this.env[c.clientSecretEnv];
      if(!refresh||!clientId||!clientSecret)throw new QGError('AUTH_REQUIRED','请在服务进程环境中配置 Google OAuth 刷新凭据');
      let response;
      try {response=await this.fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh,client_id:clientId,client_secret:clientSecret}),signal:AbortSignal.timeout(TIMEOUT),redirect:'error'});}
      catch {throw new QGError('AUTH_REFRESH_FAILED','Google 授权刷新未完成，请检查授权配置');}
      if(!response.ok)throw new QGError('AUTH_REQUIRED','Google 授权已失效，请重新授权');
      const data=await readJson(response);
      if(typeof data.access_token!=='string')throw new QGError('AUTH_REQUIRED','Google 未返回有效访问凭据');
      this.googleTokens.set(c.id,{token:data.access_token,expires:Date.now()+Math.min(Number(data.expires_in)||3600,3600)*1000});
      return data.access_token;
    }
    const token=c.tokenEnv?this.env[c.tokenEnv]:undefined;
    if(c.tokenEnv&&!token)throw new QGError('AUTH_REQUIRED',`请在服务进程环境中配置 ${c.tokenEnv}；不要在对话中粘贴凭据`);
    return token;
  }
  async request(c, url, {method='GET',body,readOnly=method==='GET'}={}) {
    const token=await this.token(c);
    for(let attempt=0;attempt<3;attempt++) {
      let response;
      try { response=await this.fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(c.type==='notion'?{'Notion-Version':c.version}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(TIMEOUT),redirect:'error'}); }
      catch {throw new QGError(readOnly?'UPSTREAM_UNAVAILABLE':'WRITE_UNCERTAIN',readOnly?'数据源连接超时或不可用':'写入结果未知；请先核对外部服务，禁止自动重试');}
      if(readOnly&&[429,502,503,504].includes(response.status)&&attempt<2){const delay=Math.min(1000,Math.max(100,Number(response.headers.get('retry-after')||0)*1000));await response.body?.cancel();await new Promise(r=>setTimeout(r,delay));continue;}
      if(!response.ok){
        await response.body?.cancel();
        if([401,403].includes(response.status))throw new QGError('AUTH_REQUIRED','数据源授权不足或已过期，请检查授权和共享范围');
        if(response.status===429)throw new QGError('RATE_LIMITED','数据源限流，请稍后重试');
        if(!readOnly&&response.status>=500)throw new QGError('WRITE_UNCERTAIN','写入结果未知；请核对外部服务后再操作');
        throw new QGError('UPSTREAM_REJECTED',`数据源拒绝请求（HTTP ${response.status}）`,{status:response.status});
      }
      try{return await readJson(response);}catch(e){if(!readOnly)throw new QGError('WRITE_UNCERTAIN','写入可能已完成，但响应无法读取；请核对外部服务');throw e;}
    }
  }
  async mcp(c) {
    // Cache the connection promise too, so simultaneous readers cannot race initialization.
    if(!this.clients.has(c.id))this.clients.set(c.id,(async()=>{
      const token=await this.token(c);
      const client=new Client({name:'sill-collector',version:'0.2.0'});
      const transport=new StreamableHTTPClientTransport(new URL(c.url),{requestInit:{headers:token?{Authorization:`Bearer ${token}`}:{},redirect:'error'},fetch:(url,init)=>this.fetch(url,{...init,redirect:'error',signal:AbortSignal.any([...(init?.signal?[init.signal]:[]),AbortSignal.timeout(TIMEOUT)])})});
      try {await client.connect(transport,{timeout:TIMEOUT});return client;}
      catch {await client.close().catch(()=>{});this.clients.delete(c.id);throw new QGError('MCP_CONNECTION_FAILED','MCP 服务连接失败；检查地址与授权');}
    })());
    return this.clients.get(c.id);
  }
  async tools(id) {
    const c=this.get(id);
    if(c.type!=='mcp')return {tools:c.type==='google-calendar'?['collect','create_event']:['collect','create_page']};
    const client=await this.mcp(c);let cursor;const result=[];
    for(let page=0;page<10;page++) {
      let response;
      try{response=await client.listTools(cursor?{cursor}:{},{timeout:TIMEOUT});}catch{throw new QGError('MCP_DISCOVERY_FAILED','无法获取 MCP 工具列表');}
      result.push(...response.tools.filter(t=>c.readTools.includes(t.name)||(c.allowWrites&&c.writeTools.includes(t.name))).map(t=>({name:t.name,description:t.description,inputSchema:t.inputSchema,annotations:t.annotations,access:c.readTools.includes(t.name)?'read':'write'})));
      cursor=response.nextCursor;if(!cursor)return {tools:result};
    }
    return {tools:result,truncated:true,nextCursor:cursor};
  }
  async call(c,name,args,readOnly) {
    const allowed=readOnly?c.readTools:(c.allowWrites?c.writeTools:[]);
    if(!allowed.includes(name))throw new QGError('TOOL_NOT_ALLOWED','工具不在配置的允许列表中');
    const inventory=await this.tools(c.id);
    const tool=inventory.tools.find(t=>t.name===name);
    if(!tool)throw new QGError('TOOL_NOT_FOUND','MCP 服务没有提供配置中的工具');
    if(readOnly&&(tool.annotations?.readOnlyHint===false||tool.annotations?.destructiveHint===true))throw new QGError('UNSAFE_READ_TOOL','远程工具声明有写入副作用，不能用于采集');
    let result;
    try{result=await (await this.mcp(c)).callTool({name,arguments:args},undefined,{timeout:TIMEOUT});}
    catch{throw new QGError(readOnly?'MCP_CALL_FAILED':'WRITE_UNCERTAIN',readOnly?'MCP 工具调用失败':'远程写入结果未知；先核对外部服务，禁止自动重试');}
    if(result.isError)throw new QGError(readOnly?'MCP_TOOL_ERROR':'WRITE_UNCERTAIN',readOnly?'MCP 工具报告失败':'远程工具报告写入失败；核对外部服务后再操作');
    const encoded=JSON.stringify(result);
    if(encoded.length>MAX_RESPONSE)throw new QGError(readOnly?'RESPONSE_TOO_LARGE':'WRITE_UNCERTAIN','MCP 响应过大，请缩小查询范围或核对写入结果');
    return result;
  }
  async collect(input) {
    const c=this.get(input.connectorId);const items=[];let cursor=input.cursor;const seen=new Set();
    for(let page=0;page<input.maxPages;page++) {
      let result;
      if(c.type==='google-calendar')result=await this.calendar(c,{...input,cursor});
      else if(c.type==='notion')result=await this.notion(c,{...input,cursor});
      else result=await this.collectMcp(c,{...input,cursor});
      items.push(...result.items);cursor=result.nextCursor;
      if(cursor===undefined||cursor===null||cursor==='')break;
      if(seen.has(cursor))throw new QGError('PAGINATION_LOOP','数据源重复返回相同游标，已停止采集');
      seen.add(cursor);
    }
    return {items,nextCursor:cursor??null,partial:cursor!==undefined&&cursor!==null&&cursor!==''};
  }
  async calendar(c,input) {
    const url=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendarId)}/events`);
    const params={singleEvents:'true',orderBy:'startTime',showDeleted:'false',maxResults:String(input.pageSize),timeMin:input.timeMin||new Date().toISOString(),timeMax:input.timeMax,pageToken:input.cursor,q:input.query};
    for(const [k,v] of Object.entries(params))if(v)url.searchParams.set(k,v);
    const data=await this.request(c,url);
    const items=(data.items||[]).filter(e=>e.status!=='cancelled').map(e=>Item.parse({externalId:e.id,title:(e.summary||'未命名日程').slice(0,500),content:(e.description||'').slice(0,50000),summary:(e.location||'').slice(0,2000),kind:'event',url:safeUrl(e.htmlLink),publishedAt:date(e.updated||e.created),start:date(e.start?.dateTime),end:date(e.end?.dateTime),allDay:!!e.start?.date,startDate:e.start?.date,endDate:e.end?.date,truncated:(e.description||'').length>50000}));
    return {items,nextCursor:data.nextPageToken};
  }
  async notionBody(c,id) {
    const lines=[];let count=0,truncated=false;
    const visit=async(blockId,depth)=>{
      let cursor;
      do {
        const url=new URL(`https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children`);
        url.searchParams.set('page_size','100');if(cursor)url.searchParams.set('start_cursor',cursor);
        const data=await this.request(c,url);
        for(const block of data.results||[]) {
          if(++count>200){truncated=true;return;}
          const inner=block[block.type]||{};
          const line=richText(inner.rich_text || inner.caption);
          if(line)lines.push(line);
          if(block.has_children){if(depth<3)await visit(block.id,depth+1);else truncated=true;}
          if(count>200)return;
        }
        cursor=data.has_more?data.next_cursor:null;
      } while(cursor);
    };
    await visit(id,0);const content=lines.join('\n');
    return {content:content.slice(0,50000),truncated:truncated||content.length>50000};
  }
  async notion(c,input) {
    const data=await this.request(c,'https://api.notion.com/v1/search',{method:'POST',readOnly:true,body:{query:input.query||undefined,filter:{property:'object',value:'page'},page_size:input.pageSize,start_cursor:input.cursor,sort:{direction:'descending',timestamp:'last_edited_time'}}});
    const items=[];
    for(const page of data.results||[]) {
      const title=richText(Object.values(page.properties||{}).find(p=>p.type==='title')?.title)||'未命名笔记';
      const body=await this.notionBody(c,page.id);
      items.push(Item.parse({externalId:page.id,title:title.slice(0,500),...body,summary:body.content.slice(0,300),url:safeUrl(page.url),kind:'note',publishedAt:date(page.last_edited_time)}));
    }
    return {items,nextCursor:data.has_more?data.next_cursor:null};
  }
  async collectMcp(c,input) {
    if(!c.collect)throw new QGError('COLLECTION_NOT_CONFIGURED','请配置 MCP 采集工具、字段映射和分页参数');
    const mapping=c.collect;
    const args={...mapping.arguments,...input.parameters};
    if(input.cursor!==undefined&&mapping.cursorArgument)args[mapping.cursorArgument]=input.cursor;
    const result=await this.call(c,mapping.tool,args,true);
    let data=result.structuredContent;
    if(!data) {
      try{data=JSON.parse(result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'));}
      catch{throw new QGError('MAPPING_REQUIRED','采集工具需要结构化 JSON；请配置返回字段映射');}
    }
    const rows=at(data,mapping.itemsPath);
    if(!Array.isArray(rows))throw new QGError('MAPPING_REQUIRED','itemsPath 没有指向数组，请修正字段映射');
    if(rows.length>250)throw new QGError('RESPONSE_TOO_LARGE','单次 MCP 采集最多 250 条，请配置上游分页');
    const items=rows.map(row=>{
      const v=Object.fromEntries(Object.entries(mapping.fields).map(([key,path])=>[key,at(row,path)]));
      if(v.id===undefined||typeof v.title!=='string')throw new QGError('MAPPING_REQUIRED','每条内容必须映射稳定 id 和字符串 title');
      const content=typeof v.content==='string'?v.content:'';
      return Item.parse({externalId:String(v.id),title:v.title.slice(0,500),content:content.slice(0,50000),summary:typeof v.summary==='string'?v.summary.slice(0,2000):content.slice(0,300),url:safeUrl(v.url),kind:v.kind||'note',publishedAt:date(v.publishedAt),start:date(v.start),end:date(v.end),tags:Array.isArray(v.tags)?v.tags:[],truncated:content.length>50000});
    });
    const cursor=mapping.cursorPath?at(data,mapping.cursorPath):null;
    if(cursor!==undefined&&cursor!==null&&cursor!==''&&!mapping.cursorArgument)throw new QGError('MAPPING_REQUIRED','数据源还有下一页，但未配置 cursorArgument');
    if(cursor!==undefined&&cursor!==null&&typeof cursor!=='string'&&!(typeof cursor==='number'&&Number.isSafeInteger(cursor)&&cursor>=0))throw new QGError('MAPPING_REQUIRED','分页游标必须是字符串或非负整数');
    return {items,nextCursor:cursor??null};
  }
  validateWrite(id,action,payload) {
    const c=this.get(id);
    if(!c.allowWrites)throw new QGError('WRITE_DISABLED','该连接器未启用写入');
    if(c.type==='google-calendar'&&action==='create_event') {
      const moment=z.object({dateTime:z.string().datetime({offset:true}),timeZone:z.string().optional()}).strict();
      const value=z.object({summary:z.string().min(1).max(500),description:z.string().max(8000).optional(),location:z.string().max(500).optional(),start:moment,end:moment}).strict().parse(payload);
      if(Date.parse(value.end.dateTime)<=Date.parse(value.start.dateTime))throw new QGError('INVALID_EVENT','结束时间必须晚于开始时间');
      return value;
    }
    if(c.type==='notion'&&action==='create_page')return z.object({parentPageId:z.string().uuid().default(c.parentPageId||''),title:z.string().min(1).max(200),content:z.string().max(20000)}).strict().parse(payload);
    if(c.type==='mcp'&&c.writeTools.includes(action)) {
      if(JSON.stringify(payload).length>64000)throw new QGError('PAYLOAD_TOO_LARGE','写入参数超过限制');
      return payload;
    }
    throw new QGError('ACTION_NOT_ALLOWED','该连接器不支持此写入动作');
  }
  async write(id,action,payload,actionId) {
    const c=this.get(id),value=this.validateWrite(id,action,payload);
    if(c.type==='google-calendar') {
      const response=await this.request(c,`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendarId)}/events?sendUpdates=none`,{method:'POST',body:{...value,id:actionId.replace(/[^a-f0-9]/g,'')}});
      return {id:response.id,url:safeUrl(response.htmlLink)};
    }
    if(c.type==='notion') {
      const chunks=value.content.match(/[\s\S]{1,1800}/g)||[''];
      const response=await this.request(c,'https://api.notion.com/v1/pages',{method:'POST',body:{parent:{type:'page_id',page_id:value.parentPageId},properties:{title:{type:'title',title:[{type:'text',text:{content:value.title}}]}},children:chunks.map(content=>({object:'block',type:'paragraph',paragraph:{rich_text:[{type:'text',text:{content}}]}}))}});
      return {id:response.id,url:safeUrl(response.url)};
    }
    const result=await this.call(c,action,value,false);
    return {remoteResult:result};
  }
  async close(){await Promise.allSettled([...this.clients.values()].map(async promise=>(await promise).close()));this.clients.clear();}
}
