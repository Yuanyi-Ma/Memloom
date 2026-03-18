import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase } from '../../db/schema';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

describe('Database Schema - 边界条件补充', () => {
  it('in-memory 数据库初始化正常', () => {
    const db = initDatabase(':memory:');
    expect(db).toBeDefined();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.map(t => t.name)).toContain('cards');
    db.close();
  });

  it('外键约束生效：插入无效 card_id 的 card_schedule 应失败', () => {
    const db = initDatabase(':memory:');
    expect(() => {
      db.prepare('INSERT INTO card_schedule (card_id, ef, interval_days, next_review_date, review_count, consecutive_correct) VALUES (?, ?, ?, ?, ?, ?)').run('nonexistent-card', 2.5, 1, '2026-03-12', 0, 0);
    }).toThrow(); // FOREIGN KEY constraint failed
    db.close();
  });

  it('索引已创建', () => {
    const db = initDatabase(':memory:');
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_cards_status');
    expect(indexNames).toContain('idx_cards_category');
    expect(indexNames).toContain('idx_schedule_next');
    expect(indexNames).toContain('idx_review_history_card');
    db.close();
  });

  it('migration: 已有 detail/feynman_seed 列时不报错', () => {
    const db = initDatabase(':memory:');
    // 第二次初始化同一 db 应该是幂等的
    // (对于 :memory: 每次都是新的实例，所以我们用文件测试)
    const testDir = path.join(os.tmpdir(), 'kb-schema-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
    const dbPath = path.join(testDir, 'test.sqlite');
    
    const db1 = initDatabase(dbPath);
    db1.close();
    
    // 再次初始化应该不报错
    expect(() => {
      const db2 = initDatabase(dbPath);
      db2.close();
    }).not.toThrow();
    
    fs.rmSync(testDir, { recursive: true, force: true });
    db.close();
  });

  it('空路径的父目录自动创建', () => {
    const testDir = path.join(os.tmpdir(), 'kb-schema-deepdir-' + Date.now(), 'deep', 'nested');
    const dbPath = path.join(testDir, 'test.sqlite');
    
    const db = initDatabase(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
    db.close();
    
    fs.rmSync(path.join(os.tmpdir(), 'kb-schema-deepdir-' + (dbPath.includes('kb-schema-deepdir-') ? dbPath.split('kb-schema-deepdir-')[1].split('/')[0] : '')), { recursive: true, force: true });
    // 清理
    const cleanDir = dbPath.split('/deep/')[0];
    if (cleanDir && fs.existsSync(cleanDir)) {
      fs.rmSync(cleanDir, { recursive: true, force: true });
    }
  });

  it('negative_feedback 表可插入无效 card_id（无外键约束）', () => {
    const db = initDatabase(':memory:');
    // negative_feedback.card_id 没有 NOT NULL + FK，应该允许任意值
    expect(() => {
      db.prepare('INSERT INTO negative_feedback (card_id, original_title, extracted_content, deleted_at) VALUES (?, ?, ?, ?)').run('any-id', 'title', 'content', '2026-03-12');
    }).not.toThrow();
    db.close();
  });

  it('review_history 表的外键约束', () => {
    const db = initDatabase(':memory:');
    expect(() => {
      db.prepare('INSERT INTO review_history (card_id, reviewed_at, rating) VALUES (?, ?, ?)').run('nonexistent', '2026-03-12', '会');
    }).toThrow(); // FOREIGN KEY constraint failed
    db.close();
  });

  it('cards 表的各列默认值', () => {
    const db = initDatabase(':memory:');
    // 手动插入一行查看默认值
    db.prepare('INSERT INTO cards (id, title, category, file_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('test-id', 'Test', 'programming', '/path', '2026-03-12', '2026-03-12');
    const row = db.prepare('SELECT * FROM cards WHERE id = ?').get('test-id') as any;
    expect(row.status).toBe('active'); // DEFAULT 'active'
    expect(row.priority).toBe('normal'); // DEFAULT 'normal'
    expect(row.detail).toBe(''); // DEFAULT ''
    expect(row.feynman_seed).toBe(''); // DEFAULT ''
    db.close();
  });
});
