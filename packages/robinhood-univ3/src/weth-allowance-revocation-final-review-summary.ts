import { getAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { canonicalJson, WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  evaluateWethAllowanceRevocationReviewConfirmationLifecycle,
  type WethAllowanceRevocationReviewConfirmationLifecycleResult,
} from './weth-allowance-revocation-review-confirmation-lifecycle.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS,
  createWethAllowanceRevocationReviewIntent,
} from './weth-allowance-revocation-review-intent.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

export const WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION = '1.0.0' as const
export const ROBINHOOD_CHAIN_DISPLAY_NAME = 'Robinhood Chain' as const
export const WETH_DISPLAY_LABEL = 'WETH' as const
export const WETH_DECIMALS = 18 as const
export const WETH_PROXY_DISPLAY_LABEL = 'Robinhood Wrapped Ether proxy' as const
export const POSITION_MANAGER_DISPLAY_LABEL = 'Uniswap v3 position manager' as const

const CURRENT_STATE_KEYS = [
  'incidentDisabled',
  'operation',
  'chainId',
  'owner',
  'token',
  'proxyAddress',
  'implementationAddress',
  'spender',
  'paperEvidenceDigest',
  'sharedBlock',
  'blockHash',
  'currentAllowance',
  'registryVerified',
  'authorityStatus',
  'authoritySourceAgreement',
  'unresolvedAuthorityBoundaryCount',
  'providerAgreement',
  'freshness',
] as const

const CRITICAL_WARNINGS = Object.freeze([
  'OFFLINE REVIEW ONLY: this summary does not authorize transaction construction.',
  'NO WALLET AUTHORITY: this summary does not authorize a wallet connection or wallet request.',
  'NO SIGNING OR EXECUTION AUTHORITY: this summary cannot request a signature, submit a transaction, or move funds.',
  'NON-REUSABLE CONFIRMATION: the deliberate confirmation is bound to this exact intent and expires with it.',
] as const)

export type WethAllowanceRevocationFinalReviewSummaryInput = Readonly<{
  intentResult: unknown
  confirmationResult: unknown
  report: unknown
  currentState: unknown
  buildCommit: unknown
  generatedAt: unknown
  assessedAt: unknown
}>

export type WethAllowanceRevocationFinalReviewSummaryBody = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION
  status: 'ready-for-offline-display'
  operation: typeof WETH_ALLOWANCE_REVOCATION_OPERATION
  chain: Readonly<{
    name: typeof ROBINHOOD_CHAIN_DISPLAY_NAME
    chainId: typeof ROBINHOOD_CHAIN_ID
  }>
  owner: Address
  destination: Readonly<{
    label: typeof WETH_PROXY_DISPLAY_LABEL
    address: Address
  }>
  reviewedImplementation: Address
  functionName: 'approve'
  token: Readonly<{
    label: typeof WETH_DISPLAY_LABEL
    address: Address
    decimals: typeof WETH_DECIMALS
  }>
  spender: Readonly<{
    label: typeof POSITION_MANAGER_DISPLAY_LABEL
    address: Address
  }>
  currentReviewedAllowance: string
  desiredAllowance: '0'
  nativeValue: '0'
  actionEffect: Readonly<{
    revokesAllowance: true
    transfersTokens: false
    description: 'Revoke the pinned WETH allowance for the pinned Uniswap v3 position manager without transferring tokens.'
  }>
  generatedAt: string
  expiresAt: string
  confirmedAt: string
  assessedAt: string
  buildCommit: string
  sharedBlock: string
  blockHash: Hex
  evidence: Readonly<{
    paperDigest: Hex
    reviewReportDigest: Hex
    policyDigest: Hex
    currentStateDigest: Hex
    intentId: Hex
    confirmationId: Hex
    confirmationLifecycleDigest: Hex
  }>
  criticalWarnings: typeof CRITICAL_WARNINGS
}>

export type WethAllowanceRevocationFinalReviewSummary = WethAllowanceRevocationFinalReviewSummaryBody &
  Readonly<{
    summaryId: Hex
  }>

export type WethAllowanceRevocationFinalReviewSummaryCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceRevocationFinalReviewSummaryLifecycleReference = Readonly<{
  status: WethAllowanceRevocationReviewConfirmationLifecycleResult['status']
  originalIntentId: Hex | null
  originalConfirmationId: Hex | null
  currentIntentId: Hex | null
  lifecycleDigest: Hex
  reasonCodes: readonly string[]
}>

