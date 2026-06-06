import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { generateText } from 'ai'
import { chatModel } from '../lib/llm'
import { buildRoutedAgent } from '../lib/agent'
import { ensureSchema, query, pool } from '../lib/db'

interface BenchmarkItem {
  id: string
  question: string
  expected_dataset: string
  expected_tool: string
  expected_answer_contains: string[]
}

interface Scored {
  id: string
  question: string
  expected_dataset: string
  actual_dataset: string
  retrieval_correct: boolean
  tool_correct: boolean
  numeric_correct: boolean
  llm_quality_score: number
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const BENCH_PATH = join(__dirname, '..', 'evals', 'benchmark_questions.json')
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? '1200')

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Retry on Gemini free-tier rate limits (5 req/min). On a quota/rate error we
 * wait ~62s for the window to reset, then retry.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRate = /quota|rate.?limit|429|exceeded/i.test(msg)
      if (!isRate || attempt >= retries) throw err
      process.stdout.write('  (rate limited, waiting 62s)\n')
      await sleep(62_000)
    }
  }
}

/** Significant numbers in a string, excluding 4-digit years. */
function significantNumbers(s: string): string[] {
  const matches = s.match(/\d[\d,]*(\.\d+)?/g) ?? []
  return matches
    .map((m) => m.replace(/,/g, ''))
    .filter((n) => !/^(19|20)\d{2}$/.test(n))
}

/** LLM-as-judge: score answer quality 1–5 given the question and expected keywords. */
async function judge(
  question: string,
  answer: string,
  expectedContains: string[]
): Promise<number> {
  try {
    const { text } = await withRetry(() => generateText({
      model: chatModel,
      system:
        'You are a strict grader of a data assistant. Score how well the ANSWER addresses the QUESTION ' +
        'using concrete, grounded data. 5 = accurate, specific, directly answers. 1 = wrong, vague, or empty. ' +
        'Respond with ONLY a single integer from 1 to 5, no other text.',
      prompt:
        `QUESTION: ${question}\n` +
        (expectedContains.length ? `SHOULD MENTION: ${expectedContains.join(', ')}\n` : '') +
        `ANSWER: ${answer}`,
    }))
    const m = text.match(/[1-5]/)
    return m ? Number(m[0]) : 0
  } catch {
    return 0
  }
}

async function scoreOne(item: BenchmarkItem): Promise<Scored> {
  const routed = await withRetry(() => buildRoutedAgent(item.question))
  const actualDataset = routed?.match.id ?? 'none'
  const retrieval_correct = actualDataset === item.expected_dataset

  let tool_correct = false
  let numeric_correct = false
  let answer = ''

  if (routed) {
    const result = await withRetry(() => routed.agent.generate({ prompt: item.question }))
    answer = result.text

    const calledTools = result.steps.flatMap((s) =>
      s.toolCalls.map((tc) => tc.toolName)
    )
    tool_correct = calledTools.includes(item.expected_tool)

    const outputs = result.steps.flatMap((s) =>
      s.toolResults.map((tr) => (tr as { output: unknown }).output)
    )
    const outNums = new Set(significantNumbers(JSON.stringify(outputs)))
    const ansNums = significantNumbers(answer)
    // Grounded if the answer states no numbers, or its numbers appear in tool output.
    numeric_correct = ansNums.length === 0 || ansNums.some((n) => outNums.has(n))
  }

  const llm_quality_score = await judge(item.question, answer, item.expected_answer_contains)

  return {
    id: item.id,
    question: item.question,
    expected_dataset: item.expected_dataset,
    actual_dataset: actualDataset,
    retrieval_correct,
    tool_correct,
    numeric_correct,
    llm_quality_score,
  }
}

async function main(): Promise<void> {
  const raw = await readFile(BENCH_PATH, 'utf-8')
  const items = JSON.parse(raw) as BenchmarkItem[]
  await ensureSchema()

  console.log(`Running ${items.length} benchmark questions...\n`)
  const scored: Scored[] = []

  for (const item of items) {
    try {
      const s = await scoreOne(item)
      scored.push(s)
      const flags = [
        s.retrieval_correct ? 'R' : '-',
        s.tool_correct ? 'T' : '-',
        s.numeric_correct ? 'N' : '-',
      ].join('')
      console.log(
        `${s.id}  [${flags}] q=${s.llm_quality_score}  ${s.actual_dataset}` +
          `${s.retrieval_correct ? '' : ` (expected ${s.expected_dataset})`}`
      )

      await query(
        `INSERT INTO eval_results
           (question_id, question, expected_dataset, actual_dataset,
            retrieval_correct, tool_correct, numeric_correct, llm_quality_score)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          s.id, s.question, s.expected_dataset, s.actual_dataset,
          s.retrieval_correct, s.tool_correct, s.numeric_correct, s.llm_quality_score,
        ]
      )
    } catch (err) {
      console.error(`${item.id}  ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
    await sleep(DELAY_MS)
  }

  const n = scored.length || 1
  const pct = (k: keyof Scored) =>
    Math.round((scored.filter((s) => s[k] === true).length / n) * 100)
  const avgQuality =
    Math.round((scored.reduce((sum, s) => sum + s.llm_quality_score, 0) / n) * 100) / 100

  console.log('\n=== Summary ===')
  console.log(`Questions scored:    ${scored.length}/${items.length}`)
  console.log(`Retrieval accuracy:  ${pct('retrieval_correct')}%  (target ≥ 90%)`)
  console.log(`Tool accuracy:       ${pct('tool_correct')}%`)
  console.log(`Numeric grounding:   ${pct('numeric_correct')}%`)
  console.log(`Avg LLM quality:     ${avgQuality}/5`)

  await pool.end()
}

main().catch((err: unknown) => {
  console.error('EVAL RUN FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
})
