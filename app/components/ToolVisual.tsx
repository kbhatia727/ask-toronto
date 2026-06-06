'use client'

import type { ReactNode } from 'react'
import { Chart, type ChartDatum } from './Chart'
import { MapView, type GeoFeatureCollection } from './MapView'

interface ToolMeta {
  dataset?: string
  total?: number
  returned?: number
  fetchedAt?: string
  resourceId?: string
  cacheHit?: boolean
}

interface ToolOutput {
  rows?: Array<Record<string, unknown>>
  geoJson?: GeoFeatureCollection
  metadata?: ToolMeta
}

function isToolOutput(v: unknown): v is ToolOutput {
  return typeof v === 'object' && v !== null && ('rows' in v || 'geoJson' in v)
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

/** Source-attribution chips: where the data came from, how much, and how fresh. */
function Attribution({ meta }: { meta?: ToolMeta }) {
  if (!meta?.dataset) return null
  const fetched = meta.fetchedAt ? new Date(meta.fetchedAt) : null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400">
      <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
        Source: {meta.dataset}
      </span>
      {typeof meta.returned === 'number' && (
        <span>
          {meta.returned} rows
          {typeof meta.total === 'number' ? ` of ${meta.total.toLocaleString()}` : ''}
        </span>
      )}
      <span
        className={`rounded px-1 py-0.5 ${
          meta.cacheHit ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
        }`}
      >
        {meta.cacheHit ? 'cached' : 'live'}
      </span>
      {fetched && <span>· {fetched.toLocaleString()}</span>}
      {meta.resourceId && <span>· CKAN {meta.resourceId.slice(0, 8)}…</span>}
    </div>
  )
}

export function ToolVisual({
  toolName,
  output,
}: {
  toolName: string
  output: unknown
}) {
  if (!isToolOutput(output)) return null

  const rows = output.rows ?? []
  const hasGeo = !!output.geoJson && output.geoJson.features.length > 0
  let visual: ReactNode = null

  if (toolName === 'getCrimeData') {
    // Crime → ranked bar chart, plus a choropleth map of the whole city.
    const data: ChartDatum[] = rows
      .map((r) => ({ label: str(r.neighbourhood), value: num(r.count) }))
      .filter((d) => d.label.length > 0)
    visual = (
      <>
        <Chart data={data} title="Reported incidents by neighbourhood" />
        {hasGeo && <MapView geoJson={output.geoJson as GeoFeatureCollection} />}
      </>
    )
  } else if (hasGeo) {
    // Other geospatial datasets → map.
    visual = <MapView geoJson={output.geoJson as GeoFeatureCollection} />
  } else if (rows.length > 0) {
    // Fallback → compact table of the first few rows.
    const cols = Object.keys(rows[0] ?? {}).slice(0, 4)
    const preview = rows.slice(0, 6)
    visual = (
      <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-gray-700">
                    {str(r[c]).slice(0, 60)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > preview.length && (
          <p className="px-3 py-2 text-[11px] text-gray-400">
            Showing {preview.length} of {rows.length} rows
          </p>
        )}
      </div>
    )
  }

  if (!visual) return <Attribution meta={output.metadata} />

  return (
    <>
      {visual}
      <Attribution meta={output.metadata} />
    </>
  )
}
