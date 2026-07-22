import { getAddress, keccak256, stringToHex, type Address, type Hex } from 'viem'
import { canonicalJson, type WethAllowancePaperDecision } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
  validateWethAllowanceSimulationEvidencePolicy,
  type WethAllowanceSimulationBalanceDelta,
  type WethAllowanceSimulationCall,
  type WethAllowanceSimulationCallType,
  type WethAllowanceSimulationIdentityEvidence,
  type WethAllowanceSimulationLog,
  type WethAllowanceSimulationPaperReference,
  type WethAllowanceSimulationPolicyInput,
  type WethAllowanceSimulationPolicyResult,
  type WethAllowanceSimulationProviderEvidence,
  type WethAllowanceSimulationStateDiff,
} from './weth-allowance-simulation-policy.js'

export const WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION = '1.0.0' as const
export const WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT = 'sanitized-review-v1' as const

export type WethAllowanceSimulationOfflineCall = Readonly<{
  id: string
  parentId: string | null
  depth: number
  type: WethAllowanceSimulationCallType
  from: string
  to: string
  nativeValue: string
  functionName: string
  spender: string
  amount: string
}>

export type WethAllowanceSimulationOfflineLog = Readonly<{
  address: string
  eventName: string
  owner: string
  spender: string
  value: string
}>

export type WethAllowanceSimulationOfflineBalanceDelta = Readonly<{
  account: string
  asset: string | null
  delta: string
}>

export type WethAllowanceSimulationOfflineFixture = Readonly<{
  fixtureVersion: typeof WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION
  sourceFormat: typeof WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT
  paper: Readonly<{
    operation: string
    evidenceDigest: string
    decision: WethAllowancePaperDecision
    executionEligible: boolean
    chainId: number
    owner: string
    token: string
    spender: string
    desiredAllowance: string
    nativeValue: string
    sharedBlock: string
    blockHash: string
    observedAt: string
    freshness: string
  }>
  provider: Readonly<{
    status: 'available' | 'unavailable'
    providerCount: number
    providerAgreement: boolean
    referencedPaperDigest: string
    sharedBlock: string | null
    blockHash: string | null
    observedAt: string | null
    maximumAgeSeconds: number
    metadataRedacted: boolean
  }>
  identity: Readonly<{
    registryVerified: boolean
    authorityStatus: string
    authoritySourceAgreement: boolean
    unresolvedAuthorityBoundaryCount: number
    registryExecutionEligible: boolean
    authorityExecutionEligible: boolean
    proxyAddress: string
    proxyBytecodeHash: string
    implementationAddress: string
    implementationBytecodeHash: string
  }>
  trace: readonly WethAllowanceSimulationOfflineCall[]
  events: readonly WethAllowanceSimulationOfflineLog[]
  effects: Readonly<{
    allowanceBefore: string
    allowanceAfter: string
    tokenBalanceDeltas: readonly WethAllowanceSimulationOfflineBalanceDelta[]
    nativeBalanceDeltas: readonly WethAllowanceSimulationOfflineBalanceDelta[]
    otherStateChanges: readonly string[]
  }>
  touchedContracts: readonly string[]
}>

export type WethAllowanceSimulationIngestionCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceSimulationIngestionResult = Readonly<{
  fixtureVersion: typeof WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION
  sourceFormat: typeof WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT | null
  status: 'normalized' | 'blocked'
  checks: readonly WethAllowanceSimulationIngestionCheck[]
  reasons: readonly string[]
  normalizedInput: WethAllowanceSimulationPolicyInput | null
  policyResult: WethAllowanceSimulationPolicyResult | null
  reviewDigest: Hex
  implementationAuthorized: false
  simulationAuthorized: false
  executionEligible: false
  disclaimer: string
}>

const FORBIDDEN_KEYS = new Set([
  'apikey',
  'authorization',
  'calldata',
  'endpoint',
  'gasprice',
  'headers',
  'maxfeepergas',
  'maxpriorityfeepergas',
  'mnemonic',
  'nonce',
  'privatekey',
  'rawcalldata',
  'rawtransaction',
  'rpcurl',
  'seedphrase',
  'selector',
  'signature',
  'signedtransaction',
  'submission',
  'transaction',
  'transactionrequest',
  'txrequest',
  'wallet',
  'walletdata',
])

