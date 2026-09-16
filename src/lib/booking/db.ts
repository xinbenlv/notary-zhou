// 应用代码用的 Postgres 连接池。
// 建表迁移不在这里——它在服务启动时由 scripts/migrate.mjs 执行（纯 JS，
// 不经构建步骤）。Railway 的 DATABASE_URL 指向私网域名，本机无法解析，
// 所以迁移只能从应用内部跑。

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL 未设置');
    pool = new Pool({
      connectionString,
      max: 5,                       // 单实例静态站，不需要大连接池
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}
