import { cardIssues } from './card-rules.ts';
import { z } from 'zod/v4';

export const contractVersion = '2.0.0';
export const cardTypes = ['article', 'mail', 'note', 'task', 'event', 'reminder', 'media', 'digest', 'suggestion', 'photo', 'file'] as const;
export const sourceKinds = ['rss', 'readwise', 'youtube', 'twitter', 'podcast', 'web', 'mail', 'calendar', 'reminders', 'photos', 'folder', 'linear', 'github', 'capture', 'markdown', 'local', 'agent'] as const;
export const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value), 'invalid_id');
export const timestamp = z.number().finite().min(0).max(8.64e15);
export const httpUrl = z.string().url().regex(/^https?:\/\//);
const strings = z.array(z.string().max(100)).max(100);
const image = z.enum(['architecture', 'coast', 'mountain', 'botanical']);
export const SourceReference = z.object({ name: z.string().min(1).max(300), kind: z.string().min(1).max(100) }).passthrough();
export const Card = z.object({
  id,
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(1000),
  summary: z.string().max(10000).optional(),
  meta: z.string().max(300).optional(),
  form: z.enum(['standard', 'image', 'quote', 'compact', 'data']).optional(),
  image: image.optional(),
  tags: strings.optional(),
  body: z.array(z.string().max(50000)).max(100).optional(),
  url: httpUrl.optional(),
  sources: z.array(SourceReference).max(10).optional(),
  points: z.array(z.string().min(1).max(200)).max(3).optional(),
  why: z.object({ reason: z.string().min(1).max(300), basis: z.array(z.string().max(200)).max(5).optional() }).passthrough().optional(),
  sender: z.string().max(100).optional(),
  location: z.string().max(300).optional(),
  meeting: z.object({ name: z.string().min(1).max(100), url: httpUrl, code: z.string().max(100).optional() }).passthrough().optional(),
  media: z.enum(['video', 'podcast']).optional(),
  duration: z.number().int().min(0).max(86400).optional(),
  files: z.array(z.object({ name: z.string().min(1).max(300), meta: z.string().max(200).optional(), time: timestamp.optional() }).passthrough()).max(200).optional(),
  photos: z.array(image).max(50).optional(),
  attachment: z.string().max(300).optional(),
  tasks: z.array(z.object({ id, text: z.string().min(1).max(2000), done: z.boolean().optional() }).passthrough()).max(100).optional(),
  start: timestamp.optional(), end: timestamp.optional(), due: timestamp.optional(), time: timestamp.optional(),
  people: strings.optional(), related: z.array(id).max(100).optional(), priority: z.number().min(0).max(10).optional(),
}).passthrough().superRefine((card, context) => {
  for (const message of cardIssues(card)) context.addIssue({ code: 'custom', message });
});
export type Card = z.infer<typeof Card>;
export type SourceReference = z.infer<typeof SourceReference>;

export { normalizeCard } from './card-migration.ts';