export function ingestWethAllowanceSimulationFixture(
  raw: unknown,
  reviewedAt = new Date(),
): WethAllowanceSimulationIngestionResult {
  if (Number.isNaN(reviewedAt.getTime())) throw new RangeError('reviewedAt must be valid')

  const root = isRecord(raw) ? raw : null
  const fixtureVersionMatches = root?.fixtureVersion === WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION
  const sourceFormatMatches = root?.sourceFormat === WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT
  const forbiddenKey = findForbiddenKey(raw)

  const checks: WethAllowanceSimulationIngestionCheck[] = [
    ingestionCheck('fixture-object', root !== null, 'Fixture is an object.', 'Fixture must be an object.'),
    ingestionCheck(
      'fixture-version',
      fixtureVersionMatches,
      'Fixture version matches.',
      'Fixture version differs or is missing.',
    ),
    ingestionCheck(
      'source-format',
      sourceFormatMatches,
      'Source format is supported.',
      'Source format is unsupported or missing.',
    ),
    ingestionCheck(
      'raw-material-absent',
      forbiddenKey === null,
      'No forbidden transaction, wallet, provider-secret, or submission field is present.',
      forbiddenKey === null
        ? 'Forbidden raw material is present.'
        : `Forbidden raw material field is present at ${forbiddenKey}.`,
    ),
  ]

  let normalizedInput: WethAllowanceSimulationPolicyInput | null = null
  let policyResult: WethAllowanceSimulationPolicyResult | null = null

  if (checks.every((check) => check.status === 'pass')) {
    try {
      normalizedInput = parseFixture(root as Record<string, unknown>)
      checks.push(ingestionCheck('fixture-schema', true, 'Fixture schema is valid.', 'Fixture schema is invalid.'))
      policyResult = validateWethAllowanceSimulationEvidencePolicy(normalizedInput, reviewedAt)
      checks.push(
        ingestionCheck(
          'policy-conformance',
          policyResult.status === 'policy-conformant',
          'Normalized evidence conforms to the reviewed simulation policy.',
          'Normalized evidence is blocked by the reviewed simulation policy.',
        ),
      )
    } catch (error) {
      checks.push(
        ingestionCheck(
          'fixture-schema',
          false,
          'Fixture schema is valid.',
          error instanceof Error ? error.message : 'Fixture schema is invalid.',
        ),
      )
    }
  }

  const failed = checks.filter((check) => check.status === 'fail')
  const status =
    failed.length === 0 && policyResult?.status === 'policy-conformant' ? ('normalized' as const) : ('blocked' as const)
  const reasons =
    status === 'normalized'
      ? [
          'The sanitized offline fixture was normalized and passed the inert policy validator. This does not authorize a provider call, transaction construction, signing, or execution.',
        ]
      : failed.map((check) => check.message)

  const resultWithoutDigest = {
    fixtureVersion: WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
    sourceFormat: sourceFormatMatches ? WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT : null,
    status,
    checks,
    reasons,
    normalizedInput,
    policyResult,
    implementationAuthorized: false as const,
    simulationAuthorized: false as const,
    executionEligible: false as const,
    disclaimer:
      'This result contains only normalized offline evidence. It does not preserve raw provider payloads, encode calldata, contact a simulator, construct a transaction, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.',
  }

  return {
    ...resultWithoutDigest,
    reviewDigest: keccak256(stringToHex(canonicalJson(resultWithoutDigest))),
  }
}

function parseFixture(root: Record<string, unknown>): WethAllowanceSimulationPolicyInput {
  assertExactKeys(
    root,
    [
      'fixtureVersion',
      'sourceFormat',
      'paper',
      'provider',
      'identity',
      'trace',
      'events',
      'effects',
      'touchedContracts',
    ],
    'fixture',
  )

  const paper = parsePaperReference(root.paper)
  const providers = parseProviderEvidence(root.provider)
  const identity = parseIdentityEvidence(root.identity)
  const calls = expectArray(root.trace, 'fixture.trace').map((value, index) => parseCall(value, index))
  const logs = expectArray(root.events, 'fixture.events').map((value, index) => parseLog(value, index))
  const stateDiff = parseStateDiff(root.effects)
  const touchedContracts = expectArray(root.touchedContracts, 'fixture.touchedContracts').map((value, index) =>
    parseAddress(value, `fixture.touchedContracts[${index}]`),
  )

  return {
    policyVersion: WETH_ALLOWANCE_SIMULATION_POLICY_VERSION,
    paper,
    providers,
    identity,
    calls,
    logs,
    stateDiff,
    touchedContracts,
    containsRawTransactionMaterial: false,
  }
}

