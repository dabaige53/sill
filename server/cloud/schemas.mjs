import {z} from 'zod';
export const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const revision=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const state=z.object({read:z.boolean().optional(),done:z.boolean().optional(),archived:z.boolean().optional()}).strict();
const changes=z.object({title:z.string().min(1).max(1000).optional(),type:z.enum(['article','mail','note','task','event','reminder','media','insight','digest','suggestion','photo','file']).optional(),body:z.array(z.string().max(50000)).max(100).optional(),url:z.string().url().refine(s=>/^https?:\/\//.test(s)).optional(),state:state.optional()}).strict();
export const create=changes.required({title:true,type:true});
export const update=z.object({expectedRevision:revision,changes:changes.optional(),metadata:z.object({event_id:id,outcome:z.enum(['succeeded','failed','unknown']),summary:z.string().max(2000)}).strict().optional()}).strict();
export const event=z.object({event_id:id,card_id:id,card_version:revision,action:z.enum(['summarize','complete']),destination_ref:id}).strict();