export type WethAllowanceRevocationFinalReviewSummaryResult = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION
  status: 'blocked' | 'ready-for-offline-display'
  summary: WethAllowanceRevocationFinalReviewSummary | null
  summaryId: Hex | null
  renderedText: string | null
  lifecycle: WethAllowanceRevocationFinalReviewSummaryLifecycleReference
  checks: readonly WethAllowanceRevocationFinalReviewSummaryCheck[]
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

type ParsedCurrentState = Readonly<{
  currentAllowance: bigint
}>

export function createWethAllowanceRevocationFinalReviewSummary(
  input: WethAllowanceRevocationFinalReviewSummaryInput,
): WethAllowanceRevocationFinalReviewSummaryResult {
  const lifecycle = evaluateWethAllowanceRevocationReviewConfirmationLifecycle(input)
  const currentIntentResult = createWethAllowanceRevocationReviewIntent({
    report: input.report,
    currentState: input.currentState,
    buildCommit: input.buildCommit,
    generatedAt: input.generatedAt,
    assessedAt: input.assessedAt,
  })
  const intent = currentIntentResult.intent
  const currentState = parseCurrentState(input.currentState)

  const lifecycleAuthorizationDisabled =
    lifecycle.transactionBuildAuthorized === false &&
    lifecycle.implementationAuthorized === false &&
    lifecycle.simulationAuthorized === false &&
    lifecycle.walletRequestAuthorized === false &&
    lifecycle.signingEligible === false &&
    lifecycle.executionEligible === false &&
    lifecycle.reusableAuthority === false

  const checks: WethAllowanceRevocationFinalReviewSummaryCheck[] = [
    summaryCheck(
      'confirmation-lifecycle-valid',
      lifecycle.status === 'valid-for-offline-review',
      'Deliberate-confirmation lifecycle remains valid for offline review.',
      'Deliberate-confirmation lifecycle is invalidated.',
    ),
    summaryCheck(
      'confirmation-lifecycle-authorization-disabled',
      lifecycleAuthorizationDisabled,
      'All deliberate-confirmation lifecycle authorization flags remain disabled.',
      'A deliberate-confirmation lifecycle authorization flag is not disabled.',
    ),
    summaryCheck(
      'current-intent-valid',
      currentIntentResult.status === 'ready-for-human-review' && intent !== null,
      'Current evidence reproduces a valid typed review intent.',
      'Current evidence does not reproduce a valid typed review intent.',
    ),
    summaryCheck(
      'intent-identifier-stable',
      intent !== null &&
        lifecycle.originalIntentId !== null &&
        lifecycle.currentIntentId !== null &&
        intent.intentId === lifecycle.originalIntentId &&
        intent.intentId === lifecycle.currentIntentId,
      'Current, original, and confirmed typed-intent identifiers match.',
      'Typed-intent identifiers differ or are unavailable.',
    ),
    summaryCheck(
      'confirmation-identifier-present',
      lifecycle.originalConfirmationId !== null,
      'Original deliberate-confirmation identifier is present.',
      'Original deliberate-confirmation identifier is unavailable.',
    ),
    summaryCheck(
      'confirmation-timestamp-present',
      lifecycle.confirmedAt !== null,
      'Deliberate-confirmation timestamp is present.',
      'Deliberate-confirmation timestamp is unavailable.',
    ),
    summaryCheck(
      'assessment-timestamp-present',
      lifecycle.assessedAt !== null,
      'Current lifecycle assessment timestamp is present.',
      'Current lifecycle assessment timestamp is unavailable.',
    ),
    summaryCheck(
      'current-state-normalized',
      currentState !== null && currentState.currentAllowance > 0n,
      'Current reviewed allowance is a positive exact integer.',
      'Current reviewed allowance is missing, malformed, or not positive.',
    ),
    summaryCheck(
      'operation-boundary',
      intent !== null &&
        intent.operation === WETH_ALLOWANCE_REVOCATION_OPERATION &&
        intent.chainId === ROBINHOOD_CHAIN_ID &&
        intent.destination === ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address &&
        intent.reviewedImplementation === ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address &&
        intent.functionName === 'approve' &&
        intent.token === ROBINHOOD_UNISWAP_V3.wrappedNative &&
        intent.spender === ROBINHOOD_UNISWAP_V3.positionManager &&
        intent.desiredAllowance === '0' &&
        intent.nativeValue === '0',
      'Typed intent matches the exact pinned WETH allowance-revocation display boundary.',
      'Typed intent differs from the pinned WETH allowance-revocation display boundary.',
    ),
  ]

  for (const reasonCode of lifecycle.reasonCodes) {
    checks.push(
      summaryCheck(
        `confirmation-lifecycle-${reasonCode}`,
        false,
        'Confirmation lifecycle check passed.',
        `Confirmation lifecycle invalidation remains active: ${reasonCode}.`,
      ),
    )
  }

  let summary: WethAllowanceRevocationFinalReviewSummary | null = null
  if (
    checks.every((check) => check.status === 'pass') &&
    intent !== null &&
    currentState !== null &&
    lifecycle.originalConfirmationId !== null &&
    lifecycle.confirmedAt !== null &&
    lifecycle.assessedAt !== null
  ) {
    const body: WethAllowanceRevocationFinalReviewSummaryBody = {
      schemaVersion: WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION,
      status: 'ready-for-offline-display',
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      chain: {
        name: ROBINHOOD_CHAIN_DISPLAY_NAME,
        chainId: ROBINHOOD_CHAIN_ID,
      },
      owner: intent.owner,
      destination: {
        label: WETH_PROXY_DISPLAY_LABEL,
        address: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
      },
      reviewedImplementation: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
      functionName: 'approve',
      token: {
        label: WETH_DISPLAY_LABEL,
        address: ROBINHOOD_UNISWAP_V3.wrappedNative,
        decimals: WETH_DECIMALS,
      },
      spender: {
        label: POSITION_MANAGER_DISPLAY_LABEL,
        address: ROBINHOOD_UNISWAP_V3.positionManager,
      },
      currentReviewedAllowance: currentState.currentAllowance.toString(),
      desiredAllowance: '0',
      nativeValue: '0',
      actionEffect: {
        revokesAllowance: true,
        transfersTokens: false,
        description:
          'Revoke the pinned WETH allowance for the pinned Uniswap v3 position manager without transferring tokens.',
      },
      generatedAt: intent.generatedAt,
      expiresAt: intent.expiresAt,
      confirmedAt: lifecycle.confirmedAt,
      assessedAt: lifecycle.assessedAt,
      buildCommit: intent.buildCommit,
      sharedBlock: intent.sharedBlock,
      blockHash: intent.blockHash,
      evidence: {
        paperDigest: intent.paperEvidenceDigest,
        reviewReportDigest: intent.reviewReportDigest,
        policyDigest: intent.policyEvidenceDigest,
        currentStateDigest: intent.currentStateDigest,
        intentId: intent.intentId,
        confirmationId: lifecycle.originalConfirmationId,
        confirmationLifecycleDigest: lifecycle.lifecycleDigest,
      },
      criticalWarnings: CRITICAL_WARNINGS,
    }
    const summaryId = digestWethAllowanceRevocationFinalReviewSummaryBody(body)
    summary = { ...body, summaryId }
  }

  const status = summary === null ? ('blocked' as const) : ('ready-for-offline-display' as const)
  const reasonCodes = checks.filter((check) => check.status === 'fail').map((check) => check.code)
  const reasons =
    status === 'ready-for-offline-display'
      ? [
          'The deterministic summary is ready for offline display only. It does not authorize transaction construction, wallet access, signing, execution, or reusable authority.',
        ]
      : checks.filter((check) => check.status === 'fail').map((check) => check.message)

  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION,
    status,
    summary,
    summaryId: summary?.summaryId ?? null,
    renderedText: summary === null ? null : renderWethAllowanceRevocationFinalReviewSummary(summary),
    lifecycle: {
      status: lifecycle.status,
      originalIntentId: lifecycle.originalIntentId,
      originalConfirmationId: lifecycle.originalConfirmationId,
      currentIntentId: lifecycle.currentIntentId,
      lifecycleDigest: lifecycle.lifecycleDigest,
      reasonCodes: [...lifecycle.reasonCodes],
    },
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
      'This offline final review summary is display evidence only. It contains no provider request, selector, ABI data, calldata, transaction request, wallet state, signature, nonce, gas field, submission field, receipt, money movement, or execution authority.',
  }
}

