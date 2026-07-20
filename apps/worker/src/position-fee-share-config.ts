import type { PositionCostEntry } from '@lp-mine/core'

export type PositionFeeShareReportConfig = {
  databasePath: string
  feeTier: number
  tickLower: number
  tickUpper: number
  positionLiquidity: bigint
  windowSeconds: number
  limit: number
  realizedFees?: { amount0: bigint; amount1: bigint } | null
  costs?: readonly PositionCostEntry[]
  costsSupplied?: boolean
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

  const realizedFeeValues = [environment.LP_MINE_POSITION_REALIZED_FEES0, environment.LP_MINE_POSITION_REALIZED_FEES1]
  const anyRealizedFees = realizedFeeValues.some((value) => value !== undefined)
  const allRealizedFees = realizedFeeValues.every((value) => value !== undefined)
  if (anyRealizedFees && !allRealizedFees) {
    throw new Error('Both LP_MINE_POSITION_REALIZED_FEES0 and LP_MINE_POSITION_REALIZED_FEES1 are required together')
  }

  const costDefinitions = [
    ['gas', 'LP_MINE_POSITION_GAS_COST0', 'LP_MINE_POSITION_GAS_COST1'],
    ['slippage', 'LP_MINE_POSITION_SLIPPAGE_COST0', 'LP_MINE_POSITION_SLIPPAGE_COST1'],
    ['rebalance', 'LP_MINE_POSITION_REBALANCE_COST0', 'LP_MINE_POSITION_REBALANCE_COST1'],
    ['other', 'LP_MINE_POSITION_OTHER_COST0', 'LP_MINE_POSITION_OTHER_COST1'],
  ] as const
  const costsSupplied = costDefinitions.some(
    ([, token0Name, token1Name]) => environment[token0Name] !== undefined || environment[token1Name] !== undefined,
  )
  const costs = costDefinitions.map(([category, token0Name, token1Name]) => ({
    category,
    amount0: parseOptionalNonNegativeBigInt(environment[token0Name], token0Name),
    amount1: parseOptionalNonNegativeBigInt(environment[token1Name], token1Name),
  }))

  return {
    databasePath: environment.LP_MINE_DATABASE_PATH ?? './data/robinhood-univ3.sqlite',
    feeTier,
    tickLower,
    tickUpper,
    positionLiquidity,
    windowSeconds: parseBoundedInteger(environment.LP_MINE_SWAP_WINDOW_SECONDS, 86_400, 1, 31_536_000),
    limit: parseBoundedInteger(environment.LP_MINE_SWAP_EVIDENCE_LIMIT, 10_000, 1, 10_000),
    realizedFees: allRealizedFees
      ? {
          amount0: parseOptionalNonNegativeBigInt(
            environment.LP_MINE_POSITION_REALIZED_FEES0,
            'LP_MINE_POSITION_REALIZED_FEES0',
          ),
          amount1: parseOptionalNonNegativeBigInt(
            environment.LP_MINE_POSITION_REALIZED_FEES1,
            'LP_MINE_POSITION_REALIZED_FEES1',
          ),
        }
      : null,
    costs,
    costsSupplied,
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

function parseOptionalNonNegativeBigInt(value: string | undefined, name: string): bigint {
  if (value === undefined) return 0n
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer`)
  return BigInt(value)
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
