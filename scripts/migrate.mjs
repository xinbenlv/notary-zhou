// 建表迁移。刻意用纯 JS 而非 TS：这个文件在服务启动时由 serve-static.mjs
// 直接 import，不经过任何构建步骤，不能依赖运行时的 TypeScript 剥离能力。
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 按文件名顺序应用 db/*.sql，已应用的跳过。
 * 每个文件在单独事务中执行：要么整体生效，要么整体回滚，
 * 不会留下「建了一半」的表结构。
 */
export async function migrate(dir = 'db') {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL 未设置');

  const pool = new pg.Pool({ connectionString, max: 2, connectionTimeoutMillis: 15_000 });
  const applied = [];
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await pool.query('SELECT filename FROM schema_migrations');
    const done = new Set(rows.map((r) => r.filename));

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(join(dir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`迁移 ${file} 失败: ${err.message}`);
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
  return applied;
}
