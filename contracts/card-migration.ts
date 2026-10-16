import type { Card } from './card.ts';

export function normalizeCard(input: Card): Card {
  const card = structuredClone(input);
  const sources = (card.sources ?? []).map(source => ({ ...source, kind: source.kind === 'ai' ? 'agent' : source.kind }));
  if (typeof card.source === 'string' && card.source && card.type !== 'mail') {
    const kind = card.kind === 'ai' ? 'agent' : typeof card.kind === 'string' ? card.kind : 'local';
    if (!sources.some(source => source.name === card.source && source.kind === kind)) sources.push({ name: card.source, kind });
  } else if (card.type === 'mail' && !card.sender && typeof card.source === 'string') {
    card.sender = card.source;
  }
  if (!sources.length && typeof card.kind === 'string') sources.push({ name: card.kind === 'ai' ? '助手' : card.type === 'mail' ? '邮件' : card.kind, kind: card.kind === 'ai' ? 'agent' : card.kind });
  if (sources.length || card.sources) card.sources = sources;
  delete card.source;
  delete card.kind;
  return card;
}
