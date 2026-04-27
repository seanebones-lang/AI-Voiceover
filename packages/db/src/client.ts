import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

export type Database = ReturnType<typeof drizzle<typeof schema>>

let singleton: { db: Database; sql: ReturnType<typeof postgres> } | null = null

export function getDb(connectionString?: string): Database {
  const url = connectionString ?? process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is required for database access")
  }
  if (!singleton) {
    const sql = postgres(url, { max: 10, idle_timeout: 20, connect_timeout: 10 })
    singleton = { sql, db: drizzle(sql, { schema }) }
  }
  return singleton.db
}

/** Test / scripts: reset singleton (do not use in serverless hot path without care). */
export function resetDbSingleton(): void {
  if (singleton) {
    void singleton.sql.end({ timeout: 5 })
    singleton = null
  }
}
