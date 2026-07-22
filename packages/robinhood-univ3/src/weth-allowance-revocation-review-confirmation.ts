import { getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { canonicalJson, WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS,
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
  digestWethAllowanceRevocationReviewIntentBody,
  type WethAllowanceRevocationReviewIntent,
  type WethAllowanceRevocationReviewIntentBody,
} from './weth-allowance-revocation-review-intent.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION = '1.0.0' as const
export const WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE = 'REVOKE WETH ALLOWANCE' as const

const INTENT_RESULT_KEYS = [
  'schemaVersion',
  'status',
  'assessedAt',
  'intent',
  'intentId',
  'lifecycle',
  'checks',
  'reasonCodes',
  'reasons',
  'transactionBuildAuthorized',
  'implementationAuthorized',
  'simulationAuthorized',
  'signingEligible',
  'executionEligible',
  'disclaimer',
] as const

const INTENT_KEYS = [
  'schemaVersion',
  'operation',
  'generatedAt',
  'expiresAt',
  'buildCommit',
  'chainId',
  'owner',
  'destination',
  'reviewedImplementation',
  'functionName',
  'token',
  'spender',
  'desiredAllowance',
  'nativeValue',
  'paperEvidenceDigest',
  'reviewReportDigest',
  'policyEvidenceDigest',
  'lifecycleDigest',
  'currentStateDigest',
  'sharedBlock',
  'blockHash',
  'intentId',
] as const

const LIFECYCLE_KEYS = [
  'status',
  'originalReportDigest',
  'currentStateDigest',
  'lifecycleDigest',
  'reasonCodes',
] as const

const CONFIRMATION_KEYS = [
  'intentId',
  'phrase',
  'owner',
  'destination',
  'spender',
  'desiredAllowance',
  'nativeValue',
  'confirmedAt',
  'acknowledgesAllowanceRevocation',
  'acknowledgesNoTokenTransfer',
  'acknowledgesNoTransactionSigningExecutionAuthority',
] as const

const REVIEWED_INTENT_CHECK_CODES = new Set([
  'build-commit',
  'generated-at',
  'assessed-at',
  'generated-not-future',
  'review-window-open',
  'lifecycle-valid',
  'lifecycle-authorization-disabled',
  'report-evidence',
  'policy-evidence-digest',
  'owner-nonzero',
  'operation-boundary',
])

export type WethAllowanceRevocationReviewConfirmationInput = Readonly<{
  intentResult: unknown
  confirmation: unknown
  assessedAt: unknown
}>

export type WethAllowanceRevocationReviewConfirmationBody = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION
  intentId: Hex
  intentExpiresAt: string
  phrase: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE
  owner: Address
  destination: Address
  spender: Address
  desiredAllowance: '0'
  nativeValue: '0'
  confirmedAt: string
  acknowledgesAllowanceRevocation: true
  acknowledgesNoTokenTransfer: true
  acknowledgesNoTransactionSigningExecutionAuthority: true
}>

export type WethAllowanceRevocationReviewConfirmation = WethAllowanceRevocationReviewConfirmationBody &
  Readonly<{
    confirmationId: Hex
  }>

export type WethAllowanceRevocationReviewConfirmationCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceRevocationReviewConfirmationResult = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION
  status: 'blocked' | 'confirmed-for-offline-review'
  assessedAt: string | null
  typedIntentId: Hex | null
  intentExpiresAt: string | null
  confirmation: WethAllowanceRevocationReviewConfirmation | null
  confirmationId: Hex | null
  checks: readonly WethAllowanceRevocationReviewConfirmationCheck[]
  reasonCodes: readonly string[]
  reasons: readonly string[]
  transactionBuildAuthorized: false
  implementationAuthorized: false
  simulationAuthorized: false
  walletRequestAuthorized: false
  signingEligible: false
  executionEligible: false
  reusableAuthority: false
  disclaimer: string
}>

type ValidatedIntentResult = Readonly<{
  assessedAt: Date
  intent: WethAllowanceRevocationReviewIntent
}>

