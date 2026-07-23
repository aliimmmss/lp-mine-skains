import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
  createWethAllowanceRevocationReviewConfirmation,
} from './weth-allowance-revocation-review-confirmation.js'
import { evaluateWethAllowanceRevocationReviewConfirmationLifecycle } from './weth-allowance-revocation-review-confirmation-lifecycle.js'
import { createWethAllowanceRevocationReviewIntent } from './weth-allowance-revocation-review-intent.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  ingestWethAllowanceSimulationFixture,
  type WethAllowanceSimulationOfflineFixture,
} from './weth-allowance-simulation-ingestion.js'
import type { WethAllowanceSimulationReviewCurrentState } from './weth-allowance-simulation-review-lifecycle.js'
import { createWethAllowanceSimulationReviewReport } from './weth-allowance-simulation-review-report.js'
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const evidenceReviewedAt = new Date('2026-07-23T04:00:00.000Z')
const intentGeneratedAt = new Date('2026-07-23T04:00:10.000Z')
const intentAssessedAt = new Date('2026-07-23T04:00:20.000Z')
const confirmedAt = new Date('2026-07-23T04:00:30.000Z')
const confirmationAssessedAt = new Date('2026-07-23T04:00:40.000Z')
const lifecycleAssessedAt = new Date('2026-07-23T04:00:50.000Z')
const buildCommit = 'a'.repeat(40)
const otherBuildCommit = 'b'.repeat(40)
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const otherOwner = getAddress('0x0000000000000000000000000000000000000001')
const otherAddress = getAddress('0x0000000000000000000000000000000000000002')
const paperDigest = `0x${'11'.repeat(32)}` as const
const otherDigest = `0x${'33'.repeat(32)}` as const
const blockHash = `0x${'22'.repeat(32)}` as const
const otherBlockHash = `0x${'44'.repeat(32)}` as const

function validFixture(): WethAllowanceSimulationOfflineFixture {
  const identity = defaultWethAllowanceSimulationIdentityEvidence()

  return {
    fixtureVersion: WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
    sourceFormat: WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
    paper: {
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      evidenceDigest: paperDigest,
      decision: 'ready-for-separate-simulation-review',
      executionEligible: false,
      chainId: ROBINHOOD_CHAIN_ID,
      owner,
      token: ROBINHOOD_UNISWAP_V3.wrappedNative,
      spender: ROBINHOOD_UNISWAP_V3.positionManager,
      desiredAllowance: '0',
      nativeValue: '0',
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-23T03:59:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-23T03:59:30.000Z',
      maximumAgeSeconds: 300,
      metadataRedacted: true,
    },
    identity: {
      registryVerified: identity.registryVerified,
      authorityStatus: identity.authorityStatus,
      authoritySourceAgreement: identity.authoritySourceAgreement,
      unresolvedAuthorityBoundaryCount: identity.unresolvedAuthorityBoundaryCount,
      registryExecutionEligible: identity.registryExecutionEligible,
      authorityExecutionEligible: identity.authorityExecutionEligible,
      proxyAddress: identity.proxyAddress,
      proxyBytecodeHash: identity.proxyBytecodeHash,
      implementationAddress: identity.implementationAddress,
      implementationBytecodeHash: identity.implementationBytecodeHash,
    },
    trace: [
      {
        id: 'root',
        parentId: null,
        depth: 0,
        type: 'call',
        from: owner,
        to: ROBINHOOD_UNISWAP_V3.wrappedNative,
        nativeValue: '0',
        functionName: 'approve',
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        amount: '0',
      },
      {
        id: 'implementation',
        parentId: 'root',
        depth: 1,
        type: 'delegatecall',
        from: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
        to: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
        nativeValue: '0',
        functionName: 'approve',
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        amount: '0',
      },
    ],
    events: [
      {
        address: ROBINHOOD_UNISWAP_V3.wrappedNative,
        eventName: 'Approval',
        owner,
        spender: ROBINHOOD_UNISWAP_V3.positionManager,
        value: '0',
      },
    ],
    effects: {
      allowanceBefore: '1',
      allowanceAfter: '0',
      tokenBalanceDeltas: [],
      nativeBalanceDeltas: [],
      otherStateChanges: [],
    },
    touchedContracts: [
      ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
      ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
    ],
  }
}

function validReport() {
  return createWethAllowanceSimulationReviewReport(
    ingestWethAllowanceSimulationFixture(validFixture(), evidenceReviewedAt),
  )
}

function validCurrentState(): WethAllowanceSimulationReviewCurrentState {
  const evidence = validReport().evidence
  if (evidence === null) throw new Error('Expected valid review evidence')

  return {
    incidentDisabled: false,
    operation: evidence.operation,
    chainId: evidence.chainId,
    owner: evidence.owner,
    token: evidence.token,
    proxyAddress: evidence.proxyAddress,
    implementationAddress: evidence.implementationAddress,
    spender: evidence.spender,
    paperEvidenceDigest: evidence.paperEvidenceDigest,
    sharedBlock: BigInt(evidence.sharedBlock),
    blockHash: evidence.blockHash,
    currentAllowance: BigInt(evidence.allowanceBefore),
    registryVerified: true,
    authorityStatus: evidence.authorityStatus,
    authoritySourceAgreement: true,
    unresolvedAuthorityBoundaryCount: 0,
    providerAgreement: true,
    freshness: 'fresh',
  }
}

