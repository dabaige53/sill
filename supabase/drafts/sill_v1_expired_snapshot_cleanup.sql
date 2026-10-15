-- REVIEW ONLY: administrator maintenance, not an API function or client grant.
-- Run periodically under the table-owning migration role; does not touch content/receipts.
begin;
delete from sill_private.sync_snapshots where expires_at<=clock_timestamp();
delete from sill_private.list_snapshots where expires_at<=clock_timestamp();
commit;
