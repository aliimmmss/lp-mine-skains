import {
  ROBINHOOD_REGISTRY_EVIDENCE,
  ROBINHOOD_UNISWAP_V3,
  WETH_ALLOWANCE_REVOCATION_OPERATION,
  createRobinhoodPublicClient,
  defaultWethAllowanceAuthorityPaperEvidence,
  evaluateWethAllowanceRevocationPaperMode,
  registryEvidenceForAddress,
  verifyRobinhoodRegistryBytecode,
  type RegistryBytecodeVerificationStatus,
  type WethAllowancePaperInput,
  type WethAllowancePaperReport,
  type WethAllowanceReadEvidence,
  type WethAllowanceRegistryPaperEvidence,
} from '@lp-mine/robinhood-univ3'
import { getAddress, isAddress, parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import { pathToFileURL } from 'node:url'

const allowanceAbi = parseAbi(['function allowance(address owner, address spender) view returns (uint256 remaining)'])

export type WethAllowancePaperCommandConfig = Readonly<{
  owner: string
  configuredRpcUrl: string | null
  confirmations: number
  maximumAgeSeconds: number
}>

type ProviderSnapshot = Readonly<{
  chainId: number
  blockNumber: bigint
  blockHash: Hex
  blockTimestamp: bigint
  tokenCode: Hex | undefined
  spenderCode: Hex | undefined
  allowance: bigint
}>

export function readWethAllowancePaperCommandConfig(
  environment: NodeJS.ProcessEnv = process.env,
): WethAllowancePaperCommandConfig {
  return {
    owner: environment.PAPER_OWNER_ADDRESS?.trim() ?? '',
    configuredRpcUrl: environment.ROBINHOOD_RPC_URL?.trim() || null,
    confirmations: positiveInteger(environment.PAPER_CONFIRMATIONS, 12, 'PAPER_CONFIRMATIONS'),
    maximumAgeSeconds: positiveInteger(
      environment.PAPER_MAX_EVIDENCE_AGE_SECONDS,
      900,
      'PAPER_MAX_EVIDENCE_AGE_SECONDS',
    ),
  }
}

export async function buildWethAllowancePaperReport(
  config: WethAllowancePaperCommandConfig,
  generatedAt = new Date(),
): Promise<WethAllowancePaperReport> {
  const normalizedOwner = normalizeChecksummedOwner(config.owner)
  const baseInput = paperInput(config, unavailableEvidence(config.maximumAgeSeconds), defaultRegistryEvidence())

  if (normalizedOwner === null || config.configuredRpcUrl === null) {
    return evaluateWethAllowanceRevocationPaperMode(baseInput, generatedAt)
  }

  try {
    const officialClient = createRobinhoodPublicClient()
    const configuredClient = createRobinhoodPublicClient({ rpcUrl: config.configuredRpcUrl })
    const providerCount = config.configuredRpcUrl === ROBINHOOD_UNISWAP_V3.publicRpcUrl ? 1 : 2
    const [officialLatest, configuredLatest] = await Promise.all([
      officialClient.getBlockNumber(),
      configuredClient.getBlockNumber(),
    ])
    const lowestLatest = officialLatest < configuredLatest ? officialLatest : configuredLatest
    if (lowestLatest < BigInt(config.confirmations)) {
      return evaluateWethAllowanceRevocationPaperMode(baseInput, generatedAt)
    }

    const sharedBlock = lowestLatest - BigInt(config.confirmations)
    const [official, configured] = await Promise.all([
      readProviderSnapshot(officialClient, normalizedOwner, sharedBlock),
      readProviderSnapshot(configuredClient, normalizedOwner, sharedBlock),
    ])
    const providerAgreement = providerSnapshotsAgree(official, configured)
    const registry = registryEvidence(official, configured)
    const allowance: WethAllowanceReadEvidence = {
      status: 'available',
      sharedBlock,
      blockHash: official.blockHash,
      observedAt: new Date(Number(official.blockTimestamp) * 1_000),
      providerCount,
      providerAgreement,
      allowance: official.allowance,
      maximumAgeSeconds: config.maximumAgeSeconds,
    }

    return evaluateWethAllowanceRevocationPaperMode(paperInput(config, allowance, registry), generatedAt)
  } catch {
    return evaluateWethAllowanceRevocationPaperMode(baseInput, generatedAt)
  }
}

export async function runWethAllowancePaperCommand(): Promise<void> {
  const report = await buildWethAllowancePaperReport(readWethAllowancePaperCommandConfig())
  process.stdout.write(`${JSON.stringify(report, jsonReplacer, 2)}\n`)
  if (report.decision === 'blocked') process.exitCode = 2
}

async function readProviderSnapshot(
  client: PublicClient,
  owner: Address,
  blockNumber: bigint,
): Promise<ProviderSnapshot> {
  const [chainId, block, tokenCode, spenderCode, allowance] = await Promise.all([
    client.getChainId(),
    client.getBlock({ blockNumber }),
    client.getCode({ address: ROBINHOOD_UNISWAP_V3.wrappedNative, blockNumber }),
    client.getCode({ address: ROBINHOOD_UNISWAP_V3.positionManager, blockNumber }),
    client.readContract({
      address: ROBINHOOD_UNISWAP_V3.wrappedNative,
      abi: allowanceAbi,
      functionName: 'allowance',
      args: [owner, ROBINHOOD_UNISWAP_V3.positionManager],
      blockNumber,
    }),
  ])

  if (block.hash === null) throw new Error('Shared block hash is unavailable')
  return {
    chainId,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    tokenCode,
    spenderCode,
    allowance,
  }
}

function providerSnapshotsAgree(left: ProviderSnapshot, right: ProviderSnapshot): boolean {
  return (
    left.chainId === ROBINHOOD_UNISWAP_V3.chainId &&
    right.chainId === ROBINHOOD_UNISWAP_V3.chainId &&
    left.blockNumber === right.blockNumber &&
    left.blockHash === right.blockHash &&
    left.blockTimestamp === right.blockTimestamp &&
    left.tokenCode === right.tokenCode &&
    left.spenderCode === right.spenderCode &&
    left.allowance === right.allowance
  )
}

function registryEvidence(left: ProviderSnapshot, right: ProviderSnapshot): WethAllowanceRegistryPaperEvidence {
  const tokenStatus = combinedRegistryStatus(
    verifyRobinhoodRegistryBytecode(ROBINHOOD_UNISWAP_V3.wrappedNative, left.tokenCode).status,
    verifyRobinhoodRegistryBytecode(ROBINHOOD_UNISWAP_V3.wrappedNative, right.tokenCode).status,
    left.tokenCode === right.tokenCode,
  )
  const spenderStatus = combinedRegistryStatus(
    verifyRobinhoodRegistryBytecode(ROBINHOOD_UNISWAP_V3.positionManager, left.spenderCode).status,
    verifyRobinhoodRegistryBytecode(ROBINHOOD_UNISWAP_V3.positionManager, right.spenderCode).status,
    left.spenderCode === right.spenderCode,
  )
  const token = registryEvidenceForAddress(ROBINHOOD_UNISWAP_V3.wrappedNative)
  const spender = registryEvidenceForAddress(ROBINHOOD_UNISWAP_V3.positionManager)

  return {
    tokenStatus,
    spenderStatus,
    tokenExecutionEligible: token?.executionEligible ?? true,
    spenderExecutionEligible: spender?.executionEligible ?? true,
    allEntriesExecutionIneligible: ROBINHOOD_REGISTRY_EVIDENCE.entries.every(
      (entry) => entry.executionEligible === false,
    ),
  }
}

function combinedRegistryStatus(
  left: RegistryBytecodeVerificationStatus,
  right: RegistryBytecodeVerificationStatus,
  bytecodeAgreement: boolean,
): RegistryBytecodeVerificationStatus {
  if (!bytecodeAgreement) return 'hash-mismatch'
  if (left !== 'verified') return left
  return right
}

function paperInput(
  config: WethAllowancePaperCommandConfig,
  allowance: WethAllowanceReadEvidence,
  registry: WethAllowanceRegistryPaperEvidence,
): WethAllowancePaperInput {
  return {
    intent: {
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      chainId: ROBINHOOD_UNISWAP_V3.chainId,
      owner: config.owner,
      token: ROBINHOOD_UNISWAP_V3.wrappedNative,
      spender: ROBINHOOD_UNISWAP_V3.positionManager,
      desiredAllowance: 0n,
      nativeValue: 0n,
    },
    registry,
    authority: defaultWethAllowanceAuthorityPaperEvidence(),
    allowance,
  }
}

function defaultRegistryEvidence(): WethAllowanceRegistryPaperEvidence {
  const token = registryEvidenceForAddress(ROBINHOOD_UNISWAP_V3.wrappedNative)
  const spender = registryEvidenceForAddress(ROBINHOOD_UNISWAP_V3.positionManager)
  return {
    tokenStatus: 'missing-code',
    spenderStatus: 'missing-code',
    tokenExecutionEligible: token?.executionEligible ?? true,
    spenderExecutionEligible: spender?.executionEligible ?? true,
    allEntriesExecutionIneligible: ROBINHOOD_REGISTRY_EVIDENCE.entries.every(
      (entry) => entry.executionEligible === false,
    ),
  }
}

function unavailableEvidence(maximumAgeSeconds: number): WethAllowanceReadEvidence {
  return {
    status: 'unavailable',
    sharedBlock: null,
    blockHash: null,
    observedAt: null,
    providerCount: 0,
    providerAgreement: false,
    allowance: null,
    maximumAgeSeconds,
  }
}

function normalizeChecksummedOwner(value: string): Address | null {
  if (!isAddress(value, { strict: true })) return null
  try {
    const normalized = getAddress(value)
    return value === normalized ? normalized : null
  } catch {
    return null
  }
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new RangeError(`${name} must be a positive integer`)
  return parsed
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runWethAllowancePaperCommand().catch(() => {
    process.stderr.write('WETH allowance paper-mode command failed without exposing provider details.\n')
    process.exitCode = 1
  })
}
