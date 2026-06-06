import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  createAgentUIStream,
} from 'ai'
import { buildRoutedAgent } from '@/lib/agent'
import { ensureSchema, query } from '@/lib/db'

export const runtime = 'nodejs'

interface UIPart {
  type: string
  text?: string
}
interface UIMessage {
  role: string
  parts?: UIPart[]
}

/** Pull the latest user message's text out of the UI messages array. */
function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && m.role === 'user' && Array.isArray(m.parts)) {
      return m.parts
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join(' ')
        .trim()
    }
  }
  return ''
}

/** Safely assemble assistant answer text from a response UI message. */
function extractText(responseMessage: unknown): string {
  if (
    responseMessage &&
    typeof responseMessage === 'object' &&
    'parts' in responseMessage &&
    Array.isArray((responseMessage as { parts: unknown }).parts)
  ) {
    const parts = (responseMessage as { parts: UIPart[] }).parts
    return parts
      .filter((p) => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('')
  }
  return ''
}

/**
 * Keep only the text parts of each message. The router gives the agent a different
 * tool per question, so previous turns' tool-call/tool-result parts (and our custom
 * data-routing part) would reference tools that aren't in the current agent's tool
 * set. Strict providers (Groq) reject that with "Failed to call a function". Stripping
 * to text preserves conversational context without orphaned tool calls.
 */
function textOnlyHistory(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((m) => ({
      ...m,
      parts: (m.parts ?? []).filter((p) => p.type === 'text'),
    }))
    .filter((m) => (m.parts?.length ?? 0) > 0)
}

export async function POST(req: Request): Promise<Response> {
  try {
    const { messages } = (await req.json()) as { messages: UIMessage[] }
    const question = latestUserText(messages)

    if (!question) {
      return new Response(JSON.stringify({ error: 'No user message found.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const routed = await buildRoutedAgent(question)
    if (!routed) {
      return new Response(
        JSON.stringify({ error: 'No matching Toronto dataset for this question.' }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const datasetUsed = routed.match.id

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Emit the RAG routing decision (matched dataset + confidence) as a custom
        // data part so the UI can show a "matched X · 0.78" badge (#3).
        writer.write({
          type: 'data-routing',
          data: {
            id: routed.match.id,
            name: routed.match.name,
            score: routed.match.score,
            tool: routed.toolName,
          },
        })

        const agentStream = await createAgentUIStream({
          agent: routed.agent,
          uiMessages: textOnlyHistory(messages),
          onFinish: async ({ responseMessage }) => {
            try {
              await ensureSchema()
              await query(
                `INSERT INTO query_history (question, response, dataset_used)
                 VALUES ($1, $2, $3)`,
                [question, extractText(responseMessage), datasetUsed]
              )
            } catch {
              // history logging must never break the response
            }
          },
        })
        writer.merge(agentStream)
      },
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
