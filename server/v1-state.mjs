// Durable per-content revisions share the same atomic file as legacy local state.
export function reconcileContents(previous,state,metadata=previous?.v1){
  const v=structuredClone(metadata||{contents:{},events:{},receipts:{}}),now=new Date().toISOString();
  const old=new Map((previous?.state?.cards||[]).map(c=>[c.id,c]));
  for(const c of state.cards){
    const prior=v.contents[c.id];
    const changed=JSON.stringify([old.get(c.id),previous?.state?.items[c.id]||{}])!==JSON.stringify([c,state.items[c.id]||{}]);
    v.contents[c.id]={revision:(prior?.revision||0)+(changed||!prior?1:0),created_at:prior?.created_at||now,updated_at:changed||!prior?now:prior.updated_at,deleted:false,sequence:changed||!prior?(previous?.revision||0)+1:prior.sequence};
  }
  for(const [id,c] of old)if(!state.cards.some(n=>n.id===id)){
    const prior=v.contents[id];v.contents[id]={revision:(prior?.revision||1)+1,created_at:prior?.created_at||now,updated_at:now,deleted:true,type:c.type,sequence:(previous?.revision||0)+1};
  }
  return v;
}
export function content(value,id){
  const m=value.v1.contents[id],c=value.state.cards.find(c=>c.id===id),i=value.state.items[id]||{};
  if(!m)return null;
  return {id,title:m.deleted?'已删除':c.title,type:m.deleted?m.type:c.type,body:m.deleted?[]:c.body||[],state:m.deleted?{}:{read:!!i.read,done:c.type==='task'?c.tasks.every(t=>i.taskDone?i.taskDone.includes(t.id):t.done):c.type==='reminder'?!!i.reminderDone:!!i.done,archived:!!i.archived},revision:m.revision,created_at:m.created_at,updated_at:m.updated_at,deleted:m.deleted,...(!m.deleted&&c.url?{url:c.url}:{})};
}
