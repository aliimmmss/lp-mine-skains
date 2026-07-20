export type PositionFeeShareReportConfig = {
  databasePath: string
  feeTier: number
  tickLower: number
  tickUpper: number
  positionLiquidity: bigint
  windowSeconds: number
  limit: number
}

export function readPositionFeeShareReportConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PositionFeeShareReportConfig {
  const feeTier = parseRequiredInteger(environment.LP_MINE_POSITION_FEE_TIER, 'LP_MINE_POSITION_FEE_TIER')
  const tickLower = parseRequiredInteger(environment.LP_MINE_POSITION_TICK_LOWER, 'LP_MINE_POSITION_TICK_LOWER')
  const tickUpper = parseRequiredInteger(environment.LP_MINE_POSITION_TICK_UPPER, 'LP_MINE_POSITION_TICK_UPPER')
  const positionLiquidity = parseRequiredPositiveBigInt(
    environment.LP_MINE_POSITION_LIQUIDITY,
    'LP_MINE_POSITION_LIQUIDITY',
  )

  if (tickLower >= tickUpper)
    throw new Error('LP_MINE_POSITION_TICK_LOWER must be less than LP_MINE_POSITION_TICK_UPPER')

  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    feeTier,
    tickLower,
    tickUpper,
    positionLiquidity,
    windowSeconds: parseBoundedInteger(environment.LP_MINE_SWAP_WINDOW_SECONDS, 86_400, 1, 31_536_000),
    limit: parseBoundedInteger(environment.LP_MINE_SWAP_EVIDENCE_LIMIT, 10_000, 1, 10_000),
  }
}

function parseRequiredInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^-?\d+$/.test(value)) throw new Error(`${name} must be an integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe integer`)
  return parsed
}

function parseRequiredPositiveBigInt(value: string | undefined, name: string): bigint {
  if (value === undefined || !/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`)
  const parsed = BigInt(value)
  if (parsed <= 0n) throw new Error(`${name} must be positive`)
  return parsed
}

function parseBoundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback
  if (!/^\d+$/.test(value)) throw new Error('Position fee-share configuration values must be unsigned integers')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Position fee-share configuration value must be between ${minimum} and ${maximum}`)
  }
  return parsed
}