type ParsedConfirmation = Readonly<{
  intentId: Hex
  phrase: string
  owner: Address
  destination: Address
  spender: Address
  desiredAllowance: string
  nativeValue: string
  confirmedAt: Date
  acknowledgesAllowanceRevocation: boolean
  acknowledgesNoTokenTransfer: boolean
  acknowledgesNoTransactionSigningExecutionAuthority: boolean
}>

export function createWethAllowanceRevocationReviewConfirmation(
  input: WethAllowanceRevocationReviewConfirmationInput,
): WethAllowanceRevocationReviewConfirmationResult {
  const intentResult = parseIntentResult(input.intentResult)
  const confirmation = parseConfirmation(input.confirmation)
  const assessedAt = parseDateObject(input.assessedAt)
  const intent = intentResult?.intent ?? null
  const confirmedAt = confirmation?.confirmedAt ?? null
  const generatedAt = intent === null ? null : parseCanonicalIsoDate(intent.generatedAt)
  const expiresAt = intent === null ? null : parseCanonicalIsoDate(intent.expiresAt)

  const checks: WethAllowanceRevocationReviewConfirmationCheck[] = [
    confirmationCheck(
      'intent-result',
      intentResult !== null,
      'Typed review-intent result is valid and complete.',
      'Typed review-intent result is malformed, blocked, incomplete, or outside the reviewed boundary.',
    ),
    confirmationCheck(
      'intent-integrity',
      intent !== null && verifyIntentIntegrity(intent),
      'Typed review-intent ID matches the normalized intent body.',
      'Typed review-intent ID does not match the normalized intent body.',
    ),
    confirmationCheck(
      'confirmation-schema',
      confirmation !== null,
      'Confirmation schema is exact and valid.',
      'Confirmation schema is malformed or contains unsupported fields.',
    ),
    confirmationCheck(
      'assessment-time',
      assessedAt !== null,
      'Assessment timestamp is valid.',
      'Assessment timestamp is invalid.',
    ),
    confirmationCheck(
      'confirmation-intent-id',
      intent !== null && confirmation !== null && confirmation.intentId === intent.intentId,
      'Confirmation references the exact typed intent ID.',
      'Confirmation intent ID differs or is unavailable.',
    ),
    confirmationCheck(
      'confirmation-phrase',
      confirmation?.phrase === WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
      'Confirmation phrase matches exactly.',
      'Confirmation phrase is missing or does not match exactly.',
    ),
    confirmationCheck(
      'confirmation-owner',
      intent !== null && confirmation !== null && confirmation.owner === intent.owner,
      'Confirmation owner matches the typed intent.',
      'Confirmation owner differs or is unavailable.',
    ),
    confirmationCheck(
      'confirmation-destination',
      intent !== null && confirmation !== null && confirmation.destination === intent.destination,
      'Confirmation destination matches the typed intent.',
      'Confirmation destination differs or is unavailable.',
    ),
    confirmationCheck(
      'confirmation-spender',
      intent !== null && confirmation !== null && confirmation.spender === intent.spender,
      'Confirmation spender matches the typed intent.',
      'Confirmation spender differs or is unavailable.',
    ),
    confirmationCheck(
      'confirmation-desired-allowance',
      intent !== null && confirmation !== null && confirmation.desiredAllowance === intent.desiredAllowance,
      'Confirmation desired allowance is exactly zero.',
      'Confirmation desired allowance differs or is unavailable.',
    ),
    confirmationCheck(
      'confirmation-native-value',
      intent !== null && confirmation !== null && confirmation.nativeValue === intent.nativeValue,
      'Confirmation native value is exactly zero.',
      'Confirmation native value differs or is unavailable.',
    ),
    confirmationCheck(
      'acknowledges-allowance-revocation',
      confirmation?.acknowledgesAllowanceRevocation === true,
      'Allowance-revocation acknowledgement is explicit.',
      'Allowance-revocation acknowledgement is missing or false.',
    ),
    confirmationCheck(
      'acknowledges-no-token-transfer',
      confirmation?.acknowledgesNoTokenTransfer === true,
      'No-token-transfer acknowledgement is explicit.',
      'No-token-transfer acknowledgement is missing or false.',
    ),
    confirmationCheck(
      'acknowledges-no-authority',
      confirmation?.acknowledgesNoTransactionSigningExecutionAuthority === true,
      'Non-authorization acknowledgement is explicit.',
      'Non-authorization acknowledgement is missing or false.',
    ),
    confirmationCheck(
      'confirmation-after-generation',
      confirmedAt !== null && generatedAt !== null && confirmedAt.getTime() >= generatedAt.getTime(),
      'Confirmation occurs at or after intent generation.',
      'Confirmation precedes intent generation or timestamps are unavailable.',
    ),
    confirmationCheck(
      'confirmation-after-intent-assessment',
      confirmedAt !== null && intentResult !== null && confirmedAt.getTime() >= intentResult.assessedAt.getTime(),
      'Confirmation occurs at or after typed-intent assessment.',
      'Confirmation precedes typed-intent assessment or timestamps are unavailable.',
    ),
    confirmationCheck(
      'confirmation-before-expiry',
      confirmedAt !== null && expiresAt !== null && confirmedAt.getTime() < expiresAt.getTime(),
      'Confirmation occurs before typed-intent expiry.',
      'Confirmation occurs at or after typed-intent expiry or timestamps are unavailable.',
    ),
    confirmationCheck(
      'confirmation-not-future',
      confirmedAt !== null && assessedAt !== null && confirmedAt.getTime() <= assessedAt.getTime(),
      'Confirmation is not future-dated relative to assessment.',
      'Confirmation is future-dated or timestamps are unavailable.',
    ),
    confirmationCheck(
      'assessment-before-expiry',
      assessedAt !== null && expiresAt !== null && assessedAt.getTime() < expiresAt.getTime(),
      'Assessment occurs before typed-intent expiry.',
      'Assessment occurs at or after typed-intent expiry or timestamps are unavailable.',
    ),
  ]

  let normalizedConfirmation: WethAllowanceRevocationReviewConfirmation | null = null
  const failedChecks = checks.filter((check) => check.status === 'fail')
  if (
    failedChecks.length === 0 &&
    intent !== null &&
    confirmation !== null &&
    confirmedAt !== null &&
    expiresAt !== null
  ) {
    const body: WethAllowanceRevocationReviewConfirmationBody = {
      schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION,
      intentId: intent.intentId,
      intentExpiresAt: expiresAt.toISOString(),
      phrase: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
      owner: intent.owner,
      destination: intent.destination,
      spender: intent.spender,
      desiredAllowance: '0',
      nativeValue: '0',
      confirmedAt: confirmedAt.toISOString(),
      acknowledgesAllowanceRevocation: true,
      acknowledgesNoTokenTransfer: true,
      acknowledgesNoTransactionSigningExecutionAuthority: true,
    }
    const confirmationId = digestWethAllowanceRevocationReviewConfirmationBody(body)
    normalizedConfirmation = { ...body, confirmationId }
  }

  const status = normalizedConfirmation === null ? ('blocked' as const) : ('confirmed-for-offline-review' as const)
  const reasonCodes = checks.filter((check) => check.status === 'fail').map((check) => check.code)
  const reasons =
    status === 'confirmed-for-offline-review'
      ? [
          'The typed intent has been deliberately acknowledged for offline review only. This confirmation is not reusable transaction, wallet, signing, or execution authority.',
        ]
      : checks.filter((check) => check.status === 'fail').map((check) => check.message)

  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_VERSION,
    status,
    assessedAt: assessedAt?.toISOString() ?? null,
    typedIntentId: intent?.intentId ?? null,
    intentExpiresAt: expiresAt?.toISOString() ?? null,
    confirmation: normalizedConfirmation,
    confirmationId: normalizedConfirmation?.confirmationId ?? null,
    checks,
    reasonCodes,
    reasons,
    transactionBuildAuthorized: false,
    implementationAuthorized: false,
    simulationAuthorized: false,
    walletRequestAuthorized: false,
    signingEligible: false,
    executionEligible: false,
    reusableAuthority: false,
    disclaimer:
      'This offline confirmation is a non-reusable acknowledgement record only. It contains no provider request, selector, ABI data, calldata, transaction request, wallet state, signature, nonce, gas field, submission field, receipt, money movement, or execution authority.',
  }
}

