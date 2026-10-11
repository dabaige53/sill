import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const uid = prefix => `${prefix}_${randomUUID()}`;
const decode = row => row ? JSON.parse(row.value) : null;

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'quiet-glass.sqlite'));
    chmodSync(join(directory, 'quiet-glass.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, time TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  get(kind, id) { return decode(this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id)); }
  list(kind) { return this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY id').all(kind).map(decode); }
  put(kind,id,value) { this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value)); return value; }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(event, detail) { this.db.prepare('INSERT INTO audit(time,event,detail) VALUES(?,?,?)').run(new Date().toISOString(),event,JSON.stringify(detail)); }
  history(limit=30) { return this.db.prepare('SELECT * FROM audit ORDER BY seq DESC LIMIT ?').all(limit).map(r=>({...r,detail:JSON.parse(r.detail)})); }
  ingest(sourceId, items) {
    return this.transaction(() => items.map(item => {
      const id = `card_${digest([sourceId,item.externalId]).slice(0,32)}`;
      const previous = this.get('card',id);
      const now = new Date().toISOString();
      const contentHash = digest(item);
      if (previous?.contentHash === contentHash) return previous;
      const card = { ...item, id, sourceId, contentHash, collectedAt: now, firstCollectedAt: previous?.firstCollectedAt || now, state: previous?.state || { read:false, bookmarked:false, dismissed:false, snoozedUntil:null } };
      this.put('card',id,card);
      return card;
    }));
  }
}
