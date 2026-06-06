import { QdrantClient } from '@qdrant/js-client-rest'
import { embedText } from './llm'

export const QDRANT_COLLECTION = 'datasets'
export const EMBEDDING_DIM = 768

const url = process.env.QDRANT_URL ?? 'http://localhost:6333'
export const qdrant = new QdrantClient({ url })

/** Payload stored alongside each dataset vector in Qdrant. */
export interface DatasetPayload {
  id: string
  name: string
  description: string
  tool: string
  ckanPackageId: string
  ckanResourceId: string
  cacheTtlSeconds: number
}

export interface DatasetMatch extends DatasetPayload {
  score: number
}

/**
 * Text used to build the embedding for a dataset. Combining name + description
 * + tags gives the retriever the most surface area to match a question against.
 */
export function datasetEmbeddingText(p: {
  name: string
  description: string
  tags: string[]
}): string {
  return `${p.name}. ${p.description} Keywords: ${p.tags.join(', ')}.`
}

/**
 * Embed a question and return the best-matching dataset(s) from Qdrant.
 * This is the router step: the top match decides which single tool the agent gets.
 */
export async function retrieveDatasets(
  question: string,
  limit = 2
): Promise<DatasetMatch[]> {
  try {
    const vector = await embedText(question)
    const results = await qdrant.search(QDRANT_COLLECTION, {
      vector,
      limit,
      with_payload: true,
    })
    return results.map((r) => {
      const payload = (r.payload ?? {}) as unknown as DatasetPayload
      return { ...payload, score: r.score }
    })
  } catch (error) {
    throw new Error(
      `RAG retrieval failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/** Convenience: the single best dataset match for the router pattern. */
export async function retrieveBestDataset(
  question: string
): Promise<DatasetMatch | null> {
  const matches = await retrieveDatasets(question, 1)
  return matches[0] ?? null
}
