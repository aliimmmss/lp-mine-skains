import type { SourceStamped, TokenRef } from '@lp-mine/core'
import { getAddress, zeroAddress, type Address } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3, isSupportedFeeTier, type SupportedFeeTier } from './registry.js'

export { SqlitePoolObservationStore } from './canonical-observation-store.js'
export { createViemPoolCreatedEventSource, normalizePoolCreatedLog } from './event-source.js'
export { createRobinhoodPublicClient, createViemReadClient, robinhoodChain } from './live-client.js'
export type { LiveClientOptions, PoolCreatedLog } from './live-client.js'
export { syncPoolCreatedEvents } from './indexer.js'
export type {
  BlockHeader,
  CheckpointStore,
  IndexCheckpoint,
  IndexedPoolCreated,
  PoolCreatedEventSource,
  PoolEventSink,
  SyncOptions,
  SyncResult,
} from './indexer.js'
export type { PoolObservationOrder, PoolObservationQuery } from './observation-store.js'
export {
  PoolIntegrityError,
  assertCanonicalPoolSnapshot,
  canonicalPoolForFeeTier,
  validateCanonicalPositionRange,
} from './pool-integrity.js'
export type { CanonicalPool } from './pool-integrity.js'
export {
  ROBINHOOD_REGISTRY_EVIDENCE,
  assertVerifiedRobinhoodRegistryBytecode,
  registryEvidenceForAddress,
  verifyBytecodeEvidence,
  verifyRobinhoodRegistryBytecode,
} from './registry-evidence.js'
export type {
  RegistryBytecodeVerification,
  RegistryBytecodeVerificationStatus,
  RobinhoodRegistryBytecodeEvidence,
  RobinhoodRegistryRole,
} from './registry-evidence.js'
export {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  ROBINHOOD_UNISWAP_V3,
  ROBINHOOD_WETH_USDG_POOLS,
  SUPPORTED_FEE_TIERS,
} from './registry.js'
export type { SupportedFeeTier } from './registry.js'
export { createViemSwapEventSource, normalizeSwapLog } from './swap-event-source.js'
export { inspectSwapEvidenceCoverage } from './swap-integrity.js'
export type { SwapEvidenceCoverage } from './swap-integrity.js'
export { syncSwapEvents } from './swap-indexer.js'
export type { IndexedSwap, SwapEventSink, SwapEventSource } from './swap-indexer.js'
export { SqliteSwapIndexStore } from './swap-store.js'
export type { SwapTimeQuery, SwapTimeQueryResult, TimestampedIndexedSwap } from './swap-store.js'
export { SqlitePoolIndexStore } from './sqlite-store.js'
export {
  WETH_ALLOWANCE_REVOCATION_OPERATION,
  canonicalJson,
  defaultWethAllowanceAuthorityPaperEvidence,
  defaultWethAllowanceRegistryPaperEvidence,
  evaluateWethAllowanceRevocationPaperMode,
} from './weth-allowance-paper.js'
export type {
  NormalizedWethAllowancePaperIntent,
  WethAllowanceAuthorityPaperEvidence,
  WethAllowanceFreshness,
  WethAllowancePaperCheck,
  WethAllowancePaperDecision,
  WethAllowancePaperInput,
  WethAllowancePaperIntent,
  WethAllowancePaperReport,
  WethAllowanceReadEvidence,
  WethAllowanceRegistryPaperEvidence,
} from './weth-allowance-paper.js'
export {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  ingestWethAllowanceSimulationFixture,
} from './weth-allowance-simulation-ingestion.js'
export type {
  WethAllowanceSimulationIngestionCheck,
  WethAllowanceSimulationIngestionResult,
  WethAllowanceSimulationOfflineBalanceDelta,
  WethAllowanceSimulationOfflineCall,
  WethAllowanceSimulationOfflineFixture,
  WethAllowanceSimulationOfflineLog,
} from './weth-allowance-simulation-ingestion.js'
export {
  WETH_ALLOWANCE_SIMULATION_MAX_AGE_SECONDS,
  WETH_ALLOWANCE_SIMULATION_MAX_CALL_DEPTH,
  WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
  defaultWethAllowanceSimulationIdentityEvidence,
  validateWethAllowanceSimulationEvidencePolicy,
} from './weth-allowance-simulation-policy.js'
export type {
  WethAllowanceSimulationBalanceDelta,
  WethAllowanceSimulationCall,
  WethAllowanceSimulationCallType,
  WethAllowanceSimulationIdentityEvidence,
  WethAllowanceSimulationLog,
  WethAllowanceSimulationPaperReference,
  WethAllowanceSimulationPolicyCheck,
  WethAllowanceSimulationPolicyInput,
  WethAllowanceSimulationPolicyResult,
  WethAllowanceSimulationProviderEvidence,
  WethAllowanceSimulationStateDiff,
} from './weth-allowance-simulation-policy.js'
export {
  WETH_ALLOWANCE_SIMULATION_REVIEW_REPORT_VERSION,
  createWethAllowanceSimulationReviewReport,
  renderWethAllowanceSimulationReviewText,
} from './weth-allowance-simulation-review-report.js'
export type {
  WethAllowanceSimulationReviewCall,
  WethAllowanceSimulationReviewEvent,
  WethAllowanceSimulationReviewEvidence,
  WethAllowanceSimulationReviewReport,
  WethAllowanceSimulationReviewReportCheck,
} from './weth-allowance-simulation-review-report.js'
export {
  WETH_ALLOWANCE_SIMULATION_REVIEW_LIFECYCLE_VERSION,
  evaluateWethAllowanceSimulationReviewLifecycle,
} from './weth-allowance-simulation-review-lifecycle.js'
export type {
  WethAllowanceSimulationReviewCurrentState,
  WethAllowanceSimulationReviewLifecycleCheck,
  WethAllowanceSimulationReviewLifecycleResult,
} from './weth-allowance-simulation-review-lifecycle.js'
export {
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS,
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
  createWethAllowanceRevocationReviewIntent,
  digestWethAllowanceRevocationReviewIntentBody,
} from './weth-allowance-revocation-review-intent.js'
export type {
  WethAllowanceRevocationReviewIntent,
  WethAllowanceRevocationReviewIntentBody,
  WethAllowanceRevocationReviewIntentCheck,
  WethAllowanceRevocationReviewIntentInput,
  WethAllowanceRevocationReviewIntentLifecycleReference,
  WethAllowanceRevocationReviewIntentResult,
} from './weth-allowance-revocation-review-intent.js'
export {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION,
  createWethAllowanceRevocationReviewConfirmation,
  digestWethAllowanceRevocationReviewConfirmationBody,
} from './weth-allowance-revocation-review-confirmation.js'
export type {
  WethAllowanceRevocationReviewConfirmation,
  WethAllowanceRevocationReviewConfirmationBody,
  WethAllowanceRevocationReviewConfirmationCheck,
  WethAllowanceRevocationReviewConfirmationInput,
  WethAllowanceRevocationReviewConfirmationResult,
} from './weth-allowance-revocation-review-confirmation.js'
export {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_LIFECYCLE_VERSION,
  evaluateWethAllowanceRevocationReviewConfirmationLifecycle,
} from './weth-allowance-revocation-review-confirmation-lifecycle.js'
export type {
  WethAllowanceRevocationReviewConfirmationLifecycleCheck,
  WethAllowanceRevocationReviewConfirmationLifecycleInput,
  WethAllowanceRevocationReviewConfirmationLifecycleResult,
} from './weth-allowance-revocation-review-confirmation-lifecycle.js'
export {
  POSITION_MANAGER_DISPLAY_LABEL,
  ROBINHOOD_CHAIN_DISPLAY_NAME,
  WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION,
  WETH_DECIMALS,
  WETH_DISPLAY_LABEL,
  WETH_PROXY_DISPLAY_LABEL,
  createWethAllowanceRevocationFinalReviewSummary,
  digestWethAllowanceRevocationFinalReviewSummaryBody,
  renderWethAllowanceRevocationFinalReviewSummary,
} from './weth-allowance-revocation-final-review-summary.js'
export type {
  WethAllowanceRevocationFinalReviewSummary,
  WethAllowanceRevocationFinalReviewSummaryBody,
  WethAllowanceRevocationFinalReviewSummaryCheck,
  WethAllowanceRevocationFinalReviewSummaryInput,
  WethAllowanceRevocationFinalReviewSummaryLifecycleReference,
  WethAllowanceRevocationFinalReviewSummaryResult,
} from './weth-allowance-revocation-final-review-summary.js'
export { ROBINHOOD_WETH_CONTROL_EVIDENCE, verifyRobinhoodWethControlEvidence } from './weth-control-evidence.js'
export type {
  WethControlCheck,
  WethControlCodeEvidence,
  WethControlObservedState,
  WethControlVerification,
} from './weth-control-evidence.js'
export { ROBINHOOD_WETH_AUTHORITY_EVIDENCE, verifyRobinhoodWethAuthorityEvidence } from './weth-authority-evidence.js'
export type {
  AuthorityCodeEvidence,
  SafeAuthorityObservedState,
  WethAuthorityCheck,
  WethAuthorityObservedState,
  WethAuthorityVerification,
} from './weth-authority-evidence.js'
export { ROBINHOOD_WETH_PROXY_EVIDENCE, verifyRobinhoodWethProxyEvidence } from './weth-proxy-evidence.js'
export type {
  WethProxyCodeEvidence,
  WethProxyEvidenceCheck,
  WethProxyEvidenceVerification,
  WethProxyObservedState,
} from './weth-proxy-evidence.js'

