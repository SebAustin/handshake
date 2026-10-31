import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * Pooled Neon connection over WebSockets. The WebSocket driver (not neon-http)
 * is used because Deal saves need interactive transactions: a versioned
 * update plus its ledger event must commit or roll back together.
 */

export type Database = NeonDatabase<typeof schema>;

export function createDatabase(connectionString: string): { db: Database; close: () => Promise<void> } {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString });
  return { db: drizzle({ client: pool, schema }), close: () => pool.end() };
}

let shared: Database | undefined;

/** Process-wide database for route handlers. */
export function getDatabase(): Database {
  shared ??= createDatabase(process.env.DATABASE_URL ?? "").db;
  return shared;
}