export function digestWethAllowanceRevocationFinalReviewSummaryBody(
  body: WethAllowanceRevocationFinalReviewSummaryBody,
): Hex {
  return keccak256(stringToHex(canonicalJson(body)))
}

export function renderWethAllowanceRevocationFinalReviewSummary(value: unknown): string | null {
  const summary = parseFinalReviewSummary(value)
  if (summary === null) return null

  return [
    'OFFLINE FINAL REVIEW SUMMARY',
    `Status: ${summary.status}`,
    `Operation: ${summary.operation}`,
    `Chain: ${summary.chain.name} (${summary.chain.chainId})`,
    `Owner: ${summary.owner}`,
    `Destination: ${summary.destination.label} (${summary.destination.address})`,
    `Reviewed implementation: ${summary.reviewedImplementation}`,
    `Function: ${summary.functionName}`,
    `Token: ${summary.token.label} (${summary.token.address}, decimals ${summary.token.decimals})`,
    `Spender: ${summary.spender.label} (${summary.spender.address})`,
    `Current reviewed allowance: ${summary.currentReviewedAllowance}`,
    `Desired allowance: ${summary.desiredAllowance}`,
    `Native value: ${summary.nativeValue}`,
    `Action effect: ${summary.actionEffect.description}`,
    `Generated at: ${summary.generatedAt}`,
    `Expires at: ${summary.expiresAt}`,
    `Confirmed at: ${summary.confirmedAt}`,
    `Assessed at: ${summary.assessedAt}`,
    `Build commit: ${summary.buildCommit}`,
    `Shared block: ${summary.sharedBlock}`,
    `Block hash: ${summary.blockHash}`,
    `Paper digest: ${summary.evidence.paperDigest}`,
    `Review report digest: ${summary.evidence.reviewReportDigest}`,
    `Policy digest: ${summary.evidence.policyDigest}`,
    `Current-state digest: ${summary.evidence.currentStateDigest}`,
    `Intent ID: ${summary.evidence.intentId}`,
    `Confirmation ID: ${summary.evidence.confirmationId}`,
    `Confirmation lifecycle digest: ${summary.evidence.confirmationLifecycleDigest}`,
    'CRITICAL WARNINGS:',
    ...summary.criticalWarnings.map((warning) => `- ${warning}`),
    `Summary ID: ${summary.summaryId}`,
  ].join('\n')
}

