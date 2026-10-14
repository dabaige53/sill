-- REVIEW ONLY. No Data API exposure or runtime grants in this foundation.
-- Promote with `supabase migration new sill_v1_storage` after review.
begin;
create schema sill_private;
revoke all on schema sill_private from public, anon, authenticated;

create table sill_private.workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  -- Lock this row for every write; increment in the same transaction.
  -- Sequence/clock watermarks alone can miss transactions committed out of order.
  change_version bigint not null default 0 check (change_version between 0 and 9007199254740991),
  legacy_revision bigint check (legacy_revision between 0 and 9007199254740991),
  preferences jsonb not null default '{}' check (jsonb_typeof(preferences) = 'object'),
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  reading_seconds numeric not null default 0 check (reading_seconds between 0 and 10000000)
);
create table sill_private.contents (
  owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
  id text not null check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  change_version bigint not null check (change_version between 1 and 9007199254740991),
  -- Full legacy card/item, not the reduced public V1 Content projection.
  card jsonb not null check (jsonb_typeof(card) = 'object'),
  item jsonb not null default '{}' check (jsonb_typeof(item) = 'object'),
  state jsonb not null default '{}' check (jsonb_typeof(state) = 'object'),
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  check (not deleted or (card = '{}'::jsonb and item = '{}'::jsonb and state = '{}'::jsonb))
);
create index contents_sync on sill_private.contents(owner_id, change_version, id);
create table sill_private.events (
  owner_id uuid not null,
  event_id text not null check (event_id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  card_id text not null,
  card_version bigint not null check (card_version between 1 and 9007199254740991),
  action text not null check (action in ('summarize','complete')),
  destination_ref text not null check (destination_ref ~ '^[a-zA-Z0-9_-]{1,100}$'),
  -- Verified OAuth client/principal assignment, never a secret or supplied owner.
  assigned_caller text not null,
  delivery text not null default 'queued' check (delivery in ('queued','accepted','failed','unknown')),
  outcome text not null default 'pending' check (outcome in ('pending','succeeded','failed','unknown')),
  result_revision bigint check (result_revision between 1 and 9007199254740991),
  summary text not null default '' check (length(summary) <= 2000),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id,event_id),
  foreign key (owner_id,card_id) references sill_private.contents(owner_id,id),
  check ((outcome = 'pending' and result_revision is null) or (outcome <> 'pending' and result_revision is not null))
);
create index events_card on sill_private.events(owner_id,card_id);
create table sill_private.receipts (
  owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
  caller_id text not null,
  operation_resource text not null,
  idempotency_key text not null check (idempotency_key ~ '^[a-zA-Z0-9_-]{8,128}$'),
  request_digest text not null,
  status_code integer not null check (status_code between 200 and 299),
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(owner_id,caller_id,operation_resource,idempotency_key),
  check (expires_at > created_at)
);
create table sill_private.sync_snapshots (
  owner_id uuid not null references sill_private.workspaces(owner_id) on delete cascade,
  token_hash text not null,
  caller_id text not null,
  query_digest text not null,
  watermark bigint not null check (watermark between 0 and 9007199254740991),
  -- Materialized, stable public projections; purge together with cursor expiry.
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key(owner_id,token_hash),
  check (expires_at > created_at)
);
-- No policies/grants yet: fail closed, including OAuth tokens sharing owner sub.
-- Add narrowly scoped RPCs + database caller authorization in a reviewed migration.
alter table sill_private.workspaces enable row level security;
alter table sill_private.contents enable row level security;
alter table sill_private.events enable row level security;
alter table sill_private.receipts enable row level security;
alter table sill_private.sync_snapshots enable row level security;
revoke all on all tables in schema sill_private from public, anon, authenticated;
commit;
