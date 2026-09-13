import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
export const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, role TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, manufacturer TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id), product_name TEXT NOT NULL,
  manufacturer TEXT, category TEXT, inspector_id TEXT REFERENCES users(id), inspector_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', automated_status TEXT NOT NULL DEFAULT 'PENDING',
  review_status TEXT NOT NULL DEFAULT 'PENDING', final_status TEXT NOT NULL DEFAULT 'PENDING',
  score TEXT, compliance_pct REAL, analysis_started_at TEXT, analyzed_at TEXT, created_at TEXT NOT NULL,
  reviewer_notes TEXT, model_name TEXT, model_version TEXT, rule_version TEXT, device TEXT, latency_ms REAL,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inspection_images (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
  width INTEGER, height INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ocr_results (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL UNIQUE REFERENCES inspections(id) ON DELETE CASCADE,
  raw_boxes_json TEXT NOT NULL, boxes_count INTEGER NOT NULL, full_text TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS declarations (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL, label TEXT NOT NULL, value TEXT, detected INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rule_results (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL, rule_code TEXT NOT NULL, requirement TEXT NOT NULL, observed_value TEXT,
  status TEXT NOT NULL, evaluation_scope TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS violations (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL, rule_code TEXT NOT NULL, requirement TEXT NOT NULL, observed_value TEXT,
  reason TEXT NOT NULL, severity TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Open', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  format TEXT NOT NULL, storage_key TEXT NOT NULL, generated_by TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, inspection_id TEXT REFERENCES inspections(id) ON DELETE SET NULL, user_id TEXT,
  action TEXT NOT NULL, old_value TEXT, new_value TEXT, metadata_json TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
`);

const now = new Date().toISOString();
db.prepare("INSERT OR IGNORE INTO users (id, name, email, role, created_at) VALUES (?, ?, ?, ?, ?)")
  .run("usr-system", "System Administrator", "admin@metrologyguard.local", "Administrator", now);

export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const audit = (action: string, inspectionId: string | null, userId = "usr-system", oldValue?: unknown, newValue?: unknown, metadata?: unknown) => {
  db.prepare("INSERT INTO audit_logs (id, inspection_id, user_id, action, old_value, new_value, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(id("aud"), inspectionId, userId, action, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, metadata ? JSON.stringify(metadata) : null, new Date().toISOString());
};