export type PoolIdentity = {
  poolAddress: Address
  token0: TokenRef
  token1: TokenRef
  feeTier: SupportedFeeTier
}

export type PoolState = {
  sqrtPriceX96: bigint
  tick: number
  tickSpacing: number
  activeLiquidity: bigint
}

export type PoolSnapshot = SourceStamped<PoolIdentity & PoolState>

export interface UniswapV3ReadClient {
  getPool(tokenA: Address, tokenB: Address, feeTier: number): Promise<Address>
  readPoolState(poolAddress: Address): Promise<PoolState>
  readToken(tokenAddress: Address): Promise<Pick<TokenRef, 'symbol' | 'decimals'>>
  getBlock(): Promise<{ blockNumber: bigint; timestamp: bigint }>
}

export class PoolVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PoolVerificationError'
  }
}

export async function readVerifiedPoolSnapshot(args: {
  client: UniswapV3ReadClient
  poolAddress: Address
  token0: Address
  token1: Address
  feeTier: number
}): Promise<PoolSnapshot> {
  if (!isSupportedFeeTier(args.feeTier)) {
    throw new PoolVerificationError(`Unsupported fee tier: ${args.feeTier}`)
  }

  const poolAddress = getAddress(args.poolAddress)
  const token0Address = getAddress(args.token0)
  const token1Address = getAddress(args.token1)
  const officialPool = getAddress(await args.client.getPool(token0Address, token1Address, args.feeTier))

  if (officialPool === zeroAddress || officialPool !== poolAddress) {
    throw new PoolVerificationError(
      `Pool ${poolAddress} is not the official factory result for the supplied pair and fee tier`,
    )
  }

  const [state, token0Meta, token1Meta, block] = await Promise.all([
    args.client.readPoolState(poolAddress),
    args.client.readToken(token0Address),
    args.client.readToken(token1Address),
    args.client.getBlock(),
  ])
  if (state.sqrtPriceX96 <= 0n || state.activeLiquidity < 0n || state.tickSpacing <= 0) {
    throw new PoolVerificationError('Pool returned invalid state')
  }
  const observedAt = new Date(Number(block.timestamp) * 1_000)
  if (Number.isNaN(observedAt.getTime())) {
    throw new PoolVerificationError('Block timestamp is invalid')
  }

  return {
    value: {
      poolAddress,
      token0: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: token0Address,
        symbol: token0Meta.symbol,
        decimals: token0Meta.decimals,
      },
      token1: {
        chainId: ROBINHOOD_CHAIN_ID,
        address: token1Address,
        symbol: token1Meta.symbol,
        decimals: token1Meta.decimals,
      },
      feeTier: args.feeTier,
      ...state,
    },
    block: {
      chainId: ROBINHOOD_UNISWAP_V3.chainId,
      blockNumber: block.blockNumber,
      observedAt,
    },
    quality: 'complete',
    warnings: [],
  }
}
