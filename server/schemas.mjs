import { z } from 'zod';

export const text = z.string().max(50000);
export const iso = z.string().datetime({ offset: true });
export const Item = z.object({
  externalId: z.string().min(1).max(300), title: z.string().min(1).max(500),
  content: text.default(''), summary: z.string().max(2000).default(''),
  url: z.string().url().refine(s=>{try{return ['https:','http:'].includes(new URL(s).protocol);}catch{return false;}}).optional(),
  kind: z.enum(['article','note','event','task','mail','suggestion']).default('note'),
  publishedAt: iso.optional(), start: iso.optional(), end: iso.optional(),
  allDay: z.boolean().optional(), startDate: z.string().optional(), endDate: z.string().optional(),
  tags: z.array(z.string().max(60)).max(30).default([]),
  evidenceIds: z.array(z.string()).max(100).default([]),
  truncated: z.boolean().default(false),
}).strict();
// Only ordinary workspace preferences; never connector, credential or security settings.
export const SettingsValues = z.object({
  sort:z.enum(['priority','unread','time']), reduceTransparency:z.boolean(),
}).strict();
export const SettingsUpdate = z.object({
  set:SettingsValues.partial().refine(value=>Object.keys(value).length>0,'至少修改一个设置'),
  expectedRevision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
// Locally authored content and personal annotations never change upstream records.
export const LOCAL_NOTE_SOURCE = 'local-notes';
export const LOCAL_NOTE_PREFIX = 'local_note_';
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cardId = z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i);
const localTags = z.array(z.string().trim().min(1).max(30)).max(20).refine(tags=>new Set(tags).size===tags.length,'标签去除首尾空格后不能重复');
const nonEmptyPatch = schema => schema.partial().refine(value=>Object.keys(value).length>0&&Object.values(value).every(v=>v!==undefined),'至少提交一个有效字段');
export const NoteValues = z.object({title:z.string().trim().min(1).max(500),content:text,tags:localTags}).strict();
export const NoteCreate = NoteValues.extend({content:text.default(''),tags:localTags.default([]),idempotencyKey:z.string().min(1).max(200)}).strict();
export const NotePatch = z.object({set:nonEmptyPatch(NoteValues),expectedRevision:revision}).strict();
export const NoteUpdate = NotePatch.extend({cardId}).strict();
export const AnnotationValues = z.object({note:z.string().max(4000),tags:localTags}).strict();
export const AnnotationRead = z.object({cardId}).strict();
export const AnnotationPatch = z.object({set:nonEmptyPatch(AnnotationValues),expectedRevision:revision}).strict();
export const AnnotationUpdate = AnnotationPatch.extend({cardId}).strict();
// Application-owned conversations are separate from any host/ChatGPT thread.
export const ConversationId = z.string().min(1).max(100).regex(/^conversation_[a-z0-9_-]+$/i);
export const RequestId = z.string().min(1).max(100).regex(/^request_[a-z0-9_-]+$/i);
const idempotencyKey = z.string().min(1).max(200);
const boundedOffset = z.number().int().min(0).max(1000000);
const uniqueCardIds = max => z.array(cardId).max(max).refine(ids=>new Set(ids).size===ids.length,'卡片引用不能重复');
export const ConversationCreate = z.object({title:z.string().trim().min(1).max(200).default('新对话'),idempotencyKey}).strict();
export const ConversationList = z.object({limit:z.number().int().min(1).max(100).default(20),offset:boundedOffset.default(0)}).strict();
export const ConversationRead = z.object({conversationId:ConversationId,limit:z.number().int().min(1).max(100).default(50),offset:boundedOffset.default(0)}).strict();
const requestFields = {question:z.string().min(1).max(4000).refine(value=>value.trim().length>0,'问题不能为空'),cardIds:uniqueCardIds(20)};
export const RequestCreate = z.object({...requestFields,conversationId:ConversationId,idempotencyKey}).strict();
// The old HTTP queue accepted only question/cardIds. Only HTTP allows this fallback;
// missing values are allocated atomically by the shared service.
export const RequestHttpCreate = z.object({...requestFields,conversationId:ConversationId.optional(),idempotencyKey:idempotencyKey.optional()}).strict();
export const RequestRead = z.object({requestId:RequestId}).strict();
export const AiRequest = RequestRead;
export const RequestList = z.object({conversationId:ConversationId.optional(),status:z.enum(['pending','answered','all']).default('pending'),limit:z.number().int().min(1).max(100).default(30),offset:boundedOffset.default(0)}).strict();
export const RequestAnswer = z.object({requestId:RequestId,answer:z.string().min(1).max(20000).refine(value=>value.trim().length>0,'回答不能为空'),evidenceIds:uniqueCardIds(50)}).strict();
export const Collect = z.object({
  connectorId: z.string(), query: z.string().max(500).optional(),
  timeMin: iso.optional(), timeMax: iso.optional(), cursor: z.union([z.string().max(4000),z.number().int().min(0)]).optional(),
  pageSize: z.number().int().min(1).max(50).default(20),
  maxPages: z.number().int().min(1).max(5).default(1),
  parameters: z.record(z.unknown()).default({}),
}).strict().refine(v=>!v.timeMin||!v.timeMax||Date.parse(v.timeMin)<Date.parse(v.timeMax), 'timeMax must be after timeMin');
export const Search = z.object({ query:z.string().max(500).default(''), sourceIds:z.array(z.string()).optional(), kind:Item.shape.kind.optional(), limit:z.number().int().min(1).max(100).default(20), offset:z.number().int().min(0).default(0) }).strict();
export const Recommend = z.object({ query:z.string().max(500).default(''), interests:z.array(z.string().max(100)).max(20).default([]), limit:z.number().int().min(1).max(50).default(10), includeRead:z.boolean().default(false) }).strict();
export const Draft = z.object({ connectorId:z.string(), action:z.string(), payload:z.record(z.unknown()), idempotencyKey:z.string().min(1).max(200) }).strict();
// Host imports are caller-attributed records, not a connector credential or a
// claim that this service has authenticated the upstream account. The explicit
// branch keeps older qg_ingest payloads and configured collection unchanged.
export const HOST_PROVIDERS = ['notion','google-calendar','linear'];
export const hostSourceId = provider => `host-${provider}`;
const notionUuid = value => /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(value)?value.replaceAll('-','').toLowerCase():null;
export const hostIdentity = provenance => [provenance.provider,provenance.scope.accountId,provenance.scope.workspaceId??null,provenance.scope.calendarId??null,provenance.provider==='notion'?(notionUuid(provenance.upstreamId)||provenance.upstreamId):provenance.upstreamId];
const stableUpstreamId = z.string().min(1).max(300).refine(value=>value===value.trim()&&!/[\u0000-\u001f\u007f]/.test(value),'需要无控制字符的稳定上游 ID');
const contentOrigin = z.enum(['upstream-original','model-summary']);
export const HostProvenance = z.object({
  provider:z.enum(HOST_PROVIDERS),upstreamId:stableUpstreamId,
  scope:z.object({accountId:stableUpstreamId,workspaceId:stableUpstreamId.optional(),calendarId:stableUpstreamId.optional()}).strict(),
  retrievedAt:iso.max(64),upstreamUpdatedAt:iso.max(64).optional(),partial:z.boolean(),
  contentOrigin,summaryOrigin:contentOrigin.optional(),
}).strict();
const directHostUrl = z.string().min(1).max(2048).url().refine(value=>{
  if(value!==value.trim()||/[\u0000-\u0020\u007f\\]/.test(value))return false;
  try{
    const url=new URL(value),credentialKey=/^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|authorization|auth|password|passwd|secret|client[_-]?secret|code|session(?:id)?|credentials?)$/i;
    return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&![...url.searchParams.keys()].some(key=>credentialKey.test(key));
  }catch{return false;}
},'来源链接必须是无凭据的安全 HTTPS 直达链接');
function providerResourceUrl(provider,value,upstreamId) {
  let url;try{url=new URL(value);}catch{return false;}
  const host=url.hostname,path=url.pathname;
  if(provider==='notion'){
    const allowed=['notion.so','www.notion.so'].includes(host)||/^[a-z0-9-]+\.notion\.site$/.test(host)||(host==='app.notion.com'&&/^\/p\/[^/]+\/?$/.test(path));
    const pageId=path.match(/(?:^|[-/])([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i)?.[1];
    return allowed&&!!pageId&&(!notionUuid(upstreamId)||notionUuid(pageId)===notionUuid(upstreamId));
  }
  if(provider==='linear')return host==='linear.app'&&/^\/(?:[^/]+\/)?issue\/[^/]+(?:\/[^/]+)*\/?$/.test(path);
  return ['calendar.google.com','www.google.com'].includes(host)&&(/^\/calendar(?:\/u\/\d+)?\/event$/.test(path)&&!!url.searchParams.get('eid')||/^\/calendar(?:\/u\/\d+)?\/r\/eventedit\/[^/]+\/?$/.test(path));
}
const hostDate = z.string().max(10).regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
},'需要真实有效的 YYYY-MM-DD 日期');
export const HostItem = Item.extend({
  content:text,url:directHostUrl,truncated:z.boolean(),
  publishedAt:iso.max(64).optional(),start:iso.max(64).optional(),end:iso.max(64).optional(),
  startDate:hostDate.optional(),endDate:hostDate.optional(),
  evidenceIds:z.array(cardId).max(100).default([]),
  provenance:HostProvenance,expectedRevision:revision,
}).strict().superRefine((item,ctx)=>{
  const provenance=item.provenance,scope=provenance.scope;
  const issue=(path,message)=>ctx.addIssue({code:'custom',path,message});
  if(item.externalId!==provenance.upstreamId)issue(['externalId'],'externalId 必须等于 provenance.upstreamId');
  if(provenance.provider==='google-calendar'){
    if(!scope.calendarId||Object.hasOwn(scope,'workspaceId'))issue(['provenance','scope'],'Google Calendar 需要 accountId 和 calendarId，不能使用 workspaceId');
    if(item.allDay===true){
      if(!item.startDate||!item.endDate||item.endDate<=item.startDate)issue(['endDate'],'全天日程需要有效 startDate 与不包含结束日的 endDate，且结束日晚于开始日');
      if(item.start!==undefined||item.end!==undefined)issue(['allDay'],'全天日程不能混用带时区的 start/end 时间');
    }else{
      if(!item.start||!item.end||!Number.isFinite(Date.parse(item.start))||!Number.isFinite(Date.parse(item.end))||Date.parse(item.end)<=Date.parse(item.start))issue(['end'],'定时日程需要有效 start/end 时间，且结束时间晚于开始时间');
      if(item.startDate!==undefined||item.endDate!==undefined)issue(['allDay'],'日期型日程必须使用 allDay:true，不能混用定时时间');
    }
  }else if(!scope.workspaceId||Object.hasOwn(scope,'calendarId'))issue(['provenance','scope'],'Notion / Linear 需要 accountId 和 workspaceId，不能使用 calendarId');
  if(!providerResourceUrl(provenance.provider,item.url,provenance.upstreamId))issue(['url'],'链接必须直达声明提供方的来源记录');
  if(item.summary.length>0&&!provenance.summaryOrigin)issue(['provenance','summaryOrigin'],'非空摘要必须标明原始来源或模型摘要');
  if(!item.summary.length&&Object.hasOwn(provenance,'summaryOrigin'))issue(['provenance','summaryOrigin'],'空摘要不能声明摘要来源');
  if(provenance.contentOrigin==='model-summary'&&(item.content!==''||!item.summary.trim()||provenance.summaryOrigin!=='model-summary'))issue(['provenance','contentOrigin'],'模型摘要必须仅存于 summary，content 留空且 summaryOrigin 为 model-summary');
  if(provenance.upstreamUpdatedAt&&Date.parse(provenance.upstreamUpdatedAt)>Date.parse(provenance.retrievedAt))issue(['provenance','upstreamUpdatedAt'],'上游更新时间不能晚于读取时间');
  if(provenance.provider==='google-calendar'&&item.kind!=='event')issue(['kind'],'Google Calendar 来源记录必须为 event');
  if(provenance.provider==='notion'&&item.kind!=='note')issue(['kind'],'Notion 来源记录必须为 note');
  if(provenance.provider==='linear'&&item.kind!=='task')issue(['kind'],'Linear 来源记录必须为 task');
});
export const Ingest = z.object({
  mode:z.literal('host-assisted').optional(),sourceId:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  items:z.array(z.union([HostItem,Item])).min(1).max(50),
}).strict().superRefine((input,ctx)=>{
  const identities=new Set();
  for(const [index,item] of input.items.entries()){
    if(input.mode==='host-assisted'){
      if(!item.provenance)ctx.addIssue({code:'custom',path:['items',index,'provenance'],message:'宿主导入必须提供完整来源信息'});
      else if(input.sourceId!==hostSourceId(item.provenance.provider))ctx.addIssue({code:'custom',path:['sourceId'],message:'宿主导入来源必须为 host- 加声明的 provider'});
      if(item.provenance){const identity=JSON.stringify(hostIdentity(item.provenance));if(identities.has(identity))ctx.addIssue({code:'custom',path:['items',index],message:'同一批次不能重复导入同一上游记录'});identities.add(identity);}
    }else if(item.provenance||Object.hasOwn(item,'expectedRevision'))ctx.addIssue({code:'custom',path:['items',index],message:'宿主来源信息仅可用于显式 host-assisted 模式'});
  }
});
export const operations = { collect:Collect, search:Search, recommend:Recommend, draft:Draft, ingest:Ingest };
export const Workflow = z.object({
  goal:z.string().min(1).max(2000),
  steps:z.array(z.object({ id:z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/), operation:z.enum(['collect','search','recommend','draft','ingest']), dependsOn:z.array(z.string()).default([]), input:z.record(z.unknown()) }).strict()).min(1).max(20),
}).strict();

export class QGError extends Error {
  constructor(code, message, detail={}) { super(message); this.code=code; this.detail=detail; }
}
export function publicError(error) {
  if(error instanceof QGError) return { code:error.code, message:error.message, ...error.detail };
  if(error instanceof z.ZodError) return { code:'INVALID_INPUT', message:'参数不符合工具定义', issues:error.issues.map(i=>({path:i.path,message:i.message})) };
  return { code:'INTERNAL_ERROR', message:'操作未完成；检查配置或本地服务状态后重试。' };
}
