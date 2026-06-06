import { google } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { embed } from 'ai'

const groq = createGroq()

// Chat/agent model: Groq (free tier ~14,400 req/day, 30 RPM) — the Gemini free
// tier only allows ~20 generate_content req/day, which is too low for real use.
// To switch back to Gemini: export const chatModel = google('gemini-2.5-flash').
export const chatModel = groq('llama-3.3-70b-versatile')

// Embeddings stay on Gemini (Groq has no embeddings API). This key exposes
// gemini-embedding-001; we request 768 dims to match the Qdrant collection.
// Embeddings use a separate, higher daily quota than chat.
export const embeddingModel = google.textEmbeddingModel('gemini-embedding-001')

export { groq }

export async function embedText(text: string): Promise<number[]> {
  try {
    const { embedding } = await embed({
      model: embeddingModel,
      value: text,
      providerOptions: {
        google: { outputDimensionality: 768 },
      },
    })
    return embedding
  } catch (error) {
    throw new Error(
      `Embedding failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
