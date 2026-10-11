import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const operation = z.object({
  tool: z.string().min(1), arguments: z.record(z.unknown()).default({}),
  itemsPath: z.string().default('items'),
  fields: z.record(z.string()).default({ id: 'id', title: 'title', content: 'content', url: 'url' }),
  cursorArgument: z.string().optional(), cursorPath: z.string().optional(),
}).strict();
const common = { id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), label: z.string().max(100), enabled: z.boolean().default(true), allowWrites: z.boolean().default(false) };
export const ConfigSchema = z.object({
  dataDir: z.string().default('.quiet-glass'),
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
  const path = resolve(env.QG_CONFIG || resolve(ROOT, 'quiet-glass.config.json'));
  const config = ConfigSchema.parse(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
  config.dataDir = resolve(env.QG_DATA_DIR || resolve(dirname(path), config.dataDir));
  return config;
}
