import { tool } from 'ai'
import { z } from 'zod'
import { resolveResourceId, datastoreSearch } from '../ckan'
import { metadata, num, str, type ToolMetadata } from './shared'

const PACKAGE = 'building-permits-active-permits'
const TTL = 86400

export const PermitArgs = z.object({
  status: z.string().optional().describe('Permit status filter, e.g. "Inspection", "Closed".'),
  permitType: z.string().optional().describe('Permit type filter.'),
  q: z.string().optional().describe('Free-text search across description, work and address.'),
  limit: z.coerce.number().int().min(1).max(500).default(20).describe('Max permits to return.'),
})

export interface PermitRow {
  permitNum: string
  type: string
  status: string
  work: string
  description: string
  address: string
  applicationDate: string
  issuedDate: string
  estConstCost: number | null
  dwellingUnitsCreated: number | null
}
export interface PermitResult {
  rows: PermitRow[]
  metadata: ToolMetadata
}

export async function getBuildingPermits(
  args: z.infer<typeof PermitArgs>
): Promise<PermitResult> {
  const resourceId = await resolveResourceId(PACKAGE)

  const filters: Record<string, string> = {}
  if (args.status) filters.STATUS = args.status
  if (args.permitType) filters.PERMIT_TYPE = args.permitType

  const res = await datastoreSearch({
    resourceId,
    filters: Object.keys(filters).length ? filters : undefined,
    q: args.q,
    limit: Math.min(args.limit, 20),
    ttlSeconds: TTL,
  })

  const rows: PermitRow[] = res.records.map((r) => ({
    permitNum: str(r.PERMIT_NUM),
    type: str(r.PERMIT_TYPE),
    status: str(r.STATUS),
    work: str(r.WORK),
    description: str(r.DESCRIPTION),
    address: [str(r.STREET_NUM), str(r.STREET_NAME), str(r.STREET_TYPE)].filter(Boolean).join(' '),
    applicationDate: str(r.APPLICATION_DATE),
    issuedDate: str(r.ISSUED_DATE),
    estConstCost: num(r.EST_CONST_COST),
    dwellingUnitsCreated: num(r.DWELLING_UNITS_CREATED),
  }))

  return {
    rows,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getBuildingPermitsTool = tool({
  description:
    'Get Toronto building permits, optionally filtered by status, type or free-text search. Use for questions about construction, development, zoning or permits.',
  inputSchema: PermitArgs,
  execute: getBuildingPermits,
})