function parsePaperReference(value: unknown): WethAllowanceSimulationPaperReference {
  const record = expectRecord(value, 'fixture.paper')
  assertExactKeys(
    record,
    [
      'operation',
      'evidenceDigest',
      'decision',
      'executionEligible',
      'chainId',
      'owner',
      'token',
      'spender',
      'desiredAllowance',
      'nativeValue',
      'sharedBlock',
      'blockHash',
      'observedAt',
      'freshness',
    ],
    'fixture.paper',
  )

  return {
    operation: expectString(record.operation, 'fixture.paper.operation'),
    evidenceDigest: parseHex32(record.evidenceDigest, 'fixture.paper.evidenceDigest'),
    decision: parsePaperDecision(record.decision, 'fixture.paper.decision'),
    executionEligible: expectBoolean(record.executionEligible, 'fixture.paper.executionEligible'),
    chainId: expectInteger(record.chainId, 'fixture.paper.chainId'),
    owner: parseAddress(record.owner, 'fixture.paper.owner'),
    token: parseAddress(record.token, 'fixture.paper.token'),
    spender: parseAddress(record.spender, 'fixture.paper.spender'),
    desiredAllowance: parseUnsignedBigint(record.desiredAllowance, 'fixture.paper.desiredAllowance'),
    nativeValue: parseUnsignedBigint(record.nativeValue, 'fixture.paper.nativeValue'),
    sharedBlock: parseUnsignedBigint(record.sharedBlock, 'fixture.paper.sharedBlock'),
    blockHash: parseHex32(record.blockHash, 'fixture.paper.blockHash'),
    observedAt: parseDate(record.observedAt, 'fixture.paper.observedAt'),
    freshness: expectString(record.freshness, 'fixture.paper.freshness'),
  }
}

function parseProviderEvidence(value: unknown): WethAllowanceSimulationProviderEvidence {
  const record = expectRecord(value, 'fixture.provider')
  assertExactKeys(
    record,
    [
      'status',
      'providerCount',
      'providerAgreement',
      'referencedPaperDigest',
      'sharedBlock',
      'blockHash',
      'observedAt',
      'maximumAgeSeconds',
      'metadataRedacted',
    ],
    'fixture.provider',
  )

  return {
    status: parseProviderStatus(record.status, 'fixture.provider.status'),
    providerCount: expectInteger(record.providerCount, 'fixture.provider.providerCount'),
    providerAgreement: expectBoolean(record.providerAgreement, 'fixture.provider.providerAgreement'),
    referencedPaperDigest: parseHex32(record.referencedPaperDigest, 'fixture.provider.referencedPaperDigest'),
    sharedBlock: parseNullableUnsignedBigint(record.sharedBlock, 'fixture.provider.sharedBlock'),
    blockHash: parseNullableHex32(record.blockHash, 'fixture.provider.blockHash'),
    observedAt: parseNullableDate(record.observedAt, 'fixture.provider.observedAt'),
    maximumAgeSeconds: expectInteger(record.maximumAgeSeconds, 'fixture.provider.maximumAgeSeconds'),
    metadataRedacted: expectBoolean(record.metadataRedacted, 'fixture.provider.metadataRedacted'),
  }
}

