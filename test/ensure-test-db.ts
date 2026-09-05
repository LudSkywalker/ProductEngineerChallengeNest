import { DataSource } from 'typeorm';

export async function ensureTestDatabase(): Promise<void> {
  const host = process.env.DB_HOST ?? 'localhost';
  const port = Number(process.env.DB_PORT ?? '5432');
  const user = process.env.DB_USER ?? 'postgres';
  const password = process.env.DB_PASSWORD ?? 'postgres';
  const database =
    process.env.DB_NAME ?? process.env.E2E_DB_NAME ?? 'challengedb_test';

  const maintenance = new DataSource({
    type: 'postgres',
    host,
    port,
    username: user,
    password,
    database: 'postgres',
    entities: [],
    synchronize: false,
  });

  await maintenance.initialize();

  try {
    const [rows] = await maintenance.query<Record<string, unknown>[]>(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );

    if (rows.length === 0) {
      const quotedDatabase = database.replace(/"/g, '""');
      await maintenance.query(`CREATE DATABASE "${quotedDatabase}"`);
    }
  } finally {
    await maintenance.destroy();
  }
}