function parseFinalReviewSummary(value: unknown): WethAllowanceRevocationFinalReviewSummary | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schemaVersion',
      'status',
      'operation',
      'chain',
      'owner',
      'destination',
      'reviewedImplementation',
      'functionName',
      'token',
      'spender',
      'currentReviewedAllowance',
      'desiredAllowance',
      'nativeValue',
      'actionEffect',
      'generatedAt',
      'expiresAt',
      'confirmedAt',
      'assessedAt',
      'buildCommit',
      'sharedBlock',
      'blockHash',
      'evidence',
      'criticalWarnings',
      'summaryId',
    ])
  ) {
    return null
  }
  if (
    value.schemaVersion !== WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION ||
    value.status !== 'ready-for-offline-display' ||
    value.operation !== WETH_ALLOWANCE_REVOCATION_OPERATION ||
    value.functionName !== 'approve' ||
    value.desiredAllowance !== '0' ||
    value.nativeValue !== '0'
  ) {
    return null
  }
  if (
    !isRecord(value.chain) ||
    !hasExactKeys(value.chain, ['name', 'chainId']) ||
    value.chain.name !== ROBINHOOD_CHAIN_DISPLAY_NAME ||
    value.chain.chainId !== ROBINHOOD_CHAIN_ID
  ) {
    return null
  }
  if (
    !isRecord(value.destination) ||
    !hasExactKeys(value.destination, ['label', 'address']) ||
    value.destination.label !== WETH_PROXY_DISPLAY_LABEL
  ) {
    return null
  }
  if (
    !isRecord(value.token) ||
    !hasExactKeys(value.token, ['label', 'address', 'decimals']) ||
    value.token.label !== WETH_DISPLAY_LABEL ||
    value.token.decimals !== WETH_DECIMALS
  ) {
    return null
  }
  if (
    !isRecord(value.spender) ||
    !hasExactKeys(value.spender, ['label', 'address']) ||
    value.spender.label !== POSITION_MANAGER_DISPLAY_LABEL
  ) {
    return null
  }
  if (
    !isRecord(value.actionEffect) ||
    !hasExactKeys(value.actionEffect, ['revokesAllowance', 'transfersTokens', 'description']) ||
    value.actionEffect.revokesAllowance !== true ||
    value.actionEffect.transfersTokens !== false ||
    value.actionEffect.description !==
      'Revoke the pinned WETH allowance for the pinned Uniswap v3 position manager without transferring tokens.'
  ) {
    return null
  }
  if (
    !isRecord(value.evidence) ||
    !hasExactKeys(value.evidence, [
      'paperDigest',
      'reviewReportDigest',
      'policyDigest',
      'currentStateDigest',
      'intentId',
      'confirmationId',
      'confirmationLifecycleDigest',
    ])
  ) {
    return null
  }

  const owner = parseAddress(value.owner)
  const destination = parseAddress(value.destination.address)
  const reviewedImplementation = parseAddress(value.reviewedImplementation)
  const token = parseAddress(value.token.address)
  const spender = parseAddress(value.spender.address)
  const generatedAt = parseCanonicalIsoDate(value.generatedAt)
  const expiresAt = parseCanonicalIsoDate(value.expiresAt)
  const confirmedAt = parseCanonicalIsoDate(value.confirmedAt)
  const assessedAt = parseCanonicalIsoDate(value.assessedAt)
  const blockHash = parseHex32(value.blockHash)
  const paperDigest = parseHex32(value.evidence.paperDigest)
  const reviewReportDigest = parseHex32(value.evidence.reviewReportDigest)
  const policyDigest = parseHex32(value.evidence.policyDigest)
  const currentStateDigest = parseHex32(value.evidence.currentStateDigest)
  const intentId = parseHex32(value.evidence.intentId)
  const confirmationId = parseHex32(value.evidence.confirmationId)
  const confirmationLifecycleDigest = parseHex32(value.evidence.confirmationLifecycleDigest)
  const summaryId = parseHex32(value.summaryId)

  if (
    owner === null ||
    owner === zeroAddress ||
    destination !== ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address ||
    reviewedImplementation !== ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address ||
    token !== ROBINHOOD_UNISWAP_V3.wrappedNative ||
    spender !== ROBINHOOD_UNISWAP_V3.positionManager ||
    generatedAt === null ||
    expiresAt === null ||
    confirmedAt === null ||
    assessedAt === null ||
    expiresAt.getTime() - generatedAt.getTime() !== WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000 ||
    confirmedAt.getTime() < generatedAt.getTime() ||
    assessedAt.getTime() < confirmedAt.getTime() ||
    assessedAt.getTime() >= expiresAt.getTime() ||
    typeof value.buildCommit !== 'string' ||
    !/^[0-9a-f]{40}$/.test(value.buildCommit) ||
    typeof value.sharedBlock !== 'string' ||
    !/^(0|[1-9][0-9]*)$/.test(value.sharedBlock) ||
    typeof value.currentReviewedAllowance !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.currentReviewedAllowance) ||
    blockHash === null ||
    paperDigest === null ||
    reviewReportDigest === null ||
    policyDigest === null ||
    currentStateDigest === null ||
    intentId === null ||
    confirmationId === null ||
    confirmationLifecycleDigest === null ||
    summaryId === null ||
    !hasExactWarnings(value.criticalWarnings)
  ) {
    return null
  }

  const body: WethAllowanceRevocationFinalReviewSummaryBody = {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION,
    status: 'ready-for-offline-display',
    operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
    chain: { name: ROBINHOOD_CHAIN_DISPLAY_NAME, chainId: ROBINHOOD_CHAIN_ID },
    owner,
    destination: { label: WETH_PROXY_DISPLAY_LABEL, address: destination },
    reviewedImplementation,
    functionName: 'approve',
    token: { label: WETH_DISPLAY_LABEL, address: token, decimals: WETH_DECIMALS },
    spender: { label: POSITION_MANAGER_DISPLAY_LABEL, address: spender },
    currentReviewedAllowance: value.currentReviewedAllowance,
    desiredAllowance: '0',
    nativeValue: '0',
    actionEffect: {
      revokesAllowance: true,
      transfersTokens: false,
      description:
        'Revoke the pinned WETH allowance for the pinned Uniswap v3 position manager without transferring tokens.',
    },
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    confirmedAt: confirmedAt.toISOString(),
    assessedAt: assessedAt.toISOString(),
    buildCommit: value.buildCommit,
    sharedBlock: value.sharedBlock,
    blockHash,
    evidence: {
      paperDigest,
      reviewReportDigest,
      policyDigest,
      currentStateDigest,
      intentId,
      confirmationId,
      confirmationLifecycleDigest,
    },
    criticalWarnings: CRITICAL_WARNINGS,
  }
  if (digestWethAllowanceRevocationFinalReviewSummaryBody(body) !== summaryId) return null
  return { ...body, summaryId }
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
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) return null
  return parsed
}

function hasExactWarnings(value: unknown): value is typeof CRITICAL_WARNINGS {
  return (
    Array.isArray(value) &&
    value.length === CRITICAL_WARNINGS.length &&
    value.every((warning, index) => warning === CRITICAL_WARNINGS[index])
  )
}

function parseCurrentState(value: unknown): ParsedCurrentState | null {
  if (!isRecord(value) || !hasExactKeys(value, CURRENT_STATE_KEYS)) return null
  if (typeof value.currentAllowance !== 'bigint') return null
  return { currentAllowance: value.currentAllowance }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(record)
  const expectedKeys = new Set(keys)
  return actualKeys.length === expectedKeys.size && actualKeys.every((key) => expectedKeys.has(key))
}

function summaryCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceRevocationFinalReviewSummaryCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
