import { tool } from 'ai'
import { z } from 'zod'
import { resolveResourceId, datastoreSearch } from '../ckan'
import {
  metadata,
  num,
  str,
  geometryFeatureCollection,
  type ToolMetadata,
  type GeoFeatureCollection,
} from './shared'

const PACKAGE = 'neighbourhood-crime-rates'
const TTL = 86400

// Maps friendly offence names to the dataset's column prefixes.
const OFFENCE_PREFIX = {
  assault: 'ASSAULT',
  'break-in': 'BREAKENTER',
  breakenter: 'BREAKENTER',
  robbery: 'ROBBERY',
  'auto-theft': 'AUTOTHEFT',
  autotheft: 'AUTOTHEFT',
  'bike-theft': 'BIKETHEFT',
  homicide: 'HOMICIDE',
  shooting: 'SHOOTING',
  'theft-over': 'THEFTOVER',
  'theft-from-vehicle': 'THEFTFROMMV',
} as const

export const CrimeArgs = z.object({
  offence: z
    .enum(Object.keys(OFFENCE_PREFIX) as [string, ...string[]])
    .describe('Type of crime, e.g. "break-in", "assault", "robbery", "auto-theft".'),
  year: z.coerce
    .number()
    .int()
    .min(2014)
    .max(2025)
    .describe('Year of the crime counts (2014–2025).'),
  neighbourhood: z
    .string()
    .optional()
    .describe('Optional neighbourhood name to filter to a single area.'),
  topN: z.coerce.number().int().min(1).max(158).default(10).describe('How many top neighbourhoods to return.'),
})

export interface CrimeRow {
  neighbourhood: string
  hoodId: string
  count: number
}
export interface CrimeResult {
  rows: CrimeRow[]
  /** Neighbourhood polygons shaded by the queried offence count (choropleth). */
  geoJson: GeoFeatureCollection
  metadata: ToolMetadata
}

export async function getCrimeData(
  args: z.infer<typeof CrimeArgs>
): Promise<CrimeResult> {
  const prefix = OFFENCE_PREFIX[args.offence as keyof typeof OFFENCE_PREFIX]
  const column = `${prefix}_${args.year}`

  const resourceId = await resolveResourceId(PACKAGE)
  const res = await datastoreSearch({ resourceId, limit: 200, ttlSeconds: TTL })

  let rows: CrimeRow[] = res.records
    .map((r) => ({
      neighbourhood: str(r.AREA_NAME),
      hoodId: str(r.HOOD_ID),
      count: num(r[column]) ?? 0,
    }))
    .filter((r) => r.neighbourhood.length > 0)

  if (args.neighbourhood) {
    const needle = args.neighbourhood.toLowerCase()
    rows = rows.filter((r) => r.neighbourhood.toLowerCase().includes(needle))
  }

  rows.sort((a, b) => b.count - a.count)
  rows = rows.slice(0, args.topN)

  // Choropleth scoped to the top neighbourhoods shown in the chart, with decimated
  // polygon geometry. Keeps the payload small enough to stay within model token limits.
  const topNames = new Set(rows.slice(0, 12).map((r) => r.neighbourhood))
  const topRecords = res.records.filter((r) => topNames.has(str(r.AREA_NAME)))
  const geoJson = geometryFeatureCollection(
    topRecords,
    'geometry',
    (r) => ({ name: str(r.AREA_NAME), value: num(r[column]) ?? 0 }),
    3
  )

  return {
    rows,
    geoJson,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getCrimeDataTool = tool({
  description:
    'Get neighbourhood crime counts for a specific offence and year, ranked by count. Use for questions about break-ins, assaults, robberies, auto theft, shootings, etc. by Toronto neighbourhood.',
  inputSchema: CrimeArgs,
  execute: getCrimeData,
})
