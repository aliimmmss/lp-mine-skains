import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  ingestWethAllowanceSimulationFixture,
  type WethAllowanceSimulationOfflineFixture,
} from './weth-allowance-simulation-ingestion.js'
import type { WethAllowanceSimulationReviewCurrentState } from './weth-allowance-simulation-review-lifecycle.js'
import { createWethAllowanceSimulationReviewReport } from './weth-allowance-simulation-review-report.js'
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS,
  createWethAllowanceRevocationReviewIntent,
  digestWethAllowanceRevocationReviewIntentBody,
} from './weth-allowance-revocation-review-intent.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const evidenceReviewedAt = new Date('2026-07-22T23:10:00.000Z')
const generatedAt = new Date('2026-07-22T23:10:10.000Z')
const assessedAt = new Date('2026-07-22T23:10:20.000Z')
const buildCommit = 'a'.repeat(40)
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
      observedAt: '2026-07-22T23:09:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-22T23:09:30.000Z',
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

function createValidIntent() {
  return createWethAllowanceRevocationReviewIntent({
    report: validReport(),
    currentState: validCurrentState(),
    buildCommit,
    generatedAt,
    assessedAt,
  })
}

describe('offline WETH allowance-revocation review intent', () => {
  it('creates an immutable expiring human-review intent without execution authority', () => {
    const result = createValidIntent()
    const intent = result.intent

    expect(result.status).toBe('ready-for-human-review')
    expect(intent).not.toBeNull()
    if (intent === null) throw new Error('Expected intent')

    const { intentId, ...body } = intent
    expect(intentId).toBe(digestWethAllowanceRevocationReviewIntentBody(body))
    expect(result.intentId).toBe(intentId)
    expect(intent.operation).toBe(WETH_ALLOWANCE_REVOCATION_OPERATION)
    expect(intent.chainId).toBe(ROBINHOOD_CHAIN_ID)
    expect(intent.owner).toBe(owner)
    expect(intent.destination).toBe(ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address)
    expect(intent.reviewedImplementation).toBe(ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address)
    expect(intent.functionName).toBe('approve')
    expect(intent.token).toBe(ROBINHOOD_UNISWAP_V3.wrappedNative)
    expect(intent.spender).toBe(ROBINHOOD_UNISWAP_V3.positionManager)
    expect(intent.desiredAllowance).toBe('0')
    expect(intent.nativeValue).toBe('0')
    expect(new Date(intent.expiresAt).getTime() - new Date(intent.generatedAt).getTime()).toBe(
      WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000,
    )
    expect(result.transactionBuildAuthorized).toBe(false)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.signingEligible).toBe(false)
    expect(result.executionEligible).toBe(false)
  })

  it('is deterministic for explicit evidence, commit, generation, and assessment inputs', () => {
    const first = createValidIntent()
    const second = createValidIntent()

    expect(second).toEqual(first)
    expect(second.intentId).toBe(first.intentId)
    expect(second.lifecycle.lifecycleDigest).toBe(first.lifecycle.lifecycleDigest)
  })

  it('blocks malformed build and timestamp inputs without copying them', () => {
    const secret = 'super-secret-build-value'
    const cases = [
      { buildCommit: secret, generatedAt, assessedAt, reasonCode: 'build-commit' },
      { buildCommit: 'A'.repeat(40), generatedAt, assessedAt, reasonCode: 'build-commit' },
      { buildCommit, generatedAt: new Date('invalid'), assessedAt, reasonCode: 'generated-at' },
      { buildCommit, generatedAt, assessedAt: new Date('invalid'), reasonCode: 'assessed-at' },
      {
        buildCommit,
        generatedAt: new Date(assessedAt.getTime() + 1_000),
        assessedAt,
        reasonCode: 'generated-not-future',
      },
      {
        buildCommit,
        generatedAt,
        assessedAt: new Date(generatedAt.getTime() + WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_LIFETIME_SECONDS * 1_000),
        reasonCode: 'review-window-open',
      },
    ]

    for (const candidate of cases) {
      const result = createWethAllowanceRevocationReviewIntent({
        report: validReport(),
        currentState: validCurrentState(),
        buildCommit: candidate.buildCommit,
        generatedAt: candidate.generatedAt,
        assessedAt: candidate.assessedAt,
      })
      const serialized = JSON.stringify(result)

      expect(result.status, candidate.reasonCode).toBe('blocked')
      expect(result.intent, candidate.reasonCode).toBeNull()
      expect(result.reasonCodes, candidate.reasonCode).toContain(candidate.reasonCode)
      expect(serialized).not.toContain(secret)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('blocks every current-state lifecycle invalidation vector', () => {
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
      const result = createWethAllowanceRevocationReviewIntent({
        report: validReport(),
        currentState,
        buildCommit,
        generatedAt,
        assessedAt,
      })

      expect(result.status, lifecycleReason).toBe('blocked')
      expect(result.intent, lifecycleReason).toBeNull()
      expect(result.lifecycle.reasonCodes, lifecycleReason).toContain(lifecycleReason)
      expect(result.reasonCodes, lifecycleReason).toContain(`lifecycle-${lifecycleReason}`)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('blocks forged report metadata and authorization drift', () => {
    const report = validReport()
    const cases: readonly unknown[] = [
      { ...report, fixtureVersion: 'forged-version' },
      { ...report, executionEligible: true },
      { ...report, reasons: ['tampered'] },
      { ...report, reportDigest: 'not-a-digest' },
    ]

    for (const candidate of cases) {
      const result = createWethAllowanceRevocationReviewIntent({
        report: candidate,
        currentState: validCurrentState(),
        buildCommit,
        generatedAt,
        assessedAt,
      })

      expect(result.status).toBe('blocked')
      expect(result.intent).toBeNull()
      expect(result.reasonCodes).toContain('lifecycle-valid')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('rejects over-broad secret-bearing evidence without preserving raw material', () => {
    const secret = 'super-secret-provider-key'
    const report = {
      ...validReport(),
      providerPayload: {
        transactionRequest: {
          calldata: '0xdeadbeef',
          apiKey: secret,
        },
      },
    }
    const currentState = {
      ...validCurrentState(),
      wallet: {
        signature: secret,
      },
    }

    for (const [candidateReport, candidateState] of [
      [report, validCurrentState()],
      [validReport(), currentState],
    ] as const) {
      const result = createWethAllowanceRevocationReviewIntent({
        report: candidateReport,
        currentState: candidateState,
        buildCommit,
        generatedAt,
        assessedAt,
      })
      const serialized = JSON.stringify(result)

      expect(result.status).toBe('blocked')
      expect(result.intent).toBeNull()
      expect(serialized).not.toContain(secret)
      expect(serialized).not.toContain('0xdeadbeef')
      expect(serialized).not.toContain('transactionRequest')
      expect(result.transactionBuildAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })
})
