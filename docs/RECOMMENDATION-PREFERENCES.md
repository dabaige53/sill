# Explicit recommendation preferences

F08 extends the existing owner settings record. There is one settings revision, one CAS transaction and one audit path; no second profile store or inferred-interest model. Preferences only affect recommendation ranking. They do not hide cards from search, revoke access, collect new information or call an AI provider.

## Contract

Use existing `qg_read_settings` / `qg_update_settings` or authenticated GET/PATCH `/api/settings`. The optional `values.recommendation` block has effective defaults:

```json
{"interests":[],"sourcePriorities":{},"excludedSourceIds":[],"includeRead":false}
```

Old/default snapshots may omit this block for compatibility. Omission has exactly the defaults above. Explicit updates replace the whole group:

```json
{
  "set":{"recommendation":{
    "interests":["project review"],
    "sourcePriorities":{"local-notes":15},
    "excludedSourceIds":[],
    "includeRead":false
  }},
  "expectedRevision":3
}
```

Interests are bounded to 20 nonempty strings of at most 100 characters. Source priorities accept at most 20 explicit source IDs and integer weights from -30 to 30. Exclusions accept at most 100 explicit source IDs. Unknown fields, coercions and invalid IDs are rejected. IDs identify stored sources, not third-party authorization or connector settings.

Actual changes increment the shared settings revision. Equivalent nested values are a no-op. Saving a reset writes the default group through the same CAS path; it does not delete cards, feedback or history. Resetting an absent default group is a no-op. Stale updates return `SETTINGS_CONFLICT` with current settings and do not silently replay. Audit records changed setting keys and revision numbers rather than the interest text.

## Recommendations and overrides

`qg_recommend` and POST `/api/recommend` use saved preferences for owner calls. Explicitly supplied `interests`, `sourcePriorities`, `excludedSourceIds` or `includeRead` override that field for one call only; empty arrays/objects explicitly clear that field for the call. Overrides never persist. `query` and `limit` remain request options.

The existing deterministic rules consider matching words, unread state, bookmarks, freshness, event urgency and source diversity, with the explicit source weight added to the score. Each returned item includes reasons and its card/source evidence. Ties use stable card IDs. Results can change with time, new cards or feedback; this is not a learned relevance score. Dismissed or currently snoozed cards are omitted. Read cards are omitted unless includeRead is enabled; unread and bookmarked states retain their existing score contributions. A source exclusion affects recommendations only. Source diversity remains a soft rule, not a guarantee that missing or excluded sources appear. Its urgent/high-score exemption uses the final score (at least 100), so an explicit negative source weight can move an event below that threshold. Rank adjustments are disclosed with score rank and displayed rank.

Restricted-agent calls never read or inherit the owner's saved interests, priorities, exclusions or read preference. They use neutral defaults plus their own explicit request fields, and all source/card/evidence authorization bounds remain enforced before ranking and output. Specifying a source in a request cannot grant access. Settings remain owner-only.

## Interface and recovery

Connected owner settings provide a compact editor and recommendation preview. It uses service-authoritative values; browser drafts are never implicitly uploaded. Saving is explicit and uses the shared revision. Conflicts retain the draft for inspection rather than replaying it. The reset button stages defaults in the draft; explicit Save applies them. Undo restores the previous draft, including after saving the reset. The preview shows returned explanations and source IDs, without silently replacing the feed or changing its sort.

Offline demo behavior stays local. Host mode uses the same-server MCP adapter; actual installation in a native host is not established by protocol/browser simulation.

## Verification

Run `npm test`, `npm run check`, and `npm run test:preferences-browser`. Focused tests cover persistence/restart, shared revision conflicts, structural no-ops, explicit overrides, feedback, deterministic explanation and restricted-agent privacy. Protocol tests use real loopback HTTP/MCP; browser tests use actual Chromium and synthetic data. No sensitive interests were inferred and no external data or credentials were collected.