export function digestWethAllowanceRevocationReviewConfirmationBody(
  body: WethAllowanceRevocationReviewConfirmationBody,
): Hex {
  return keccak256(stringToHex(canonicalJson(body)))
}

function parseIntentResult(value: unknown): ValidatedIntentResult | null {
  if (!isRecord(value) || !hasExactKeys(value, INTENT_RESULT_KEYS)) return null
  if (
    value.schemaVersion !== WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION ||
    value.status !== 'ready-for-human-review' ||
    value.transactionBuildAuthorized !== false ||
    value.implementationAuthorized !== false ||
    value.simulationAuthorized !== false ||
    value.signingEligible !== false ||
    value.executionEligible !== false
  ) {
    return null
  }

  const assessedAt = parseCanonicalIsoDate(value.assessedAt)
  const intent = parseIntent(value.intent)
  if (assessedAt === null || intent === null || value.intentId !== intent.intentId) return null
  if (!validateIntentChecks(value.checks)) return null
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length !== 0) return null
  if (!Array.isArray(value.reasons) || typeof value.disclaimer !== 'string') return null
  if (!validateLifecycleReference(value.lifecycle, intent)) return null
  if (assessedAt.getTime() < new Date(intent.generatedAt).getTime()) return null
  if (assessedAt.getTime() >= new Date(intent.expiresAt).getTime()) return null

  return { assessedAt, intent }
}

