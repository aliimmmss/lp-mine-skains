export type SwapEvidenceReportConfig = {
  databasePath: string
  windowSeconds: number
  limitPerPool: number
}

export function readSwapEvidenceReportConfig(environment: NodeJS.ProcessEnv = process.env): SwapEvidenceReportConfig {
  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    windowSeconds: parseBoundedInteger(environment.LP_MINE_SWAP_WINDOW_SECONDS, 86_400, 1, 31_536_000),
    limitPerPool: parseBoundedInteger(environment.LP_MINE_SWAP_EVIDENCE_LIMIT, 10_000, 1, 10_000),
  }
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error('Swap evidence configuration values must be unsigned integers')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Swap evidence configuration value must be between ${minimum} and ${maximum}`)
  }
  return parsed
}
