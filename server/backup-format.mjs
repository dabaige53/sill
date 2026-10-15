import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { Item, HostItem, HostProvenance, NoteValues, AnnotationValues, SettingsValues,
  hostIdentity, hostSourceId, LOCAL_NOTE_SOURCE, QGError, iso } from './schemas.mjs';

export const BACKUP_FORMAT = 'sill-content-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_SCOPE = 'cards-annotations-settings';
export const BACKUP_LIMITS = Object.freeze({bytes:256 * 1024,cards:100,annotations:100,elements:8000,depth:32});
const fail = (code, message) => { throw new QGError(code, message); };
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const recordDigest = value => hash(JSON.stringify(value));
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

// Check descriptors before reading any value: JSON must not invoke accessors,
// toJSON hooks, or discard undefined, symbol, sparse, or decorated properties.
// Count both object keys and values, plus containers and array entries.
function plainJSON(value, options = {}) {
  const limits = {maxBytes:BACKUP_LIMITS.bytes,maxElements:BACKUP_LIMITS.elements,maxDepth:BACKUP_LIMITS.depth};
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(limits,key) || !Number.isSafeInteger(options[key]) || options[key]<1 || options[key]>limits[key]) fail('BACKUP_LIMIT','Backup limits can only be lowered');
    limits[key]=options[key];
  }
  let elements=0, bytes=0;
  const active=new Set();
  const addBytes=count=>{bytes+=count;if(bytes>limits.maxBytes)fail('BACKUP_LIMIT','Backup exceeds the canonical JSON byte limit');};
  function visit(item,depth) {
    if(depth>limits.maxDepth)fail('BACKUP_LIMIT','Backup exceeds the JSON nesting limit');
    if(++elements>limits.maxElements)fail('BACKUP_LIMIT','Backup exceeds the JSON element limit');
    if(item===null||typeof item==='boolean'){addBytes(item===null?4:item?4:5);return item;}
    if(typeof item==='number'){
      if(!Number.isFinite(item)||Math.abs(item)>Number.MAX_SAFE_INTEGER)fail('BACKUP_INVALID','Backup numbers must be finite and safely representable');
      addBytes(JSON.stringify(item).length);return Object.is(item,-0)?0:item;
    }
    if(typeof item==='string'){
      if(!item.isWellFormed())fail('BACKUP_INVALID','Backup strings must contain well-formed Unicode');
      if(item.length>limits.maxBytes)fail('BACKUP_LIMIT','Backup exceeds the canonical JSON byte limit');
      addBytes(Buffer.byteLength(JSON.stringify(item),'utf8'));return item;
    }
    if(!item||typeof item!=='object')fail('BACKUP_INVALID','Backup must contain only plain JSON values');
    const array=Array.isArray(item),prototype=Object.getPrototypeOf(item);
    if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)fail('BACKUP_INVALID','Backup must contain only plain JSON objects and arrays');
    if(active.has(item))fail('BACKUP_INVALID','Backup cannot contain cycles');
    active.add(item);
    const keys=Reflect.ownKeys(item);
    if(keys.some(key=>typeof key!=='string'))fail('BACKUP_INVALID','Backup cannot contain symbol properties');
    let copy;
    if(array){
      if(keys.length!==item.length+1)fail('BACKUP_INVALID','Backup arrays cannot be sparse or decorated');
      copy=[];addBytes(2+Math.max(0,item.length-1));
      for(let index=0;index<item.length;index++){
        const descriptor=Object.getOwnPropertyDescriptor(item,String(index));
        if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))fail('BACKUP_INVALID','Backup arrays must contain ordinary JSON values');
        copy.push(visit(descriptor.value,depth+1));
      }
    }else{
      copy={};addBytes(2+Math.max(0,keys.length-1)+keys.length);
      for(const key of keys.sort()){
        visit(key,depth+1);
        const descriptor=Object.getOwnPropertyDescriptor(item,key);
        if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))fail('BACKUP_INVALID','Backup objects must contain enumerable data properties');
        Object.defineProperty(copy,key,{value:visit(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
      }
    }
    active.delete(item);return copy;
  }
  return visit(value,0);
}

function sortedRecords(value) {
  // Only the two set-like record arrays are sorted. User-ordered tags, evidence,
  // recommendation interests and exclusions retain their original order.
  const payload=value&&typeof value==='object'&&!Array.isArray(value)
    ? (Object.hasOwn(value,'payload')?value.payload:value) : null;
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)){
    for(const [key,id] of [['cards','id'],['annotations','cardId']]){
      if(Array.isArray(payload[key])&&payload[key].every(record=>record&&typeof record[id]==='string'))payload[key].sort((a,b)=>compare(a[id],b[id]));
    }
  }
  return value;
}
function serialize(value) {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(serialize).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${serialize(value[key])}`).join(',')}}`;
}

