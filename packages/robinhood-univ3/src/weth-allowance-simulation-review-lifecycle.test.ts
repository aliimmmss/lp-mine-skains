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
import {
  evaluateWethAllowanceSimulationReviewLifecycle,
  type WethAllowanceSimulationReviewCurrentState,
} from './weth-allowance-simulation-review-lifecycle.js'
import { createWethAllowanceSimulationReviewReport } from './weth-allowance-simulation-review-report.js'
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const reviewedAt = new Date('2026-07-22T23:00:00.000Z')
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
      observedAt: '2026-07-22T22:59:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-22T22:59:30.000Z',
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
  return createWethAllowanceSimulationReviewReport(ingestWethAllowanceSimulationFixture(validFixture(), reviewedAt))
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

describe('offline WETH allowance review-record lifecycle', () => {
  it('keeps an exact reviewed record valid for human review without authorization', () => {
    const result = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), validCurrentState())

    expect(result.status).toBe('valid-for-human-review')
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(result.reasonCodes).toEqual([])
    expect(result.originalReportDigest).toBe(validReport().reportDigest)
    expect(result.currentStateDigest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result.lifecycleDigest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.executionEligible).toBe(false)
  })

  it('invalidates every explicit current-state drift vector with stable reason codes', () => {
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

    for (const [reasonCode, currentState] of cases) {
      const result = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), currentState)
      expect(result.status, reasonCode).toBe('invalidated')
      expect(result.reasonCodes, reasonCode).toContain(reasonCode)
      expect(result.implementationAuthorized).toBe(false)
      expect(result.simulationAuthorized).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('invalidates blocked, malformed, tampered, or authorization-enabled reports', () => {
    const report = validReport()
    const cases: readonly [string, unknown][] = [
      ['report-status', { ...report, status: 'blocked' }],
      ['report-digest', { ...report, reportDigest: 'not-a-digest' }],
      ['report-metadata', { ...report, fixtureVersion: 'forged-version' }],
      ['report-integrity', { ...report, reasons: ['tampered'] }],
      ['report-authorization-disabled', { ...report, executionEligible: true }],
      ['report-evidence', { ...report, evidence: null }],
      ['report-checks', { ...report, checks: [{ source: 'renderer', code: 'unknown', status: 'pass', message: 'x' }] }],
      ['report-checks', { ...report, checks: [report.checks[0]!] }],
    ]

    for (const [reasonCode, candidate] of cases) {
      const result = evaluateWethAllowanceSimulationReviewLifecycle(candidate, validCurrentState())
      expect(result.status, reasonCode).toBe('invalidated')
      expect(result.reasonCodes, reasonCode).toContain(reasonCode)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('rejects malformed or over-broad current-state inputs without copying secrets', () => {
    const secret = 'super-secret-provider-key'
    const candidate = {
      ...validCurrentState(),
      providerPayload: {
        transactionRequest: {
          calldata: '0xdeadbeef',
          apiKey: secret,
        },
      },
    }

    const result = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), candidate)
    const serialized = JSON.stringify(result)

    expect(result.status).toBe('invalidated')
    expect(result.reasonCodes).toContain('current-state-schema')
    expect(result.currentStateDigest).toBe(`0x${'00'.repeat(32)}`)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('0xdeadbeef')
    expect(result.executionEligible).toBe(false)
  })

  it('produces deterministic lifecycle digests and changes them on explicit drift', () => {
    const first = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), validCurrentState())
    const second = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), validCurrentState())

    expect(second.lifecycleDigest).toBe(first.lifecycleDigest)
    expect(second.currentStateDigest).toBe(first.currentStateDigest)

    const changedState = { ...validCurrentState(), freshness: 'stale' as const }
    const changed = evaluateWethAllowanceSimulationReviewLifecycle(validReport(), changedState)

    expect(changed.status).toBe('invalidated')
    expect(changed.currentStateDigest).not.toBe(first.currentStateDigest)
    expect(changed.lifecycleDigest).not.toBe(first.lifecycleDigest)
  })
})
