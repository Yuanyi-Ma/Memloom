import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/schema';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

describe('Database Schema', () => {
  const testDir = path.join(os.tmpdir(), 'kb-test-db-' + Date.now());
  const dbPath = path.join(testDir, 'test.sqlite');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize database idempotently', () => {
    let db = initDatabase(dbPath);
    expect(db).toBeDefined();
    db.close();
    
    // Call again should not throw
    expect(() => {
      let db2 = initDatabase(dbPath);
      db2.close();
    }).not.toThrow();
  });

  it('should have WAL mode enabled', () => {
    const db = initDatabase(dbPath);
    const result = db.pragma('journal_mode', { simple: true });
    expect(result).toBe('wal');
    db.close();
  });

  it('should have all tables created', () => {
    const db = initDatabase(dbPath);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as {name: string}[];
    const tableNames = tables.map(t => t.name);
    
    expect(tableNames).toContain('cards');
    expect(tableNames).toContain('card_schedule');
    expect(tableNames).toContain('review_history');
    expect(tableNames).toContain('negative_feedback');
    db.close();
  });
});
