import { pool } from './db';

async function main() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('DB connected:', result.rows[0].now);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
