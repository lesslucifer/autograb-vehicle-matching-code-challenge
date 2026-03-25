import { Pool, QueryResultRow } from 'pg';

export class DbService {
  static readonly INST = new DbService()

  private pool = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'autograb',
    password: process.env.DB_PASSWORD ?? 'autograb',
    database: process.env.DB_NAME ?? 'autograb',
  });
  
  async query<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<T>(sql, params);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async close() {
    this.pool?.end()
  }
}
  