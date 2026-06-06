import { ensureSchema, query } from './db'

export const CKAN_BASE =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca'

// NOTE: Toronto has DISABLED the datastore_search_sql endpoint (returns 403/404).
// All reads must go through datastore_search with filters / q / limit.

export interface CkanField {
  id: string
  type: string
}

export type CkanRecord = Record<string, unknown>

export interface DatastoreSearchResult {
  total: number
  fields: CkanField[]
  records: CkanRecord[]
  /** True when this result came from the Postgres cache rather than a live CKAN fetch. */
  cacheHit: boolean
  /** The CKAN resource id that was queried. */
  resourceId: string
}

interface DatastoreSearchEnvelope {
  success: boolean
  result?: {
    total: number
    fields: CkanField[]
    records: CkanRecord[]
  }
  error?: unknown
}

interface PackageShowEnvelope {
  success: boolean
  result?: {
    resources: Array<{ id: string; datastore_active: boolean; name: string }>
  }
}

/**
 * Cache wrapper backed by the ckan_cache table. Returns cached JSON when a
 * non-expired entry exists, otherwise runs `fetcher`, stores the result with
 * the given TTL, and returns it.
 */
async function cachedFetch<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; cacheHit: boolean }> {
  await ensureSchema()

  const cached = await query<{ data: T }>(
    `SELECT data FROM ckan_cache WHERE cache_key = $1 AND expires_at > NOW()`,
    [cacheKey]
  )
  const hit = cached.rows[0]
  if (hit) return { data: hit.data, cacheHit: true }

  const fresh = await fetcher()

  await query(
    `INSERT INTO ckan_cache (cache_key, data, cached_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + ($3 || ' seconds')::interval)
     ON CONFLICT (cache_key)
     DO UPDATE SET data = EXCLUDED.data,
                   cached_at = NOW(),
                   expires_at = EXCLUDED.expires_at`,
    [cacheKey, JSON.stringify(fresh), String(ttlSeconds)]
  )

  return { data: fresh, cacheHit: false }
}

async function ckanGet<T>(path: string): Promise<T> {
  const url = `${CKAN_BASE}${path}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`CKAN request failed (${res.status}) for ${url}`)
  }
  return (await res.json()) as T
}

/**
 * Resolve a package slug to its datastore-active resource id. Resource ids are
 * stable but can change on republish, so cache for 7 days.
 */
export async function resolveResourceId(packageId: string): Promise<string> {
  const { data } = await cachedFetch(`resource_id:${packageId}`, 604800, async () => {
    const env = await ckanGet<PackageShowEnvelope>(
      `/api/3/action/package_show?id=${encodeURIComponent(packageId)}`
    )
    const resources = env.result?.resources ?? []
    const active = resources.find((r) => r.datastore_active)
    if (!active) {
      throw new Error(`No datastore-active resource for package "${packageId}"`)
    }
    return active.id
  })
  return data
}

export interface DatastoreSearchArgs {
  resourceId: string
  /** Exact-match field filters, e.g. { OFFENCE: "Assault" }. */
  filters?: Record<string, string | number>
  /** Free-text search across all fields. */
  q?: string
  limit?: number
  offset?: number
  /** Cache TTL in seconds (default 24h). */
  ttlSeconds?: number
}

/**
 * Query a datastore resource via datastore_search, with Postgres caching.
 */
export async function datastoreSearch(
  args: DatastoreSearchArgs
): Promise<DatastoreSearchResult> {
  const { resourceId, filters, q, limit = 100, offset = 0, ttlSeconds = 86400 } =
    args

  const params = new URLSearchParams()
  params.set('resource_id', resourceId)
  params.set('limit', String(limit))
  if (offset) params.set('offset', String(offset))
  if (q) params.set('q', q)
  if (filters && Object.keys(filters).length > 0) {
    params.set('filters', JSON.stringify(filters))
  }

  const path = `/api/3/action/datastore_search?${params.toString()}`
  const cacheKey = `search:${path}`

  const { data, cacheHit } = await cachedFetch(cacheKey, ttlSeconds, async () => {
    const env = await ckanGet<DatastoreSearchEnvelope>(path)
    if (!env.success || !env.result) {
      throw new Error(`datastore_search returned no result for ${resourceId}`)
    }
    return {
      total: env.result.total,
      fields: env.result.fields,
      records: env.result.records,
    }
  })
  return { ...data, cacheHit, resourceId }
}
