import type { Card } from '../../../contracts/card.ts';
import schema from '../../../contracts/schema.json' with { type: 'json' };
import { matchesSchema } from '../../../contracts/json-schema.ts';
import { cardIssues } from '../../../contracts/card-rules.ts';

export function parseCard(input: unknown): Card {
  if (!matchesSchema(schema, input)) throw new Error('invalid_card');
  const card = input as Card;
  const issues = cardIssues(card);
  if (issues.length) throw new Error(issues[0]);
  return card;
}
