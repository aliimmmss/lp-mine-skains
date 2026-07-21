export const DEFAULT_MONITOR_DATABASE_PATH = './data/robinhood-univ3.sqlite'

export type MonitorHealthConfig = {
  databasePath: string
  expectedIntervalSeconds: number
  minimumCoverageBps: number
  historyLimit: number
  maximumObservationAgeSeconds: number
}

export function readMonitorDatabasePath(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.LP_MINE_DATABASE_PATH?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_MONITOR_DATABASE_PATH
}

export function readMonitorHealthConfig(environment: NodeJS.ProcessEnv = process.env): MonitorHealthConfig {
  return {
    databasePath: readMonitorDatabasePath(environment),
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
    historyLimit: parseBoundedInteger(environment.LP_MINE_HISTORY_LIMIT, 10_000, 1, 10_000, 'LP_MINE_HISTORY_LIMIT'),
    maximumObservationAgeSeconds: parsePositiveInteger(
      environment.LP_MINE_MAXIMUM_OBSERVATION_AGE_SECONDS,
      900,
      'LP_MINE_MAXIMUM_OBSERVATION_AGE_SECONDS',
    ),
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