function parseIntent(value: unknown): WethAllowanceRevocationReviewIntent | null {
  if (!isRecord(value) || !hasExactKeys(value, INTENT_KEYS)) return null
  if (
    value.schemaVersion !== WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION ||
    value.operation !== WETH_ALLOWANCE_REVOCATION_OPERATION ||
    value.chainId !== ROBINHOOD_CHAIN_ID ||
    value.functionName !== 'approve' ||
    value.desiredAllowance !== '0' ||
    value.nativeValue !== '0'
  ) {
    return null
  }

  const generatedAt = parseCanonicalIsoDate(value.generatedAt)
  const expiresAt = parseCanonicalIsoDate(value.expiresAt)
  const owner = parseAddress(value.owner)
  const destination = parseAddress(value.destination)
  const reviewedImplementation = parseAddress(value.reviewedImplementation)
  const token = parseAddress(value.token)
  const spender = parseAddress(value.spender)
  const intentId = parseHex32(value.intentId)
  const paperEvidenceDigest = parseHex32(value.paperEvidenceDigest)
  const reviewReportDigest = parseHex32(value.reviewReportDigest)
  const policyEvidenceDigest = parseHex32(value.policyEvidenceDigest)
  const lifecycleDigest = parseHex32(value.lifecycleDigest)
  const currentStateDigest = parseHex32(value.currentStateDigest)
  const blockHash = parseHex32(value.blockHash)

  if (
    generatedAt === null ||
    expiresAt === null ||
    expiresAt.getTime() - generatedAt.getTime() !== WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000 ||
    typeof value.buildCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.buildCommit) ||
    owner === null ||
    owner === zeroAddress ||
    destination !== ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address ||
    reviewedImplementation !== ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address ||
    token !== ROBINHOOD_UNISWAP_V3.wrappedNative ||
    spender !== ROBINHOOD_UNISWAP_V3.positionManager ||
    intentId === null ||
    paperEvidenceDigest === null ||
    reviewReportDigest === null ||
    policyEvidenceDigest === null ||
    lifecycleDigest === null ||
    currentStateDigest === null ||
    blockHash === null ||
    typeof value.sharedBlock !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value.sharedBlock)
  ) {
    return null
  }

  const body: WethAllowanceRevocationReviewIntentBody = {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
    operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    buildCommit: value.buildCommit,
    chainId: ROBINHOOD_CHAIN_ID,
    owner,
    destination,
    reviewedImplementation,
    functionName: 'approve',
    token,
    spender,
    desiredAllowance: '0',
    nativeValue: '0',
    paperEvidenceDigest,
    reviewReportDigest,
    policyEvidenceDigest,
    lifecycleDigest,
    currentStateDigest,
    sharedBlock: value.sharedBlock,
    blockHash,
  }
  if (digestWethAllowanceRevocationReviewIntentBody(body) !== intentId) return null
  return { ...body, intentId }
}

