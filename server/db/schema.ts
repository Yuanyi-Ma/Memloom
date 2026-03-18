import DatabaseConstructor, { Database } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DDL_STRING = `
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    tags TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    priority TEXT NOT NULL DEFAULT 'normal',
    brief TEXT,
    detail TEXT NOT NULL DEFAULT '',
    feynman_seed TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_session TEXT
);

CREATE TABLE IF NOT EXISTS card_schedule (
    card_id TEXT PRIMARY KEY REFERENCES cards(id),
    ef REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 1,
    next_review_date TEXT NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    consecutive_correct INTEGER NOT NULL DEFAULT 0,
    last_rating TEXT,
    last_review_at TEXT
);

CREATE TABLE IF NOT EXISTS review_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL REFERENCES cards(id),
    reviewed_at TEXT NOT NULL,
    rating TEXT NOT NULL,
    session_notes TEXT
);

CREATE TABLE IF NOT EXISTS negative_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT,
    original_title TEXT,
    extracted_content TEXT,
    deleted_at TEXT NOT NULL,
    calibrated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_category ON cards(category);
CREATE INDEX IF NOT EXISTS idx_schedule_next ON card_schedule(next_review_date);
CREATE INDEX IF NOT EXISTS idx_review_history_card ON review_history(card_id);
`;

export function initDatabase(dbPath: string): Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseConstructor(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(DDL_STRING);

  // Migration: add detail/feynman_seed columns to existing databases
  const cols = db.prepare("PRAGMA table_info('cards')").all() as { name: string }[];
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('detail')) {
    db.exec("ALTER TABLE cards ADD COLUMN detail TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.includes('feynman_seed')) {
    db.exec("ALTER TABLE cards ADD COLUMN feynman_seed TEXT NOT NULL DEFAULT ''");
  }

  return db;
}
