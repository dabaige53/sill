import { z } from 'zod';

export const text = z.string().max(50000);
export const iso = z.string().datetime({ offset: true });
export const Item = z.object({
  externalId: z.string().min(1).max(300), title: z.string().min(1).max(500),
  content: text.default(''), summary: z.string().max(2000).default(''),
  url: z.string().url().refine(s=>['https:','http:'].includes(new URL(s).protocol)).optional(),
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
export const Ingest = z.object({ sourceId:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), items:z.array(Item).min(1).max(50) }).strict();
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
