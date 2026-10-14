import { Card, Item, State } from './local-state.mjs';

// Pure preparation: no file reads, network, credentials, generated IDs or writes.
// Input is an explicitly selected local export, never the other task's working tree.
export function prepareSupabaseImport(snapshot) {
  if (!Number.isSafeInteger(snapshot?.revision) || snapshot.revision < 0 || !snapshot.state) {
    throw new Error('Invalid local snapshot');
  }
  State.parse(snapshot.state);
  const state = snapshot.state;
  if (!Array.isArray(state.cards) || state.cards.length > 5000 || !state.items || Array.isArray(state.items)) {
    throw new Error('Invalid local state');
  }
  const ids = new Set();
  const contents = state.cards.map(card => {
    Card.parse(card); // Validate without replacing the raw object with schema defaults.
    if (ids.has(card.id)) throw new Error('Duplicate card ID');
    ids.add(card.id);
    const item = state.items[card.id] ?? {};
    Item.parse(item);
    return {id:card.id, revision:1, card:structuredClone(card), item:structuredClone(item),
      state: typeof item.read === 'boolean' ? {read:item.read} : {}};
  });
  for (const id of Object.keys(state.items)) if (!ids.has(id)) throw new Error('Orphan item requires review');
  // Keep complete settings/source data; never turn a placeholder status into verified connectivity.
  return {legacyRevision:snapshot.revision, contents,
    settings:structuredClone(Object.fromEntries(Object.entries(state).filter(([key]) => !['cards','items'].includes(key)))),
    warnings:['done/archived require explicit mapping; taskDone is local state, not an external receipt.',
      'Source statuses are unverified legacy data; disable delivery until configured and checked.']};
}
