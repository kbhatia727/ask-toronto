import { tool } from 'ai'
import { z } from 'zod'
import { resolveResourceId, datastoreSearch } from '../ckan'
import { metadata, num, str, type ToolMetadata } from './shared'

const PACKAGE = 'ttc-subway-delay-data'
const TTL = 900 // TTC updates frequently → 15 min

export const TtcArgs = z.object({
  line: z
    .enum(['YU', 'BD', 'SHP', 'SRT'])
    .optional()
    .describe('Subway line code: YU (Yonge-University), BD (Bloor-Danforth), SHP (Sheppard), SRT (Scarborough).'),
  station: z.string().optional().describe('Optional station name to search for.'),
  limit: z.coerce.number().int().min(1).max(1000).default(60).describe('Max delay records to fetch.'),
})

export interface TtcRow {
  date: string
  time: string
  station: string
  line: string
  code: string
  minDelay: number
  bound: string
}
export interface TtcResult {
  rows: TtcRow[]
  summary: { totalDelayMinutes: number; avgDelayMinutes: number; incidentCount: number }
  metadata: ToolMetadata
}

export async function getTtcDelays(
  args: z.infer<typeof TtcArgs>
): Promise<TtcResult> {
  const resourceId = await resolveResourceId(PACKAGE)

  const filters: Record<string, string> = {}
  if (args.line) filters.Line = args.line

  const res = await datastoreSearch({
    resourceId,
    filters: Object.keys(filters).length ? filters : undefined,
    q: args.station,
    limit: Math.min(args.limit, 60),
    ttlSeconds: TTL,
  })

  const rows: TtcRow[] = res.records.map((r) => ({
    date: str(r.Date),
    time: str(r.Time),
    station: str(r.Station),
    line: str(r.Line),
    code: str(r.Code),
    minDelay: num(r['Min Delay']) ?? 0,
    bound: str(r.Bound),
  }))

  const totalDelay = rows.reduce((sum, r) => sum + r.minDelay, 0)
  const summary = {
    totalDelayMinutes: totalDelay,
    avgDelayMinutes: rows.length ? Math.round((totalDelay / rows.length) * 10) / 10 : 0,
    incidentCount: rows.length,
  }

  return {
    rows,
    summary,
    metadata: metadata(PACKAGE, res.total, rows.length, { resourceId, cacheHit: res.cacheHit }),
  }
}

export const getTtcDelaysTool = tool({
  description:
    'Get TTC subway delay incidents, optionally filtered by line or station. Returns individual delay records plus a summary (total/average delay minutes). Use for questions about transit/subway delays.',
  inputSchema: TtcArgs,
  execute: getTtcDelays,
})
