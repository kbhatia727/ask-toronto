import { ToolLoopAgent, stepCountIs, type Tool } from 'ai'
import { chatModel } from './llm'
import { retrieveBestDataset, type DatasetMatch } from './rag'
import { getCrimeDataTool } from './tools/getCrimeData'
import { getTtcDelaysTool } from './tools/getTtcDelays'
import { getSplashPadsTool } from './tools/getSplashPads'
import { getBuildingPermitsTool } from './tools/getBuildingPermits'
import { getCyclingNetworkTool } from './tools/getCyclingNetwork'
import { getDinesafeTool } from './tools/getDinesafe'

/** Maps the `tool` name stored in the catalog to its AI SDK tool. */
export const TOOL_REGISTRY: Record<string, Tool> = {
  getCrimeData: getCrimeDataTool,
  getTtcDelays: getTtcDelaysTool,
  getSplashPads: getSplashPadsTool,
  getBuildingPermits: getBuildingPermitsTool,
  getCyclingNetwork: getCyclingNetworkTool,
  getDinesafe: getDinesafeTool,
}

const BASE_INSTRUCTIONS = `You are a civic data analyst for the City of Toronto.
You answer questions using ONLY the data returned by your tool. Rules:
- Always call the provided tool to fetch real data before answering.
- Ground every number and fact in the tool output. Never invent figures.
- If the tool returns no rows, clearly say no data was found.
- Be concise: give the direct answer first, then a short supporting detail.`

export interface RoutedAgent {
  agent: ToolLoopAgent<never, Record<string, Tool>>
  match: DatasetMatch
  toolName: string
}

/**
 * Router pattern: pick the single best dataset for the question via RAG, then
 * build an agent that has ONLY that dataset's tool.
 */
export async function buildRoutedAgent(
  question: string
): Promise<RoutedAgent | null> {
  const match = await retrieveBestDataset(question)
  if (!match) return null

  const agentTool = TOOL_REGISTRY[match.tool]
  if (!agentTool) {
    throw new Error(`No tool registered for "${match.tool}" (dataset ${match.id}).`)
  }

  const agent = new ToolLoopAgent({
    model: chatModel,
    instructions: `${BASE_INSTRUCTIONS}

This question is about: ${match.name}.
${match.description}
Use the "${match.tool}" tool to answer it.`,
    tools: { [match.tool]: agentTool },
    stopWhen: stepCountIs(5),
  })

  return { agent, match, toolName: match.tool }
}
