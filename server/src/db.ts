import pg from "pg";
import type { Config } from "./config.js";

const { Pool: PgPool } = pg;

export type RowDataPacket = Record<string, unknown>;

export type ResultHeader = {
  affectedRows: number;
};

/** mysql2-style `?` placeholders → Postgres `$1`, `$2`, … */
export function mysqlToPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => {
    n += 1;
    return `$${n}`;
  });
}

export function isSelectSql(sql: string): boolean {
  return /^\s*SELECT\b/i.test(sql);
}

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>;
};

async function execQuery<T>(
  client: Queryable,
  sql: string,
  params: unknown[] = [],
): Promise<[T]> {
  const result = await client.query(mysqlToPg(sql), params);
  if (isSelectSql(sql)) {
    return [result.rows as T];
  }
  return [{ affectedRows: result.rowCount ?? 0 } as T];
}

export class PoolConnection {
  constructor(private readonly client: pg.PoolClient) {}

  query<T = RowDataPacket[]>(sql: string, params?: unknown[]): Promise<[T]> {
    return execQuery<T>(this.client, sql, params);
  }

  async beginTransaction(): Promise<void> {
    await this.client.query("BEGIN");
  }

  async commit(): Promise<void> {
    await this.client.query("COMMIT");
  }

  async rollback(): Promise<void> {
    await this.client.query("ROLLBACK");
  }

  release(): void {
    this.client.release();
  }
}

export class Pool {
  private readonly inner: pg.Pool;

  constructor(config: Config) {
    const serverless = Boolean(process.env["VERCEL"]);
    this.inner = new PgPool({
      connectionString: config.DATABASE_URL,
      max: serverless ? 1 : 10,
      idleTimeoutMillis: serverless ? 5_000 : 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  query<T = RowDataPacket[]>(sql: string, params?: unknown[]): Promise<[T]> {
    return execQuery<T>(this.inner, sql, params);
  }

  async getConnection(): Promise<PoolConnection> {
    const client = await this.inner.connect();
    return new PoolConnection(client);
  }

  async end(): Promise<void> {
    await this.inner.end();
  }
}

export function createPool(config: Config): Pool {
  return new Pool(config);
}

export type Db = Pool | PoolConnection;