function validateIntentChecks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== REVIEWED_INTENT_CHECK_CODES.size) return false
  const observed = new Set<string>()
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, ['code', 'status', 'message'])) return false
    if (
      typeof item.code !== 'string' ||
      !REVIEWED_INTENT_CHECK_CODES.has(item.code) ||
      observed.has(item.code) ||
      item.status !== 'pass' ||
      typeof item.message !== 'string'
    ) {
      return false
    }
    observed.add(item.code)
  }
  return observed.size === REVIEWED_INTENT_CHECK_CODES.size
}

function validateLifecycleReference(value: unknown, intent: WethAllowanceRevocationReviewIntent): boolean {
  if (!isRecord(value) || !hasExactKeys(value, LIFECYCLE_KEYS)) return false
  if (value.status !== 'valid-for-human-review') return false
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length !== 0) return false
  const originalReportDigest = parseHex32(value.originalReportDigest)
  const currentStateDigest = parseHex32(value.currentStateDigest)
  const lifecycleDigest = parseHex32(value.lifecycleDigest)
  return (
    originalReportDigest === intent.reviewReportDigest &&
    currentStateDigest === intent.currentStateDigest &&
    lifecycleDigest === intent.lifecycleDigest
  )
}

function parseConfirmation(value: unknown): ParsedConfirmation | null {
  if (!isRecord(value) || !hasExactKeys(value, CONFIRMATION_KEYS)) return null
  const intentId = parseHex32(value.intentId)
  const owner = parseAddress(value.owner)
  const destination = parseAddress(value.destination)
  const spender = parseAddress(value.spender)
  const confirmedAt = parseDateObject(value.confirmedAt)
  if (
    intentId === null ||
    typeof value.phrase !== 'string' ||
    owner === null ||
    destination === null ||
    spender === null ||
    typeof value.desiredAllowance !== 'string' ||
    typeof value.nativeValue !== 'string' ||
    confirmedAt === null ||
    typeof value.acknowledgesAllowanceRevocation !== 'boolean' ||
    typeof value.acknowledgesNoTokenTransfer !== 'boolean' ||
    typeof value.acknowledgesNoTransactionSigningExecutionAuthority !== 'boolean'
  ) {
    return null
  }

  return {
    intentId,
    phrase: value.phrase,
    owner,
    destination,
    spender,
    desiredAllowance: value.desiredAllowance,
    nativeValue: value.nativeValue,
    confirmedAt,
    acknowledgesAllowanceRevocation: value.acknowledgesAllowanceRevocation,
    acknowledgesNoTokenTransfer: value.acknowledgesNoTokenTransfer,
    acknowledgesNoTransactionSigningExecutionAuthority: value.acknowledgesNoTransactionSigningExecutionAuthority,
  }
}

function parseAddress(value: unknown): Address | null {
  if (typeof value !== 'string') return null
  try {
    return getAddress(value)
  } catch {
    return null
  }
}

function parseHex32(value: unknown): Hex | null {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hex) : null
}

function parseCanonicalIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value ? date : null
}

function parseDateObject(value: unknown): Date | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? new Date(value.getTime()) : null
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(record)
  return actualKeys.length === keys.length && keys.every((key) => key in record)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function verifyIntentIntegrity(intent: WethAllowanceRevocationReviewIntent): boolean {
  const { intentId, ...body } = intent
  return digestWethAllowanceRevocationReviewIntentBody(body) === intentId
}

function confirmationCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceRevocationReviewConfirmationCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
