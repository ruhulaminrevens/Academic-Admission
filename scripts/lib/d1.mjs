// Minimal Cloudflare D1 + R2 stand-ins for local development and tests (Node 22+, node:sqlite).
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const norm = value => (value === undefined ? null : typeof value === 'boolean' ? Number(value) : value);

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values.map(norm)); }
  #prepared() { return this.db.prepare(this.sql); }
  async all() { return { results: this.#prepared().all(...this.values).map(row => ({ ...row })), success: true, meta: {} }; }
  async first() { const row = this.#prepared().get(...this.values); return row ? { ...row } : null; }
  async run() { const info = this.#prepared().run(...this.values); return { success: true, results: [], meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; }
}

export class D1 {
  constructor(file = ':memory:') { this.db = new DatabaseSync(file); this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;'); }
  prepare(sql) { return new Statement(this.db, sql); }
  async batch(statements) {
    const out = [];
    this.db.exec('BEGIN');
    try { for (const statement of statements) out.push(await statement.run()); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return out;
  }
  exec(sql) { this.db.exec(sql); }
}

export async function migrate(d1, dir) {
  const files = (await readdir(dir)).filter(name => name.endsWith('.sql')).sort();
  for (const name of files) {
    const sql = await readFile(join(dir, name), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint')) if (statement.trim()) d1.exec(statement);
  }
}

export class Bucket {
  constructor() { this.objects = new Map(); }
  async put(key, value, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, { key, bytes, size: bytes.length, uploaded: new Date(), customMetadata: options.customMetadata || {}, httpMetadata: options.httpMetadata || {} });
    return { key };
  }
  async get(key) {
    const object = this.objects.get(key);
    return object ? { ...object, body: new Response(object.bytes).body } : null;
  }
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key); }
  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.objects.values()].filter(object => object.key.startsWith(prefix)).slice(0, limit).map(({ bytes, ...rest }) => rest);
    return { objects, truncated: false };
  }
}
