import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'autograb',
  password: process.env.DB_PASSWORD ?? 'autograb',
  database: process.env.DB_NAME ?? 'autograb',
});