// This lower-level helper also handles payload/row fingerprints. It validates
// bounded plain JSON, not the content schema. parseBackup is the trust boundary.
export function canonicalBackupJSON(value,{includeChecksum=true,...limits}={}) {
  if(typeof includeChecksum!=='boolean')fail('BACKUP_INVALID','includeChecksum must be a boolean');
  const copy=sortedRecords(plainJSON(value,limits));
  if(!includeChecksum&&copy&&typeof copy==='object'&&!Array.isArray(copy))delete copy.checksum;
  return serialize(copy);
}
export function backupDigest(value) {return hash(canonicalBackupJSON(value,{includeChecksum:false}));}

const revision=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveRevision=revision.min(1);
const timestamp=iso.max(64);
const cardId=z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i);
const sourceId=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const contentHash=z.string().regex(/^[a-f0-9]{64}$/);
const state=z.object({read:z.boolean(),bookmarked:z.boolean(),dismissed:z.boolean(),snoozedUntil:timestamp.nullable()}).strict();
// Stored records always contain input defaults. Requiring them prevents import
// validation from silently changing the checked and checksummed content.
const itemFields=Object.fromEntries(Object.entries(Item.shape).map(([key,schema])=>[key,schema instanceof z.ZodDefault?schema.removeDefault():schema]));
const storedFields={id:cardId,sourceId,contentHash,collectedAt:timestamp,firstCollectedAt:timestamp,state};
const LegacyCard=z.object({...itemFields,...storedFields}).strict();
const LocalCard=z.object({...NoteValues.shape,...storedFields,
  externalId:cardId,sourceId:z.literal(LOCAL_NOTE_SOURCE),kind:z.literal('note'),local:z.literal(true),revision:positiveRevision,
  summary:z.string().max(300),truncated:z.literal(false),evidenceIds:z.array(cardId).max(0),
  publishedAt:timestamp,createdAt:timestamp,updatedAt:timestamp,
}).strict();
const StoredProvenance=HostProvenance.extend({mode:z.literal('host-assisted'),attribution:z.literal('host-asserted')}).strict();
const HostCard=z.object({...itemFields,...storedFields,revision:positiveRevision,provenance:StoredProvenance}).strict();
const Annotation=z.object({cardId,values:AnnotationValues,revision}).strict();
const Settings=z.object({values:SettingsValues,revision}).strict().nullable();
const Payload=z.object({cards:z.array(z.unknown()).max(BACKUP_LIMITS.cards),annotations:z.array(z.unknown()).max(BACKUP_LIMITS.annotations),settings:z.unknown()}).strict();
const Envelope=z.object({format:z.enum([BACKUP_FORMAT,'quiet-glass-content-backup']),version:z.literal(BACKUP_VERSION),scope:z.literal(BACKUP_SCOPE),
  exportedAt:timestamp,payload:Payload,checksum:z.object({algorithm:z.literal('sha256'),value:contentHash}).strict(),
}).strict();
const parseExact=(schema,value)=>{
  const parsed=schema.parse(value);
  if(!isDeepStrictEqual(parsed,value))fail('BACKUP_INVALID','Stored backup values cannot require trimming, defaults or coercion');
  return parsed;
};
const unsafeCredentialKey=key=>/^(?:accesstoken|refreshtoken|idtoken|token|authtoken|oauthtoken|oauthtokensecret|apikey|key|accesskey|accesskeyid|awsaccesskeyid|secretaccesskey|authorization|auth|password|passwd|secret|clientsecret|clientkey|privatekey|code|session|sessionid|sessionkey|sessiontoken|credential|credentials|bearer|bearertoken|jwt|signature|sig|xamzcredential|xamzsignature|xamzsecuritytoken|xgoogcredential|xgoogsignature)$/.test(key.toLowerCase().replace(/[^a-z0-9]/g,''));
function safeUrl(value) {
  if(typeof value!=='string'||value.length>2048||value!==value.trim()||/[\u0000-\u0020\u007f\\]/.test(value))fail('BACKUP_INVALID','Backup source links must be bounded, unambiguous HTTP(S) URLs');
  let url;try{url=new URL(value);}catch{fail('BACKUP_INVALID','Backup contains an invalid source URL');}
  if(!/^https?:\/\//i.test(value)||/^https?:\/\/[^/?#]*@/i.test(value)||!['http:','https:'].includes(url.protocol)||url.username||url.password||[...url.searchParams.keys(),...new URLSearchParams(url.hash.slice(1)).keys()].some(unsafeCredentialKey))fail('BACKUP_INVALID','Backup source links cannot contain URL credentials or credential query fields');
}
function validateCard(value) {
  let card;
  if(Object.hasOwn(value,'local')||value.sourceId===LOCAL_NOTE_SOURCE||String(value.id).startsWith('local_note_')){
    card=parseExact(LocalCard,value);
    if(!/^local_note_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(card.id)||card.externalId!==card.id)fail('BACKUP_INVALID','Local note identity is inconsistent');
    if(card.summary!==card.content.slice(0,300)||card.createdAt!==card.firstCollectedAt||card.createdAt!==card.collectedAt||card.publishedAt!==card.updatedAt||Date.parse(card.updatedAt)<Date.parse(card.createdAt))fail('BACKUP_INVALID','Local note summary or timestamps are inconsistent');
  }else if(Object.hasOwn(value,'provenance')||['host-notion','host-google-calendar','host-linear'].includes(value.sourceId)){
    card=parseExact(HostCard,value);
    const {mode,attribution,...provenance}=card.provenance;
    const input=Object.fromEntries(Object.keys(itemFields).filter(key=>Object.hasOwn(card,key)).map(key=>[key,card[key]]));
    // Reuse every HostItem provider/date/source/content-origin invariant. These
    // are input-only fields: the stored envelope must never contain them.
    parseExact(HostItem,{...input,provenance,expectedRevision:card.revision-1});
    if(card.sourceId!==hostSourceId(provenance.provider)||card.id!==`card_${recordDigest(['host-assisted',...hostIdentity(provenance)]).slice(0,32)}`)fail('BACKUP_INVALID','Host card identity does not match its provenance');
  }else{
    card=parseExact(LegacyCard,value);
    if(card.id!==`card_${recordDigest([card.sourceId,card.externalId]).slice(0,32)}`)fail('BACKUP_INVALID','Source card identity does not match its source');
  }
  if(Date.parse(card.firstCollectedAt)>Date.parse(card.collectedAt))fail('BACKUP_INVALID','First collection cannot follow the current collection');
  if(Object.hasOwn(card,'url'))safeUrl(card.url);
  // contentHash describes variant-specific, historically ordered input. It is
  // validated as a digest, never naively recomputed from the exported card.
  return card;
}
export function validateBackupCard(value) {
  const copy=plainJSON(value);
  if(!copy||typeof copy!=='object'||Array.isArray(copy))fail('BACKUP_INVALID','A backup card must be an object');
  return validateCard(copy);
}
export function validateBackupAnnotation(value) {return parseExact(Annotation,plainJSON(value));}
export function validateBackupSettings(value) {return parseExact(Settings,plainJSON(value));}
function validatePayload(value) {
  parseExact(Payload,value);
  if(!Object.hasOwn(value,'settings'))fail('BACKUP_INVALID','Backup settings must be a snapshot or null');
  const cards=value.cards.map(card=>{
    if(!card||typeof card!=='object'||Array.isArray(card))fail('BACKUP_INVALID','A backup card must be an object');
    return validateCard(card);
  }),annotations=value.annotations.map(annotation=>parseExact(Annotation,annotation)),settings=parseExact(Settings,value.settings);
  const ids=new Set(),annotationIds=new Set(),hostIds=new Set();
  for(const card of cards){
    if(ids.has(card.id))fail('BACKUP_INVALID','Backup contains duplicate card IDs');ids.add(card.id);
    if(card.provenance){const identity=JSON.stringify(hostIdentity(card.provenance));if(hostIds.has(identity))fail('BACKUP_INVALID','Backup contains duplicate normalized host identities');hostIds.add(identity);}
  }
  for(const card of cards)for(const evidenceId of card.evidenceIds)if(!ids.has(evidenceId))fail('BACKUP_INVALID','Every evidence reference must resolve within the backup');
  for(const annotation of annotations){
    if(annotationIds.has(annotation.cardId))fail('BACKUP_INVALID','Backup contains duplicate annotation IDs');annotationIds.add(annotation.cardId);
    if(!ids.has(annotation.cardId))fail('BACKUP_INVALID','Every annotation must belong to a card in the backup');
  }
  return sortedRecords({cards,annotations,settings});
}
export function validateBackupPayload(value) {return validatePayload(plainJSON(value));}
export function makeBackup(payload,{exportedAt=new Date().toISOString()}={}) {
  const envelope={format:BACKUP_FORMAT,version:BACKUP_VERSION,scope:BACKUP_SCOPE,exportedAt,
    payload:validateBackupPayload(payload),checksum:{algorithm:'sha256',value:'0'.repeat(64)}};
  parseExact(Envelope,envelope);
  // Include the entire eventual checksum field in byte and element accounting.
  envelope.checksum.value=backupDigest(envelope);
  canonicalBackupJSON(envelope);
  return envelope;
}
export function parseBackup(value) {
  // The transport passes an object, never an extra JSON-encoded string.
  const copy=plainJSON(value);
  if(copy&&typeof copy==='object'&&Object.hasOwn(copy,'version')&&copy.version!==BACKUP_VERSION)fail('BACKUP_VERSION','Unsupported content backup version');
  parseExact(Envelope,copy);
  copy.payload=validatePayload(copy.payload);
  if(copy.checksum.value!==backupDigest(copy))fail('BACKUP_CHECKSUM','Content backup checksum does not match');
  return copy;
}
