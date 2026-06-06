import type { CkanRecord } from '../ckan'

/** Standard metadata returned by every tool. */
export interface ToolMetadata {
  dataset: string
  fetchedAt: string
  total: number
  returned: number
  /** CKAN resource id the data came from (for source attribution). */
  resourceId?: string
  /** Whether the data was served from cache (true) or fetched live (false). */
  cacheHit?: boolean
}

// Minimal GeoJSON types (avoids a @types/geojson dependency).
export interface GeoFeature {
  type: 'Feature'
  geometry: unknown
  properties: Record<string, unknown>
}
export interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

/** Coerce a CKAN value to a number, or null if not numeric. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v))
  return Number.isFinite(n) ? n : null
}

/** Coerce a CKAN value to a trimmed string, or '' if nullish. */
export function str(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

export function metadata(
  dataset: string,
  total: number,
  returned: number,
  opts?: { resourceId?: string; cacheHit?: boolean }
): ToolMetadata {
  return { dataset, fetchedAt: new Date().toISOString(), total, returned, ...opts }
}

/** Build a FeatureCollection from records carrying lat/lon fields. */
export function pointFeatureCollection(
  records: CkanRecord[],
  latField: string,
  lonField: string,
  toProps: (r: CkanRecord) => Record<string, unknown>
): GeoFeatureCollection {
  const features: GeoFeature[] = []
  for (const r of records) {
    const lat = num(r[latField])
    const lon = num(r[lonField])
    if (lat === null || lon === null) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: toProps(r),
    })
  }
  return { type: 'FeatureCollection', features }
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5

/**
 * Process GeoJSON coordinates: round to ~5 decimals (~1m) and optionally decimate
 * dense rings/lines (keep every Nth vertex, always keeping the last for closure).
 * Toronto geometry ships at 13 decimals with hundreds of vertices — far more than a
 * city-scale map needs, and far too large to feed back to a token-limited LLM.
 */
function processCoords(c: unknown, everyNth: number): unknown {
  if (!Array.isArray(c)) return c
  // A coordinate pair: [lng, lat].
  if (typeof c[0] === 'number') return (c as number[]).map(round5)
  // A ring or line: array of coordinate pairs.
  if (Array.isArray(c[0]) && typeof (c[0] as unknown[])[0] === 'number') {
    let points = c as number[][]
    if (everyNth > 1 && points.length > 6) {
      points = points.filter((_, i) => i % everyNth === 0 || i === points.length - 1)
    }
    return points.map((p) => p.map(round5))
  }
  // Deeper nesting (polygon rings, multipolygons).
  return (c as unknown[]).map((x) => processCoords(x, everyNth))
}

/**
 * Build a FeatureCollection from records carrying a GeoJSON-string geometry field.
 * `everyNth` decimates dense line/polygon geometry (e.g. 3 = keep ~1/3 of vertices).
 */
export function geometryFeatureCollection(
  records: CkanRecord[],
  geometryField: string,
  toProps: (r: CkanRecord) => Record<string, unknown>,
  everyNth = 1
): GeoFeatureCollection {
  const features: GeoFeature[] = []
  for (const r of records) {
    const raw = r[geometryField]
    if (typeof raw !== 'string' || raw.length === 0) continue
    try {
      const geometry = JSON.parse(raw) as { coordinates?: unknown }
      if (geometry && typeof geometry === 'object' && 'coordinates' in geometry) {
        geometry.coordinates = processCoords(geometry.coordinates, everyNth)
      }
      features.push({ type: 'Feature', geometry, properties: toProps(r) })
    } catch {
      // skip rows with unparseable geometry
    }
  }
  return { type: 'FeatureCollection', features }
}