function parseIdentityEvidence(value: unknown): WethAllowanceSimulationIdentityEvidence {
  const record = expectRecord(value, 'fixture.identity')
  assertExactKeys(
    record,
    [
      'registryVerified',
      'authorityStatus',
      'authoritySourceAgreement',
      'unresolvedAuthorityBoundaryCount',
      'registryExecutionEligible',
      'authorityExecutionEligible',
      'proxyAddress',
      'proxyBytecodeHash',
      'implementationAddress',
      'implementationBytecodeHash',
    ],
    'fixture.identity',
  )

  return {
    registryVerified: expectBoolean(record.registryVerified, 'fixture.identity.registryVerified'),
    authorityStatus: expectString(record.authorityStatus, 'fixture.identity.authorityStatus'),
    authoritySourceAgreement: expectBoolean(
      record.authoritySourceAgreement,
      'fixture.identity.authoritySourceAgreement',
    ),
    unresolvedAuthorityBoundaryCount: expectInteger(
      record.unresolvedAuthorityBoundaryCount,
      'fixture.identity.unresolvedAuthorityBoundaryCount',
    ),
    registryExecutionEligible: expectBoolean(
      record.registryExecutionEligible,
      'fixture.identity.registryExecutionEligible',
    ),
    authorityExecutionEligible: expectBoolean(
      record.authorityExecutionEligible,
      'fixture.identity.authorityExecutionEligible',
    ),
    proxyAddress: parseAddress(record.proxyAddress, 'fixture.identity.proxyAddress'),
    proxyBytecodeHash: parseHex32(record.proxyBytecodeHash, 'fixture.identity.proxyBytecodeHash'),
    implementationAddress: parseAddress(record.implementationAddress, 'fixture.identity.implementationAddress'),
    implementationBytecodeHash: parseHex32(
      record.implementationBytecodeHash,
      'fixture.identity.implementationBytecodeHash',
    ),
  }
}

function parseCall(value: unknown, index: number): WethAllowanceSimulationCall {
  const path = `fixture.trace[${index}]`
  const record = expectRecord(value, path)
  assertExactKeys(
    record,
    ['id', 'parentId', 'depth', 'type', 'from', 'to', 'nativeValue', 'functionName', 'spender', 'amount'],
    path,
  )

  return {
    id: expectString(record.id, `${path}.id`),
    parentId: parseNullableString(record.parentId, `${path}.parentId`),
    depth: expectInteger(record.depth, `${path}.depth`),
    type: parseCallType(record.type, `${path}.type`),
    from: parseAddress(record.from, `${path}.from`),
    to: parseAddress(record.to, `${path}.to`),
    nativeValue: parseUnsignedBigint(record.nativeValue, `${path}.nativeValue`),
    functionName: expectString(record.functionName, `${path}.functionName`),
    spender: parseAddress(record.spender, `${path}.spender`),
    amount: parseUnsignedBigint(record.amount, `${path}.amount`),
  }
}

function parseLog(value: unknown, index: number): WethAllowanceSimulationLog {
  const path = `fixture.events[${index}]`
  const record = expectRecord(value, path)
  assertExactKeys(record, ['address', 'eventName', 'owner', 'spender', 'value'], path)

  return {
    address: parseAddress(record.address, `${path}.address`),
    eventName: expectString(record.eventName, `${path}.eventName`),
    owner: parseAddress(record.owner, `${path}.owner`),
    spender: parseAddress(record.spender, `${path}.spender`),
    value: parseUnsignedBigint(record.value, `${path}.value`),
  }
}

function parseStateDiff(value: unknown): WethAllowanceSimulationStateDiff {
  const record = expectRecord(value, 'fixture.effects')
  assertExactKeys(
    record,
    ['allowanceBefore', 'allowanceAfter', 'tokenBalanceDeltas', 'nativeBalanceDeltas', 'otherStateChanges'],
    'fixture.effects',
  )

  return {
    allowanceBefore: parseUnsignedBigint(record.allowanceBefore, 'fixture.effects.allowanceBefore'),
    allowanceAfter: parseUnsignedBigint(record.allowanceAfter, 'fixture.effects.allowanceAfter'),
    tokenBalanceDeltas: expectArray(record.tokenBalanceDeltas, 'fixture.effects.tokenBalanceDeltas').map(
      (item, index) => parseBalanceDelta(item, `fixture.effects.tokenBalanceDeltas[${index}]`),
    ),
    nativeBalanceDeltas: expectArray(record.nativeBalanceDeltas, 'fixture.effects.nativeBalanceDeltas').map(
      (item, index) => parseBalanceDelta(item, `fixture.effects.nativeBalanceDeltas[${index}]`),
    ),
    otherStateChanges: expectArray(record.otherStateChanges, 'fixture.effects.otherStateChanges').map((item, index) =>
      expectString(item, `fixture.effects.otherStateChanges[${index}]`),
    ),
  }
}

