import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { embedText } from '../lib/llm'
import {
  qdrant,
  QDRANT_COLLECTION,
  EMBEDDING_DIM,
  datasetEmbeddingText,
  type DatasetPayload,
} from '../lib/rag'
import { ensureSchema, query, pool } from '../lib/db'

interface CatalogEntry extends DatasetPayload {
  tags: string[]
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = join(__dirname, '..', 'data', 'dataset_catalog.json')

async function loadCatalog(): Promise<CatalogEntry[]> {
  const raw = await readFile(CATALOG_PATH, 'utf-8')
  return JSON.parse(raw) as CatalogEntry[]
}

async function recreateCollection(): Promise<void> {
  const existing = await qdrant.getCollections()
  if (existing.collections.some((c) => c.name === QDRANT_COLLECTION)) {
    await qdrant.deleteCollection(QDRANT_COLLECTION)
  }
  await qdrant.createCollection(QDRANT_COLLECTION, {
    vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
  })
}

async function main(): Promise<void> {
  const catalog = await loadCatalog()
  console.log(`Loaded ${catalog.length} datasets from catalog.`)

  await recreateCollection()
  console.log(`Recreated Qdrant collection "${QDRANT_COLLECTION}" (${EMBEDDING_DIM} dims).`)

  await ensureSchema()

  for (let i = 0; i < catalog.length; i++) {
    const d = catalog[i]
    if (!d) continue

    const vector = await embedText(
      datasetEmbeddingText({ name: d.name, description: d.description, tags: d.tags })
    )

    await qdrant.upsert(QDRANT_COLLECTION, {
      points: [
        {
          id: i,
          vector,
          payload: {
            id: d.id,
            name: d.name,
            description: d.description,
            tool: d.tool,
            ckanPackageId: d.ckanPackageId,
            ckanResourceId: d.ckanResourceId,
            cacheTtlSeconds: d.cacheTtlSeconds,
          },
        },
      ],
    })

    // Mirror into Postgres dataset_catalog (queryable metadata).
    await query(
      `INSERT INTO dataset_catalog (id, name, description, ckan_resource_id, tags)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         ckan_resource_id = EXCLUDED.ckan_resource_id,
         tags = EXCLUDED.tags`,
      [d.id, d.name, d.description, d.ckanResourceId, d.tags]
    )

    console.log(`  [${i + 1}/${catalog.length}] embedded + upserted: ${d.id}`)
  }

  const info = await qdrant.getCollection(QDRANT_COLLECTION)
  console.log(`Done. Qdrant reports ${info.points_count} points.`)

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('INGEST FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
