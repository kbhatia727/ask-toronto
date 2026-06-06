import { Pool, type QueryResult, type QueryResultRow } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local.')
}

// Single shared pool for the whole app/process.
export const pool = new Pool({ connectionString })

/**
 * Parameterized query helper. Always pass values via `params` ($1, $2, ...) —
 * never string-concatenate user input into SQL.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: ReadonlyArray<unknown> = []
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params as unknown[])
  } catch (error) {
    throw new Error(
      `DB query failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

let schemaReady = false

/**
 * Create all tables if they don't exist. Idempotent and safe to call on every
 * request — the work only runs once per process.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS query_history (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        response TEXT,
        dataset_used TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS dataset_catalog (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        ckan_resource_id TEXT,
        tags TEXT[]
      );

      CREATE TABLE IF NOT EXISTS ckan_cache (
        cache_key TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        cached_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS eval_results (
        id SERIAL PRIMARY KEY,
        question_id TEXT,
        question TEXT,
        expected_dataset TEXT,
        actual_dataset TEXT,
        retrieval_correct BOOLEAN,
        tool_correct BOOLEAN,
        numeric_correct BOOLEAN,
        llm_quality_score INTEGER,
        run_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    schemaReady = true
  } catch (error) {
    throw new Error(
      `Schema init failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
