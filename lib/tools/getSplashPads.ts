import { tool } from 'ai'
import { z } from 'zod'
import { resolveResourceId, datastoreSearch } from '../ckan'
import {
  metadata,
  str,
  geometryFeatureCollection,
  type ToolMetadata,
  type GeoFeatureCollection,
} from './shared'

const PACKAGE = 'parks-and-recreation-facilities'
const TTL = 604800 // locations rarely change → 7 days

export const SplashPadArgs = z.object({
  q: z
    .string()
    .optional()
    .describe('Free-text search across facility name, type, amenities and address (e.g. "pool", "park name").'),
  limit: z.coerce.number().int().min(1).max(500).default(40).describe('Max facilities to return.'),
})

export interface SplashPadRow {
  name: string
  type: string
  amenities: string
  address: string
  url: string
}
export interface SplashPadResult {
  rows: SplashPadRow[]
  geoJson: GeoFeatureCollection
  metadata: ToolMetadata
}

export async function getSplashPads(
  args: z.infer<typeof SplashPadArgs>
): Promise<SplashPadResult> {
  const resourceId = await resolveResourceId(PACKAGE)
  const res = await datastoreSearch({
    resourceId,
    q: args.q,
    limit: Math.min(args.limit, 40),
    ttlSeconds: TTL,
  })

  const rows: SplashPadRow[] = res.records.map((r) => ({
    name: str(r.ASSET_NAME),
    type: str(r.TYPE),
    amenities: str(r.AMENITIES),
    address: str(r.ADDRESS),
    url: str(r.URL),
  }))

  const geoJson = geometryFeatureCollection(res.records, 'geometry', (r) => ({
    name: str(r.ASSET_NAME),
    type: str(r.TYPE),
    address: str(r.ADDRESS),
  }))

  return {
    rows,
    geoJson,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getSplashPadsTool = tool({
  description:
    'Find Toronto parks and recreation facilities (parks, pools, splash pads, rinks) with addresses and map locations. Use for questions about parks, pools, splash pads or facilities near a place.',
  inputSchema: SplashPadArgs,
  execute: getSplashPads,
})
