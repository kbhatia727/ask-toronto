import { tool } from 'ai'
import { z } from 'zod'
import { resolveResourceId, datastoreSearch } from '../ckan'
import {
  metadata,
  num,
  str,
  pointFeatureCollection,
  type ToolMetadata,
  type GeoFeatureCollection,
} from './shared'

const PACKAGE = 'dinesafe'
const TTL = 86400

export const DinesafeArgs = z.object({
  status: z
    .enum(['Pass', 'Conditional Pass', 'Closed'])
    .optional()
    .describe('Inspection status filter.'),
  q: z.string().optional().describe('Free-text search across establishment name and address.'),
  limit: z.coerce.number().int().min(1).max(500).default(25).describe('Max inspection records to return.'),
})

export interface DinesafeRow {
  name: string
  address: string
  status: string
  date: string
  type: string
  deficiency: string
  action: string
  amountFined: number | null
}
export interface DinesafeResult {
  rows: DinesafeRow[]
  geoJson: GeoFeatureCollection
  metadata: ToolMetadata
}

export async function getDinesafe(
  args: z.infer<typeof DinesafeArgs>
): Promise<DinesafeResult> {
  const resourceId = await resolveResourceId(PACKAGE)

  const filters: Record<string, string> = {}
  if (args.status) filters.inspectionStatus = args.status

  const res = await datastoreSearch({
    resourceId,
    filters: Object.keys(filters).length ? filters : undefined,
    q: args.q,
    limit: Math.min(args.limit, 25),
    ttlSeconds: TTL,
  })

  const rows: DinesafeRow[] = res.records.map((r) => ({
    name: str(r.estName),
    address: str(r.address),
    status: str(r.inspectionStatus),
    date: str(r.inspectionDate),
    type: str(r.typeDesc),
    deficiency: str(r.deficiencyDesc),
    action: str(r.actionDesc),
    amountFined: num(r.amountFined),
  }))

  const geoJson = pointFeatureCollection(res.records, 'latitude', 'longitude', (r) => ({
    name: str(r.estName),
    status: str(r.inspectionStatus),
    address: str(r.address),
  }))

  return {
    rows,
    geoJson,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getDinesafeTool = tool({
  description:
    'Get Toronto Dinesafe food premises inspection results, optionally filtered by status (Pass/Conditional Pass/Closed) or establishment name. Use for questions about restaurant inspections or food safety.',
  inputSchema: DinesafeArgs,
  execute: getDinesafe,
})
