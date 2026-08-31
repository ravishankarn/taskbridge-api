import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../src/scripts/init-db';

describe('initializeDatabase', () => {
  const testDbDir = path.join(__dirname, 'temp-db-test');
  const testDbPath = path.join(testDbDir, 'test.sqlite');

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbDir)) {
      fs.rmdirSync(testDbDir);
    }
  });

  it('creates directory, initializes sqlite db file and runs migrations', () => {
    expect(fs.existsSync(testDbDir)).toBe(false);

    initializeDatabase(testDbPath);

    expect(fs.existsSync(testDbPath)).toBe(true);

    const sqlite = new Database(testDbPath);
    const tableInfo = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .get() as { name: string } | undefined;
    sqlite.close();

    expect(tableInfo).toBeDefined();
    expect(tableInfo?.name).toBe('projects');
  });
});
