export type PoolHistoryReportConfig = {
  databasePath: string
  expectedIntervalSeconds: number
  minimumCoverageBps: number
  limit: number
}

export function readPoolHistoryReportConfig(environment: NodeJS.ProcessEnv = process.env): PoolHistoryReportConfig {
  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    expectedIntervalSeconds: parsePositiveInteger(
      environment.LP_MINE_EXPECTED_INTERVAL_SECONDS,
      300,
      'LP_MINE_EXPECTED_INTERVAL_SECONDS',
    ),
    minimumCoverageBps: parseBoundedInteger(
      environment.LP_MINE_MINIMUM_COVERAGE_BPS,
      8_000,
      0,
      10_000,
      'LP_MINE_MINIMUM_COVERAGE_BPS',
    ),
    limit: parseBoundedInteger(environment.LP_MINE_HISTORY_LIMIT, 10_000, 1, 10_000, 'LP_MINE_HISTORY_LIMIT'),
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  return parseBoundedInteger(value, fallback, 1, Number.MAX_SAFE_INTEGER, name)
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an unsigned integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`)
  }
  return parsed
}
