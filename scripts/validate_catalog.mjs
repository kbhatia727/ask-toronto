/**
 * CI check: the RAG dataset catalog and the eval golden set must stay in sync.
 *
 * Runs on plain Node (no dependencies) so CI can validate the data contract
 * without installing the app. Writes a machine- and human-readable report to
 * ci-report/ so the workflow can publish it as a build artifact.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportDir = join(repoRoot, 'ci-report')

const EXPECTED_DATASET_COUNT = 6
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** @type {{ name: string, passed: boolean, detail: string }[]} */
const checks = []

function check(name, fn) {
  try {
    const detail = fn() ?? 'ok'
    checks.push({ name, passed: true, detail })
    console.log(`PASS  ${name} — ${detail}`)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    checks.push({ name, passed: false, detail })
    console.error(`FAIL  ${name} — ${detail}`)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readJson(relPath) {
  try {
    return JSON.parse(readFileSync(join(repoRoot, relPath), 'utf8'))
  } catch (err) {
    throw new Error(`could not read ${relPath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

const catalog = readJson('data/dataset_catalog.json')
const golden = readJson('evals/benchmark_questions.json')
const catalogIds = new Set(catalog.map((d) => d.id))
const toolByDataset = new Map(catalog.map((d) => [d.id, d.tool]))

console.log(`Ask Toronto data contract check — ${catalog.length} datasets, ${golden.length} golden questions\n`)

check('catalog contains every shipped dataset', () => {
  assert(Array.isArray(catalog), 'dataset_catalog.json is not an array')
  assert(
    catalog.length === EXPECTED_DATASET_COUNT,
    `expected ${EXPECTED_DATASET_COUNT} datasets, found ${catalog.length}`,
  )
  return `${catalog.length} datasets`
})

check('dataset ids are unique', () => {
  assert(catalogIds.size === catalog.length, 'duplicate dataset id in dataset_catalog.json')
  return `${catalogIds.size} unique ids`
})

check('every dataset has the fields the RAG router needs', () => {
  for (const d of catalog) {
    for (const field of ['id', 'name', 'description', 'ckanPackageId', 'ckanResourceId', 'tool']) {
      assert(typeof d[field] === 'string' && d[field].length > 0, `${d.id ?? '<unknown>'} is missing ${field}`)
    }
    assert(Array.isArray(d.tags) && d.tags.length > 0, `${d.id} has no trigger keywords`)
    assert(Number.isInteger(d.cacheTtlSeconds) && d.cacheTtlSeconds > 0, `${d.id} has an invalid cacheTtlSeconds`)
  }
  return `${catalog.length} datasets fully described`
})

check('every CKAN resource id is a valid uuid', () => {
  for (const d of catalog) {
    assert(UUID_RE.test(d.ckanResourceId), `${d.id} has a malformed ckanResourceId: ${d.ckanResourceId}`)
  }
  return `${catalog.length} resource ids well formed`
})

check('every catalog tool has an implementation in lib/tools', () => {
  for (const d of catalog) {
    const toolPath = join(repoRoot, 'lib', 'tools', `${d.tool}.ts`)
    assert(existsSync(toolPath), `${d.id} points at missing tool lib/tools/${d.tool}.ts`)
  }
  return `${catalog.length} tool files present`
})

check('golden-set question ids are unique', () => {
  const ids = new Set(golden.map((q) => q.id))
  assert(ids.size === golden.length, 'duplicate question id in benchmark_questions.json')
  return `${ids.size} unique question ids`
})

check('every golden question targets a dataset in the catalog', () => {
  const orphans = golden.filter((q) => !catalogIds.has(q.expected_dataset))
  assert(orphans.length === 0, `unknown expected_dataset in: ${orphans.map((q) => q.id).join(', ')}`)
  return `${golden.length} questions mapped`
})

check('every golden question expects that dataset’s own tool', () => {
  const mismatches = golden.filter((q) => toolByDataset.get(q.expected_dataset) !== q.expected_tool)
  assert(
    mismatches.length === 0,
    `expected_tool does not match the catalog in: ${mismatches.map((q) => q.id).join(', ')}`,
  )
  return `${golden.length} questions consistent with the router`
})

check('every dataset is covered by the golden set', () => {
  const covered = new Set(golden.map((q) => q.expected_dataset))
  const uncovered = [...catalogIds].filter((id) => !covered.has(id))
  assert(uncovered.length === 0, `no eval questions for: ${uncovered.join(', ')}`)
  return `all ${catalogIds.size} datasets covered`
})

const failed = checks.filter((c) => !c.passed)
const summary = {
  status: failed.length === 0 ? 'passed' : 'failed',
  runAt: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME ?? 'local',
  commit: process.env.GITHUB_SHA ?? 'local',
  datasets: catalog.length,
  goldenQuestions: golden.length,
  checksRun: checks.length,
  checksPassed: checks.length - failed.length,
  checksFailed: failed.length,
  checks,
}

mkdirSync(reportDir, { recursive: true })
writeFileSync(join(reportDir, 'catalog-validation.json'), `${JSON.stringify(summary, null, 2)}\n`)
writeFileSync(
  join(reportDir, 'catalog-validation.md'),
  [
    '# Ask Toronto — catalog & golden-set validation',
    '',
    `- Status: **${summary.status}**`,
    `- Branch: \`${summary.branch}\``,
    `- Commit: \`${summary.commit}\``,
    `- Run at: ${summary.runAt}`,
    `- Datasets: ${summary.datasets} · Golden questions: ${summary.goldenQuestions}`,
    `- Checks: ${summary.checksPassed}/${summary.checksRun} passed`,
    '',
    '| Check | Result | Detail |',
    '| --- | --- | --- |',
    ...checks.map((c) => `| ${c.name} | ${c.passed ? 'PASS' : 'FAIL'} | ${c.detail} |`),
    '',
  ].join('\n'),
)

console.log(`\n${summary.checksPassed}/${summary.checksRun} checks passed — report written to ci-report/`)
process.exit(failed.length === 0 ? 0 : 1)