function validIntentResult() {
  return createWethAllowanceRevocationReviewIntent({
    report: validReport(),
    currentState: validCurrentState(),
    buildCommit,
    generatedAt: intentGeneratedAt,
    assessedAt: intentAssessedAt,
  })
}

function validConfirmationResult() {
  const intentResult = validIntentResult()
  const intent = intentResult.intent
  if (intent === null) throw new Error('Expected valid typed intent')

  return createWethAllowanceRevocationReviewConfirmation({
    intentResult,
    confirmation: {
      intentId: intent.intentId,
      phrase: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
      owner: intent.owner,
      destination: intent.destination,
      spender: intent.spender,
      desiredAllowance: '0',
      nativeValue: '0',
      confirmedAt,
      acknowledgesAllowanceRevocation: true,
      acknowledgesNoTokenTransfer: true,
      acknowledgesNoTransactionSigningExecutionAuthority: true,
    },
    assessedAt: confirmationAssessedAt,
  })
}

function evaluateValidLifecycle(
  overrides: Partial<{
    intentResult: unknown
    confirmationResult: unknown
    report: unknown
    currentState: unknown
    buildCommit: unknown
    generatedAt: unknown
    assessedAt: unknown
  }> = {},
) {
  return evaluateWethAllowanceRevocationReviewConfirmationLifecycle({
    intentResult: overrides.intentResult ?? validIntentResult(),
    confirmationResult: overrides.confirmationResult ?? validConfirmationResult(),
    report: overrides.report ?? validReport(),
    currentState: overrides.currentState ?? validCurrentState(),
    buildCommit: overrides.buildCommit ?? buildCommit,
    generatedAt: overrides.generatedAt ?? intentGeneratedAt,
    assessedAt: overrides.assessedAt ?? lifecycleAssessedAt,
  })
}

