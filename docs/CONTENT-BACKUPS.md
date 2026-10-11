# Content and settings backups v1

This feature exports and restores a finite **content/settings subset**, not a whole workspace or disaster-recovery image. A backup contains cards (including source content, attribution, reading state and source tags), their personal annotations, and an optional ordinary-settings snapshot. It does not contain Quiet Glass conversations, queued questions, AI attempts/budgets, audit history, external-action approvals, workflows, job/script runs, operation replay receipts, browser drafts, configuration, connector credentials, tokens, grants, executable modules or schedules.

## Privacy and integrity

A backup is plaintext JSON. Source text and personal notes can themselves contain private information or user-entered secrets. Excluding application configuration and credentials does **not** guarantee secret-free content. Review the scope before saving or sharing a file. The SHA-256 checksum detects corruption; it neither encrypts the file nor authenticates its author. Every imported record is validated independently of the checksum and remains untrusted data.

Only the existing owner can export, preview, commit, inspect or undo a restore. External principals receive no new tool grant. However, existing configured source/card scopes immediately apply to restored data. A restored evidence dependency can also make a previously unreadable existing card readable. Preview evaluates the final graph, names affected configured principals and sources, and requires acknowledgment. This is a scope disclosure, not verification that a principal's credential is currently usable. Undo cannot retract information already read by another identity.

## Finite portable format

The envelope has `format: "quiet-glass-content-backup"`, `version: 1`, `scope: "cards-annotations-settings"`, `exportedAt`, `payload: {cards, annotations, settings}`, and `checksum: {algorithm: "sha256", value}`. A null settings snapshot means no stored settings row; restoring null does not erase target preferences.

Limits are 100 cards, 100 annotations, 256 KiB canonical envelope, 8,000 recursive JSON elements and depth 32. Export fails explicitly when the complete stored content subset exceeds these limits or has broken references; it does not silently truncate. The envelope is passed as a JSON object, leaving room inside the existing 512 KiB HTTP/MCP request ceiling. Arbitrary paths, compressed archives, binary files, SQL, source code and arbitrary record kinds are not accepted.

Object keys are canonically sorted for the archive checksum; record collections are sorted by ID. Tag and evidence arrays retain order. Existing card contentHash semantics are preserved separately from the archive checksum. Strict schemas reject unknown fields, duplicate identities, unsafe numbers/Unicode and malformed provenance. Local note IDs, connector card IDs and normalized scoped host identities are checked. Every annotation and evidence reference must resolve inside the bundle. Unsafe URL credentials are rejected rather than silently stripped.

## Explicit restore flow

1. Export only when requested, or choose an existing JSON file. Selecting a file does not preview or commit anything automatically.
2. Request a preview. Additive mode is the default: missing records are candidates for insertion, equivalent records are no-ops, and differing existing records are conflicts. A plan with conflicts applies nothing.
3. Overwrite mode is a separate explicit choice. It can restore historical content values but cannot change an existing card's identity/category/source or activate operational state. Review the exact counts, scope, principal visibility and undo caveat.
4. Commit the exact preview with its token/digest and a stable idempotency key only after approval. The plan is bound to the input hash, scope, mode, store identity, mutation epoch and nonsecret access-policy digest. Changes require a new preview and renewed approval, never an automatic replay against refreshed state.
5. Inspect the saved receipt. If a response is uncertain, recover or retry the exact original request/key. Never generate a fresh key to retry an ambiguous operation.

The shared service performs validation, guard checks, content writes, local summary audit and durable receipt in one SQLite transaction. A failed commit rolls back all of them. Existing audit history and operational receipts are never imported, deleted or replaced. No connector, model, workflow, scheduler or script execution is called during restore.

Restored revisioned records advance beyond both current and imported revisions; undo advances again. Old revisions are never reinstated, preventing stale clients from regaining a valid compare-and-swap version. Full-record guards also cover reading-state changes, which do not otherwise increment a content revision.

## Immediate guarded undo

Undo means **restore previous overwritten values; newly added cards remain**. This is shown before commit and in results/UI. It is not generic full rollback after a successful commit, a deletion feature or time travel.

Bounded durable before-images allow the previous values to be restored only while the exact post-commit mutation epoch, store identity, access policy and after-images still match. Any later ordinary record change blocks undo, including a new conversation reference or background job/lease update. Previously absent settings/annotations become explicit default/empty rows at newer revisions; newly introduced cards are not deleted. Undo cannot be forced by refreshing an epoch automatically.

The storage mutation epoch is maintained by SQLite triggers across connections and direct record writes, excluding only defined backup metadata and audit inserts. It is not SQLite data_version or a process-local counter. Previews expire after 10 minutes and are capped at 20; expired preview metadata may be reclaimed. There are at most 20 retained restore receipts and 40 commit/undo idempotency entries, with a combined 16 MiB receipt/key budget and a 1 MiB per-record limit. Each un-undone receipt reserves its projected undo result/key space, including worst-case timestamp width; later backup-only metadata writes cannot consume this allowance. Capacity exhaustion rejects before applying content rather than evicting idempotency guarantees. Target graph analysis is bounded to 1,000 existing cards and 8 MiB, with at most 100 incoming additions. These are deliberate v1 limits, not an unbounded archive service. A successful original restore retry returns its historical receipt and does not reapply after later edits or undo.

## Interfaces

- `qg_export_content_backup` / POST `/api/backups/export` with `{}`
- `qg_preview_content_restore` / POST `/api/backups/preview` with `{backup, mode}`
- `qg_commit_content_restore` / POST `/api/backups/commit` with the bound preview fields, explicit approval/visibility acknowledgment and idempotency key
- `qg_get_content_restore` / GET `/api/backups/restores/:restoreId`
- `qg_undo_content_restore` / POST `/api/backups/restores/:restoreId/undo` with the displayed epoch, explicit approval and idempotency key

HTTP, MCP and the host UI adapter call the same guarded business service. Browser navigation/reload never auto-commits, auto-previews or automatically retries an uncertain write. Host file/download behavior is host-dependent; simulator tests do not certify a real ChatGPT/Work installation.

## Deliberate recovery limits

This subset does not preserve all original operation replay continuity when moved into a fresh database. For example, an old browser's uncertain note-creation key is not restored and could create a duplicate if explicitly reused through the original creation interface. Historic host import receipts are also excluded. Do not automatically replay old browser attempts after recovery.

Conversation/request state is excluded in particular because importing pending questions without their AI-attempt/budget guards could make an already attempted paid request startable again. Restoring a content/settings file never promises restoration of chat history, paid-call safety state, connected accounts or runnable automation.

Tests use synthetic data and temporary databases only. No real user database is overwritten, no credential is installed and no production execution setting is changed.
