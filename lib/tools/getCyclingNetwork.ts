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

const PACKAGE = 'cycling-network'
const TTL = 86400

export const CyclingArgs = z.object({
  q: z
    .string()
    .optional()
    .describe('Free-text search across street name and infrastructure type (e.g. "Bloor", "cycle track").'),
  limit: z.coerce.number().int().min(1).max(1581).default(50).describe('Max segments to return.'),
})

export interface CyclingRow {
  segmentId: string
  street: string
  fromStreet: string
  toStreet: string
  installed: string
  infrastructure: string
  surface: string
}
export interface CyclingResult {
  rows: CyclingRow[]
  geoJson: GeoFeatureCollection
  metadata: ToolMetadata
}

export async function getCyclingNetwork(
  args: z.infer<typeof CyclingArgs>
): Promise<CyclingResult> {
  const resourceId = await resolveResourceId(PACKAGE)
  const res = await datastoreSearch({
    resourceId,
    q: args.q,
    limit: Math.min(args.limit, 50),
    ttlSeconds: TTL,
  })

  const rows: CyclingRow[] = res.records.map((r) => ({
    segmentId: str(r.SEGMENT_ID),
    street: str(r.STREET_NAME),
    fromStreet: str(r.FROM_STREET),
    toStreet: str(r.TO_STREET),
    installed: str(r.INSTALLED),
    infrastructure: str(r.INFRA_HIGHORDER) || str(r.INFRA_LOWORDER),
    surface: str(r.SURFACE),
  }))

  const geoJson = geometryFeatureCollection(
    res.records,
    'geometry',
    (r) => ({
      street: str(r.STREET_NAME),
      infrastructure: str(r.INFRA_HIGHORDER) || str(r.INFRA_LOWORDER),
      installed: str(r.INSTALLED),
    }),
    2
  )

  return {
    rows,
    geoJson,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getCyclingNetworkTool = tool({
  description:
    'Get Toronto cycling network segments (bike lanes, cycle tracks, trails) with street names and map geometry. Use for questions about bike lanes, cycling infrastructure or bicycle routes.',
  inputSchema: CyclingArgs,
  execute: getCyclingNetwork,
})