describe('offline WETH allowance-revocation confirmation lifecycle', () => {
  it('keeps unchanged confirmation evidence valid only for offline review', () => {
    const result = evaluateValidLifecycle()
    const confirmation = validConfirmationResult()

    expect(result.status).toBe('valid-for-offline-review')
    expect(result.originalIntentId).toBe(confirmation.typedIntentId)
    expect(result.originalConfirmationId).toBe(confirmation.confirmationId)
    expect(result.currentIntentId).toBe(confirmation.typedIntentId)
    expect(result.reasonCodes).toEqual([])
    expect(result.transactionBuildAuthorized).toBe(false)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.walletRequestAuthorized).toBe(false)
    expect(result.signingEligible).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.reusableAuthority).toBe(false)
  })

  it('is deterministic for exact explicit inputs', () => {
    expect(evaluateValidLifecycle()).toEqual(evaluateValidLifecycle())
  })

  it('invalidates at typed-intent expiry', () => {
    const expiry = validIntentResult().intent?.expiresAt
    if (expiry === undefined) throw new Error('Expected expiry')

    const result = evaluateValidLifecycle({ assessedAt: new Date(expiry) })

    expect(result.status).toBe('invalidated')
    expect(result.reasonCodes).toContain('assessment-before-expiry')
    expect(result.reasonCodes).toContain('current-intent-valid')
    expect(result.currentIntentId).toBeNull()
    expect(result.executionEligible).toBe(false)
  })

  it('invalidates every current-state lifecycle drift vector', () => {
    const base = validCurrentState()
    const cases: readonly [string, WethAllowanceSimulationReviewCurrentState][] = [
      ['incident-disabled', { ...base, incidentDisabled: true }],
      ['operation-match', { ...base, operation: 'other-operation' }],
      ['chain-match', { ...base, chainId: ROBINHOOD_CHAIN_ID + 1 }],
      ['owner-match', { ...base, owner: otherOwner }],
      ['token-match', { ...base, token: otherAddress }],
      ['proxy-match', { ...base, proxyAddress: otherAddress }],
      ['implementation-match', { ...base, implementationAddress: otherAddress }],
      ['spender-match', { ...base, spender: otherAddress }],
      ['paper-digest-match', { ...base, paperEvidenceDigest: otherDigest }],
      ['shared-block-match', { ...base, sharedBlock: base.sharedBlock + 1n }],
      ['block-hash-match', { ...base, blockHash: otherBlockHash }],
      ['allowance-match', { ...base, currentAllowance: 0n }],
      ['allowance-match', { ...base, currentAllowance: base.currentAllowance + 1n }],
      ['registry-verified', { ...base, registryVerified: false }],
      ['authority-verified', { ...base, authorityStatus: 'drifted' }],
      ['authority-verified', { ...base, authoritySourceAgreement: false }],
      ['authority-verified', { ...base, unresolvedAuthorityBoundaryCount: 1 }],
      ['provider-agreement', { ...base, providerAgreement: false }],
      ['current-evidence-freshness', { ...base, freshness: 'stale' }],
    ]

    for (const [lifecycleReason, currentState] of cases) {
      const result = evaluateValidLifecycle({ currentState })

      expect(result.status, lifecycleReason).toBe('invalidated')
      expect(result.reasonCodes, lifecycleReason).toContain(`current-intent-lifecycle-${lifecycleReason}`)
      expect(result.currentIntentId, lifecycleReason).toBeNull()
      expect(result.executionEligible).toBe(false)
      expect(result.reusableAuthority).toBe(false)
    }
  })

  it('invalidates report, build-commit, and generation-time drift', () => {
    const report = validReport()
    const cases: readonly [string, Partial<Parameters<typeof evaluateValidLifecycle>[0]>][] = [
      ['report', { report: { ...report, reportDigest: otherDigest } }],
      ['build', { buildCommit: otherBuildCommit }],
      ['generation', { generatedAt: new Date(intentGeneratedAt.getTime() + 1_000) }],
      ['malformed-build', { buildCommit: 'super-secret-build-value' }],
    ]

    for (const [label, overrides] of cases) {
      const result = evaluateValidLifecycle(overrides)

      expect(result.status, label).toBe('invalidated')
      expect(result.executionEligible).toBe(false)
    }

    expect(evaluateValidLifecycle({ buildCommit: otherBuildCommit }).reasonCodes).toContain('intent-id-stable')
    expect(
      evaluateValidLifecycle({ generatedAt: new Date(intentGeneratedAt.getTime() + 1_000) }).reasonCodes,
    ).toContain('intent-expiry-stable')
    expect(evaluateValidLifecycle({ buildCommit: 'super-secret-build-value' }).reasonCodes).toContain(
      'current-intent-build-commit',
    )
  })

  it('invalidates forged or over-broad original typed-intent results', () => {
    const valid = validIntentResult()
    const cases: readonly unknown[] = [
      { ...valid, executionEligible: true },
      { ...valid, intentId: otherDigest },
      { ...valid, checks: valid.checks.slice(1) },
      { ...valid, wallet: { signature: 'secret' } },
    ]

    for (const intentResult of cases) {
      const result = evaluateValidLifecycle({ intentResult })

      expect(result.status).toBe('invalidated')
      expect(result.reasonCodes).toContain('confirmation-replay')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('invalidates forged, incomplete, authorization-enabled, or over-broad confirmation results', () => {
    const valid = validConfirmationResult()
    const cases: readonly unknown[] = [
      { ...valid, walletRequestAuthorized: true },
      { ...valid, confirmationId: otherDigest },
      { ...valid, checks: valid.checks.slice(1) },
      { ...valid, confirmation: { ...valid.confirmation, providerPayload: { apiKey: 'secret' } } },
      { ...valid, transactionRequest: { calldata: '0xdeadbeef' } },
    ]

    for (const confirmationResult of cases) {
      const result = evaluateValidLifecycle({ confirmationResult })

      expect(result.status).toBe('invalidated')
      expect(result.reasonCodes).toContain('confirmation-result')
      expect(result.originalConfirmationId).toBeNull()
      expect(result.executionEligible).toBe(false)
    }
  })

  it('rejects inherited expected fields combined with unsupported own fields', () => {
    const valid = validConfirmationResult()
    const inherited = Object.create({ status: valid.status }) as Record<string, unknown>
    for (const [key, value] of Object.entries(valid)) {
      if (key !== 'status') inherited[key] = value
    }
    inherited.providerPayload = { apiKey: 'prototype-bypass-secret' }

    const result = evaluateValidLifecycle({ confirmationResult: inherited })
    const serialized = JSON.stringify(result)

    expect(result.status).toBe('invalidated')
    expect(result.reasonCodes).toContain('confirmation-result')
    expect(serialized).not.toContain('prototype-bypass-secret')
    expect(result.executionEligible).toBe(false)
  })

  it('rejects secret-bearing raw material without preserving it', () => {
    const secret = 'super-secret-wallet-key'
    const cases: readonly Partial<Parameters<typeof evaluateValidLifecycle>[0]>[] = [
      { intentResult: { ...validIntentResult(), wallet: { signature: secret } } },
      { confirmationResult: { ...validConfirmationResult(), privateKey: secret } },
      { report: { ...validReport(), providerPayload: { apiKey: secret, calldata: '0xdeadbeef' } } },
      { currentState: { ...validCurrentState(), wallet: { signature: secret } } },
    ]

    for (const overrides of cases) {
      const result = evaluateValidLifecycle(overrides)
      const serialized = JSON.stringify(result)

      expect(result.status).toBe('invalidated')
      expect(serialized).not.toContain(secret)
      expect(serialized).not.toContain('0xdeadbeef')
      expect(serialized).not.toContain('providerPayload')
      expect(result.walletRequestAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
      expect(result.reusableAuthority).toBe(false)
    }
  })
})
