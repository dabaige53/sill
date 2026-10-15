import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
// This deliberately finite surface has no connector, provider, workflow,
// conversation, settings or security-management capabilities.
export const PRINCIPAL_TOOLS = Object.freeze([
  'qg_search','qg_get_card','qg_recommend','qg_create_note','qg_update_note',
  'qg_read_annotation','qg_update_annotation','qg_feedback','qg_ingest',
]);
const sourceId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const unique = schema => z.array(schema).max(100).refine(values=>new Set(values).size===values.length,'Duplicate access entry');
export const AccessConfigSchema = z.object({
  principals:z.array(z.object({
    id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).refine(id=>id!=='owner','Reserved principal ID'),
    enabled:z.boolean().default(false),
    tokenEnv:envName.refine(name=>name!=='QG_AUTH_TOKEN','Owner token reference is reserved'),
    tools:unique(z.enum(PRINCIPAL_TOOLS)).default([]),
    resources:z.object({
      sourceIds:unique(sourceId).default([]),
      // Omitted means all cards in sourceIds. Present means an additional
      // intersection; an explicitly empty cardIds array grants no cards.
      cardIds:unique(z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i)).optional(),
      ingestSourceIds:unique(sourceId).default([]),
    }).strict().default({}),
    limits:z.object({
      requestsPerMinute:z.number().int().min(1).max(600).default(60),
      maxRequestBytes:z.number().int().min(256).max(524288).default(65536),
      maxConcurrent:z.number().int().min(1).max(8).default(2),
    }).strict().default({}),
  }).strict()).max(30).default([]),
}).strict().superRefine((value,ctx)=>{
  const ids=new Set(),envs=new Set();
  for(const principal of value.principals){
    if(ids.has(principal.id)||envs.has(principal.tokenEnv))ctx.addIssue({code:'custom',message:'Duplicate principal ID or token reference'});
    ids.add(principal.id);envs.add(principal.tokenEnv);
    if(principal.resources.ingestSourceIds.some(id=>!principal.resources.sourceIds.includes(id)))ctx.addIssue({code:'custom',message:'Ingest sources must also be readable sources'});
  }
});
// Provider URL and credentials are deliberately not configurable here. Operators
// opt in and select a model; the only credential setting is an environment name.
export const AiConfigSchema = z.object({
  enabled:z.boolean().default(false),
  model:z.string().trim().max(100).regex(/^[a-zA-Z0-9._:-]*$/).default(''),
  apiKeyEnv:envName.default('OPENAI_API_KEY'),
  maxOutputTokens:z.number().int().min(16).max(8192).default(1024),
  timeoutMs:z.number().int().min(100).max(300000).default(60000),
  maxConcurrency:z.number().int().min(1).max(8).default(1),
  maxContextChars:z.number().int().min(1000).max(64000).default(16000),
  maxRequestsPerDay:z.number().int().min(1).max(10000).default(20),
}).strict();
// The worker runs only finite local readers. This operator-only configuration is
// deliberately separate from ordinary workspace settings and external access.
export const JobsConfigSchema = z.object({
  enabled:z.boolean().default(false),
  maxJobs:z.number().int().min(1).max(100).default(30),
  maxRuns:z.number().int().min(1).max(1000).default(200),
  maxManualReceipts:z.number().int().min(1).max(10000).default(2000),
  maxConcurrency:z.number().int().min(1).max(8).default(2),
  timeoutMs:z.number().int().min(100).max(120000).default(10000),
  tickMs:z.number().int().min(50).max(60000).default(1000),
  leaseMs:z.number().int().min(100).max(300000).default(30000),
  maxCards:z.number().int().min(1).max(5000).default(1000),
  maxInputBytes:z.number().int().min(1024).max(33554432).default(8388608),
  maxResultBytes:z.number().int().min(1024).max(65536).default(32768),
}).strict().refine(value=>value.maxConcurrency<=value.maxRuns,'Run history must fit all concurrent runs');
// This is operator configuration, never an ordinary workspace preference or an
// external-principal grant. The executable path is local and never supplied by
// an invocation; runtime dependencies must already have been installed.
export const ScriptsConfigSchema = z.object({
  enabled:z.boolean().default(false),
  pythonPath:z.string().min(1).max(4096).refine(value=>isAbsolute(value)&&!value.includes('\0'),'Expected an absolute local executable path').default(resolve(ROOT,'.sandbox-venv/bin/python')),
  maxRuns:z.number().int().min(1).max(1000).default(200),
  maxReceipts:z.number().int().min(1).max(10000).default(2000),
  maxConcurrency:z.number().int().min(1).max(8).default(1),
  timeoutMs:z.number().int().min(100).max(2000).default(2000),
  leaseMs:z.number().int().min(100).max(60000).default(10000),
  maxInputBytes:z.number().int().min(256).max(16384).default(16384),
  maxResultBytes:z.number().int().min(256).max(32768).default(32768),
  fuel:z.number().int().min(1).max(1000000).default(1000000),
  memoryBytes:z.number().int().min(65536).max(16777216).default(16777216),
}).strict().refine(value=>value.maxConcurrency<=value.maxRuns,'Run history must fit all concurrent runs');
const operation = z.object({
  tool: z.string().min(1), arguments: z.record(z.unknown()).default({}),
  itemsPath: z.string().default('items'),
  fields: z.record(z.string()).default({ id: 'id', title: 'title', content: 'content', url: 'url' }),
  cursorArgument: z.string().optional(), cursorPath: z.string().optional(),
}).strict();
const common = { id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), label: z.string().max(100), enabled: z.boolean().default(true), allowWrites: z.boolean().default(false) };
export const ConfigSchema = z.object({
  dataDir: z.string().default('.sill'),
  ai:AiConfigSchema.default({}),
  jobs:JobsConfigSchema.default({}),
  scripts:ScriptsConfigSchema.default({}),
  access:AccessConfigSchema.default({}),
  connectors: z.array(z.discriminatedUnion('type', [
    z.object({ ...common, type: z.literal('google-calendar'), calendarId: z.string().default('primary'), tokenEnv: envName.default('GOOGLE_ACCESS_TOKEN'), refreshTokenEnv: envName.optional(), clientIdEnv: envName.optional(), clientSecretEnv: envName.optional() }).strict(),
    z.object({ ...common, type: z.literal('notion'), tokenEnv: envName.default('NOTION_TOKEN'), version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default('2025-09-03'), parentPageId: z.string().optional() }).strict(),
    z.object({ ...common, type: z.literal('mcp'), url: z.string().url(), tokenEnv: envName.optional(), readTools: z.array(z.string()).default([]), writeTools: z.array(z.string()).default([]), collect: operation.optional() }).strict(),
  ])).max(30).default([]),
}).strict().superRefine((v, ctx) => {
  const ids = new Set();
  for (const c of v.connectors) {
    if (ids.has(c.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate connector ID' });
    ids.add(c.id);
    if (c.type === 'mcp') {
      const u = new URL(c.url);
      if (u.username || u.password || u.hash || !(u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname)))) ctx.addIssue({ code: 'custom', message: 'MCP requires HTTPS or loopback HTTP without embedded credentials' });
      if (c.readTools.some(t => c.writeTools.includes(t))) ctx.addIssue({ code: 'custom', message: 'Read and write tool allowlists must not overlap' });
      if (c.collect && !c.readTools.includes(c.collect.tool)) ctx.addIssue({ code: 'custom', message: 'Collection tool must be in readTools' });
    }
  }
});

export function loadConfig(env = process.env) {
  const path = resolve(env.QG_CONFIG || resolve(ROOT, 'sill.config.json'));
  const config = ConfigSchema.parse(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
  config.dataDir = resolve(env.QG_DATA_DIR || resolve(dirname(path), config.dataDir));
  return config;
}
