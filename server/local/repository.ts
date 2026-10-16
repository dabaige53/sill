import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod/v4';
import { Card, cardTypes as types, sourceKinds, normalizeCard } from '../../contracts/card.ts';
import { CardState, Preferences, Source, State, Batch } from '../../contracts/local.ts';
export const capabilities={
  operations:['card.upsert','card.delete','item.patch','preferences.patch','reading.add','source.upsert','source.delete'],
  cardFields:Object.keys(Card.shape),
  itemFields:Object.keys(CardState.shape),preferences:Object.keys(Preferences.shape),
  types,sourceKinds,
  navigation:'GET /api/local/open?id=<card-id>&reading=true 返回预览、正文、来源链接；由宿主打开。',
  synchronization:'页面每秒读取本地状态；修改按字段合并，同一字段冲突返回 409。',
  examples:[{op:'card.upsert',card:{id:'my-note',type:'note',title:'我的笔记',body:['正文'],url:'https://example.com'}},{op:'item.patch',id:'my-note',values:{bookmarked:true,note:'备注',tags:['工作'],tagsEdited:true}},{op:'preferences.patch',values:{sort:'time'}}]
};
function conflict(message?: any){throw Object.assign(new Error(message),{status:409});}
function compare(target?: any,values?: any,before?: any){
  if(!before)return;
  for(const key of Object.keys(values))if(JSON.stringify(target[key])!==JSON.stringify(before[key]))conflict('同一字段已被修改，请读取最新状态再操作：'+key);
}
export class LocalRepository{
declare file: any;
declare value: any;

  constructor(file?: any){
    this.file=file;this.value=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
    if(this.value?.state?.cards)this.value.state.cards=this.value.state.cards.map(normalizeCard);
    if(this.value?.state?.sources)this.value.state.sources=this.value.state.sources.map((source?: any)=>({...source,kind:source.kind==='ai'?'agent':source.kind}));
    if(this.value){State.parse(this.value.state);z.number().int().nonnegative().parse(this.value.revision);}
  }
  initialize(state?: any){
    if(this.value)return this.snapshot();
    const parsed=State.parse({...state,cards:state.cards?.map(normalizeCard)});
    if(new Set<any>(parsed.cards.map((card?: any)=>card.id)).size!==parsed.cards.length)throw new Error('卡片 ID 重复');
    for(const key of Object.keys(parsed.items))if(!parsed.cards.some((card?: any)=>card.id===key))delete parsed.items[key];
    this.commit(parsed);return this.snapshot();
  }
  snapshot(){return this.value?structuredClone(this.value):{revision:0,state:null};}
  commit(state?: any){
    const value={revision:(this.value?.revision||0)+1,state};
    mkdirSync(dirname(this.file),{recursive:true,mode:0o700});
    writeFileSync(this.file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});
    renameSync(this.file+'.tmp',this.file);this.value=value;
  }
  apply(input?: any){
    const {operations,expectedRevision}=Batch.parse(input);
    for(const operation of operations){if(operation.op==='card.upsert')operation.card=normalizeCard(operation.card);if((operation.op==='card.upsert'||operation.op==='card.delete')&&operation.before)operation.before=normalizeCard(operation.before);}
    if(expectedRevision!==undefined&&expectedRevision!==(this.value?.revision||0))conflict('版本已变化，请重新读取');
    const state=this.value?structuredClone(this.value.state):{cards:[],items:{},seconds:0,preferences:{sort:'priority',reduceTransparency:false}};
    for(const operation of operations){
      const operationId = operation.op === 'card.upsert' ? operation.card.id : 'id' in operation ? operation.id : undefined;
      const index=state.cards.findIndex((card?: any)=>card.id===operationId);
      if((operation.op==='card.upsert'||operation.op==='card.delete')&&operation.before!==undefined&&!isDeepStrictEqual(state.cards[index]??null,operation.before))conflict('这张卡片已被修改，请读取最新内容再保存');
      if(operation.op==='card.upsert'){
        if(index<0)state.cards.unshift(operation.card);else state.cards[index]=operation.card;
      }else if(operation.op==='card.delete'){
        if(index<0)throw new Error('卡片不存在：'+operation.id);
        state.cards.splice(index,1);delete state.items[operation.id];
      }else if(operation.op==='item.patch'){
        if(index<0)throw new Error('卡片不存在：'+operation.id);
        if(operation.values.taskDone?.some((key?: any)=>!state.cards[index].tasks?.some((task?: any)=>task.id===key)))throw new Error('任务 ID 不存在');
        const item=state.items[operation.id]||{};compare(item,operation.values,operation.before);
        state.items[operation.id]={...item,...operation.values};
      }else if(operation.op==='preferences.patch'){
        compare(state.preferences,operation.values,operation.before);Object.assign(state.preferences,operation.values);
      }else if(operation.op==='source.upsert'){
        state.sources??=[];const at=state.sources.findIndex((source?: any)=>source.id===operation.source.id);
        if(at<0)state.sources.push(operation.source);else state.sources[at]=operation.source;
      }else if(operation.op==='source.delete'){
        state.sources=(state.sources||[]).filter((source?: any)=>source.id!==operation.id);
      }else state.seconds=Math.min(1e7,state.seconds+operation.seconds);
    }
    State.parse(state);
    if(JSON.stringify(state)!==JSON.stringify(this.value?.state))this.commit(state);
    return this.snapshot();
  }
}
