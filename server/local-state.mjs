import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).refine(value=>!['__proto__','constructor','prototype'].includes(value));
const time=z.number().finite().min(0).max(8.64e15);
const strings=z.array(z.string().max(100)).max(100);
export const Card=z.object({
  id,type:z.enum(['article','mail','note','task','event','reminder','media','insight','digest','suggestion']),
  title:z.string().min(1).max(1000),summary:z.string().max(10000).default(''),
  source:z.string().max(300).default('本地'),meta:z.string().max(300).optional(),
  form:z.enum(['standard','image','quote','compact','data']).default('standard'),
  image:z.enum(['architecture','coast','mountain','botanical']).optional(),
  tags:strings.default([]),body:z.array(z.string().max(50000)).max(100).default([]),
  url:z.string().url().refine(value=>['http:','https:'].includes(new URL(value).protocol)).optional(),
  attachment:z.string().max(300).optional(),
  tasks:z.array(z.object({id,text:z.string().min(1).max(2000),done:z.boolean().default(false)}).strict()).max(100).optional(),
  start:time.optional(),end:time.optional(),due:time.optional(),time:time.default(()=>Date.now()),
  people:strings.optional(),related:z.array(id).max(100).optional(),priority:z.number().min(0).max(10).optional()
}).strict().superRefine((card,ctx)=>{
  if(card.type==='event'&&(!(card.start>0)||!(card.end>card.start)))ctx.addIssue({code:'custom',message:'日程需要有效的 start / end'});
  if(card.type==='task'&&(!card.tasks?.length||new Set(card.tasks.map(task=>task.id)).size!==card.tasks.length))ctx.addIssue({code:'custom',message:'待办需要不重复的任务 ID'});
  if(card.type==='media'&&(!card.image||card.body.length!==4))ctx.addIssue({code:'custom',message:'媒体卡片需要 image 和 4 个片段'});
});
export const Item=z.object({
  seen:z.boolean().optional(),read:z.boolean().optional(),bookmarked:z.boolean().optional(),later:z.boolean().optional(),
  tagsEdited:z.boolean().optional(),progress:z.number().min(0).max(1).optional(),note:z.string().max(4000).optional(),
  tags:z.array(z.string().max(30)).max(20).optional(),taskDone:z.array(id).max(100).optional(),
  addedAt:time.optional(),snoozedUntil:time.optional(),dismissed:z.boolean().optional(),reminderDone:z.boolean().optional(),
  lastReminderKey:z.string().max(200).optional(),lastNotifiedAt:time.optional()
}).strict();
const Preferences=z.object({sort:z.enum(['priority','unread','time']).optional(),reduceTransparency:z.boolean().optional()}).strict();
const State=z.object({cards:z.array(Card).max(5000),items:z.record(id,Item),seconds:z.number().min(0).max(1e7),preferences:Preferences}).strict();
const Operation=z.discriminatedUnion('op',[
  z.object({op:z.literal('card.upsert'),card:Card}).strict(),
  z.object({op:z.literal('card.delete'),id}).strict(),
  z.object({op:z.literal('item.patch'),id,values:Item,before:Item.optional()}).strict(),
  z.object({op:z.literal('preferences.patch'),values:Preferences,before:Preferences.optional()}).strict(),
  z.object({op:z.literal('reading.add'),seconds:z.number().int().min(0).max(86400)}).strict()
]);
export const Batch=z.object({operations:z.array(Operation).min(1).max(500),expectedRevision:z.number().int().nonnegative().optional()}).strict();
export const capabilities={
  operations:['card.upsert','card.delete','item.patch','preferences.patch','reading.add'],
  cardFields:Object.keys(Card._def.schema.shape),
  itemFields:Object.keys(Item.shape),preferences:['sort','reduceTransparency'],
  types:['article','mail','note','task','event','reminder','media','insight','digest','suggestion'],
  navigation:'GET /api/local/open?id=<card-id>&reading=true 返回预览、正文、来源链接；由宿主打开。',
  synchronization:'页面每秒读取本地状态；修改按字段合并，同一字段冲突返回 409。',
  examples:[{op:'card.upsert',card:{id:'my-note',type:'note',title:'我的笔记',body:['正文'],url:'https://example.com'}},{op:'item.patch',id:'my-note',values:{bookmarked:true,note:'备注',tags:['工作'],tagsEdited:true}},{op:'preferences.patch',values:{sort:'time'}}]
};
function conflict(message){throw Object.assign(new Error(message),{status:409});}
function compare(target,values,before){
  if(!before)return;
  for(const key of Object.keys(values))if(JSON.stringify(target[key])!==JSON.stringify(before[key]))conflict('同一字段已被修改，请读取最新状态再操作：'+key);
}
export class LocalRepository{
  constructor(file){
    this.file=file;this.value=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
    if(this.value){State.parse(this.value.state);z.number().int().nonnegative().parse(this.value.revision);}
  }
  initialize(state){
    if(this.value)return this.snapshot();
    const parsed=State.parse(state);
    if(new Set(parsed.cards.map(card=>card.id)).size!==parsed.cards.length)throw new Error('卡片 ID 重复');
    for(const key of Object.keys(parsed.items))if(!parsed.cards.some(card=>card.id===key))delete parsed.items[key];
    this.commit(parsed);return this.snapshot();
  }
  snapshot(){return this.value?structuredClone(this.value):{revision:0,state:null};}
  commit(state){
    const value={revision:(this.value?.revision||0)+1,state};
    mkdirSync(dirname(this.file),{recursive:true,mode:0o700});
    writeFileSync(this.file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});
    renameSync(this.file+'.tmp',this.file);this.value=value;
  }
  apply(input){
    const {operations,expectedRevision}=Batch.parse(input);
    if(expectedRevision!==undefined&&expectedRevision!==(this.value?.revision||0))conflict('版本已变化，请重新读取');
    const state=this.value?structuredClone(this.value.state):{cards:[],items:{},seconds:0,preferences:{sort:'priority',reduceTransparency:false}};
    for(const operation of operations){
      const index=state.cards.findIndex(card=>card.id===operation.id||card.id===operation.card?.id);
      if(operation.op==='card.upsert'){
        if(index<0)state.cards.unshift(operation.card);else state.cards[index]=operation.card;
      }else if(operation.op==='card.delete'){
        if(index<0)throw new Error('卡片不存在：'+operation.id);
        state.cards.splice(index,1);delete state.items[operation.id];
      }else if(operation.op==='item.patch'){
        if(index<0)throw new Error('卡片不存在：'+operation.id);
        if(operation.values.taskDone?.some(key=>!state.cards[index].tasks?.some(task=>task.id===key)))throw new Error('任务 ID 不存在');
        const item=state.items[operation.id]||{};compare(item,operation.values,operation.before);
        state.items[operation.id]={...item,...operation.values};
      }else if(operation.op==='preferences.patch'){
        compare(state.preferences,operation.values,operation.before);Object.assign(state.preferences,operation.values);
      }else state.seconds=Math.min(1e7,state.seconds+operation.seconds);
    }
    State.parse(state);
    if(JSON.stringify(state)!==JSON.stringify(this.value?.state))this.commit(state);
    return this.snapshot();
  }
}