function parseBalanceDelta(value: unknown, path: string): WethAllowanceSimulationBalanceDelta {
  const record = expectRecord(value, path)
  assertExactKeys(record, ['account', 'asset', 'delta'], path)

  return {
    account: parseAddress(record.account, `${path}.account`),
    asset: record.asset === null ? null : parseAddress(record.asset, `${path}.asset`),
    delta: parseSignedBigint(record.delta, `${path}.delta`),
  }
}

function parsePaperDecision(value: unknown, path: string): WethAllowancePaperDecision {
  if (value === 'blocked' || value === 'noop' || value === 'ready-for-separate-simulation-review') return value
  throw new TypeError(`${path} must be a supported paper decision`)
}

function parseProviderStatus(value: unknown, path: string): 'available' | 'unavailable' {
  if (value === 'available' || value === 'unavailable') return value
  throw new TypeError(`${path} must be available or unavailable`)
}

function parseCallType(value: unknown, path: string): WethAllowanceSimulationCallType {
  if (
    value === 'call' ||
    value === 'delegatecall' ||
    value === 'staticcall' ||
    value === 'create' ||
    value === 'create2' ||
    value === 'selfdestruct'
  ) {
    return value
  }
  throw new TypeError(`${path} must be a supported call type`)
}

function parseAddress(value: unknown, path: string): Address {
  const text = expectString(value, path)
  try {
    return getAddress(text)
  } catch {
    throw new TypeError(`${path} must be a valid EVM address`)
  }
}

function parseHex32(value: unknown, path: string): Hex {
  const text = expectString(value, path)
  if (!/^0x[0-9a-fA-F]{64}$/.test(text)) throw new TypeError(`${path} must be a 32-byte hex value`)
  return text as Hex
}

function parseNullableHex32(value: unknown, path: string): Hex | null {
  return value === null ? null : parseHex32(value, path)
}

function parseUnsignedBigint(value: unknown, path: string): bigint {
  const text = expectString(value, path)
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new TypeError(`${path} must be an unsigned decimal string`)
  return BigInt(text)
}

function parseNullableUnsignedBigint(value: unknown, path: string): bigint | null {
  return value === null ? null : parseUnsignedBigint(value, path)
}

function parseSignedBigint(value: unknown, path: string): bigint {
  const text = expectString(value, path)
  if (!/^-?(0|[1-9][0-9]*)$/.test(text) || text === '-0') {
    throw new TypeError(`${path} must be a signed decimal string`)
  }
  return BigInt(text)
}

function parseDate(value: unknown, path: string): Date {
  const text = expectString(value, path)
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw new TypeError(`${path} must be a valid ISO-8601 timestamp`)
  return date
}

function parseNullableDate(value: unknown, path: string): Date | null {
  return value === null ? null : parseDate(value, path)
}

function parseNullableString(value: unknown, path: string): string | null {
  return value === null ? null : expectString(value, path)
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object`)
  return value
}

function expectArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`)
  return value
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new TypeError(`${path} must be a string`)
  return value
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${path} must be a boolean`)
  return value
}

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${path} must be a safe integer`)
  return value
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[], path: string): void {
  const expectedSet = new Set(expected)
  const extra = Object.keys(record).find((key) => !expectedSet.has(key))
  if (extra !== undefined) throw new TypeError(`${path}.${extra} is not allowed`)
  const missing = expected.find((key) => !(key in record))
  if (missing !== undefined) throw new TypeError(`${path}.${missing} is required`)
}

function findForbiddenKey(value: unknown, path = 'fixture'): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenKey(value[index], `${path}[${index}]`)
      if (nested !== null) return nested
    }
    return null
  }
  if (!isRecord(value)) return null

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    if (FORBIDDEN_KEYS.has(normalizedKey)) return `${path}.${key}`
    const nested = findForbiddenKey(nestedValue, `${path}.${key}`)
    if (nested !== null) return nested
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ingestionCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceSimulationIngestionCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
