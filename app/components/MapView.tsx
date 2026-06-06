'use client'

import { useEffect, useMemo, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'

export interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: unknown
    properties: Record<string, unknown>
  }>
}

// OpenStreetMap raster tiles — no API key required.
const STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
}

const RAMP_LOW = '#dbeafe'
const RAMP_HIGH = '#1e3a8a'

export function MapView({ geoJson }: { geoJson: GeoFeatureCollection }) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect choropleth (polygons carrying a numeric `value`) and its max, for
  // the colour ramp and legend.
  const choropleth = useMemo(() => {
    let max = 0
    let has = false
    for (const f of geoJson.features) {
      const t = (f.geometry as { type?: string }).type
      const v = f.properties?.value
      if ((t === 'Polygon' || t === 'MultiPolygon') && typeof v === 'number') {
        has = true
        if (v > max) max = v
      }
    }
    return { has, max }
  }, [geoJson])

  useEffect(() => {
    if (!containerRef.current || geoJson.features.length === 0) return
    let cancelled = false
    let map: import('maplibre-gl').Map | null = null
    const maxValue = Math.max(choropleth.max, 1)

    void (async () => {
      const maplibregl = (await import('maplibre-gl')).default
      if (cancelled || !containerRef.current) return

      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [-79.38, 43.65],
        zoom: 10,
        attributionControl: { compact: true },
      })

      map.on('load', () => {
        if (!map) return
        map.addSource('data', { type: 'geojson', data: geoJson as never })

        // Choropleth fill for polygons, shaded by `value`.
        map.addLayer({
          id: 'fill',
          type: 'fill',
          source: 'data',
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'value'], 0],
              0,
              RAMP_LOW,
              maxValue,
              RAMP_HIGH,
            ],
            'fill-opacity': 0.7,
          },
        })
        map.addLayer({
          id: 'fill-outline',
          type: 'line',
          source: 'data',
          filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
          paint: { 'line-color': '#ffffff', 'line-width': 0.6 },
        })

        map.addLayer({
          id: 'lines',
          type: 'line',
          source: 'data',
          filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
          paint: { 'line-color': '#2563eb', 'line-width': 3 },
        })
        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'data',
          filter: ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]],
          paint: {
            'circle-radius': 6,
            'circle-color': '#dc2626',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        })

        // Fit to feature bounds — recursive walk handles points, lines and polygons.
        const bounds = new maplibregl.LngLatBounds()
        let has = false
        const extend = (coords: unknown): void => {
          if (!Array.isArray(coords)) return
          if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
            bounds.extend(coords as [number, number])
            has = true
          } else {
            for (const c of coords) extend(c)
          }
        }
        for (const f of geoJson.features) {
          extend((f.geometry as { coordinates?: unknown }).coordinates)
        }
        if (has) map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 0 })
      })
    })()

    return () => {
      cancelled = true
      if (map) map.remove()
    }
  }, [geoJson, choropleth])

  if (geoJson.features.length === 0) return null

  return (
    <div className="relative mt-3">
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-xl border border-gray-200"
      />
      {choropleth.has && (
        <div className="absolute bottom-3 right-3 rounded-lg bg-white/90 px-2 py-1.5 text-[10px] text-gray-600 shadow">
          <div className="mb-1 font-medium">Incidents</div>
          <div className="flex items-center gap-1">
            <span>0</span>
            <span
              className="h-2 w-16 rounded"
              style={{ background: `linear-gradient(to right, ${RAMP_LOW}, ${RAMP_HIGH})` }}
            />
            <span>{choropleth.max}</span>
          </div>
        </div>
      )}
    </div>
  )
}
