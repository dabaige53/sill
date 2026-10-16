import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod/v4';
import { Card, contractVersion } from '../contracts/card.ts';

export const cardSchema = { ...z.toJSONSchema(Card, { io: 'input' }), title: 'Card', 'x-contract-version': contractVersion, 'x-status': 'implemented' };
const content = JSON.stringify(cardSchema, null, 2) + '\n';
const target = new URL('../contracts/schema.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content) throw new Error('stale_card_schema');
} else writeFileSync(target, content);
const { $schema, ...appleCard } = cardSchema;
const appleContent = JSON.stringify({ openapi: '3.1.0', info: { title: 'Sill Card', version: contractVersion }, paths: {}, components: { schemas: { Card: appleCard } } }, null, 2) + '\n';
const appleTarget = new URL('../contracts/apple-openapi.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (readFileSync(appleTarget, 'utf8') !== appleContent) throw new Error('stale_apple_schema');
} else writeFileSync(appleTarget, appleContent);
