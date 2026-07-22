import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  ingestWethAllowanceSimulationFixture,
  type WethAllowanceSimulationIngestionResult,
  type WethAllowanceSimulationOfflineFixture,
} from './weth-allowance-simulation-ingestion.js'
import {
  createWethAllowanceSimulationReviewReport,
  renderWethAllowanceSimulationReviewText,
} from './weth-allowance-simulation-review-report.js'
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const reviewedAt = new Date('2026-07-22T22:30:00.000Z')
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const paperDigest = `0x${'11'.repeat(32)}` as const
const blockHash = `0x${'22'.repeat(32)}` as const

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
      observedAt: '2026-07-22T22:29:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-22T22:29:30.000Z',
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

function validIngestionResult(): WethAllowanceSimulationIngestionResult {
  return ingestWethAllowanceSimulationFixture(validFixture(), reviewedAt)
}

describe('offline WETH allowance simulation operator review report', () => {
  it('renders normalized evidence as ready for human review without authorization', () => {
    const report = createWethAllowanceSimulationReviewReport(validIngestionResult())
    const text = renderWethAllowanceSimulationReviewText(report)

    expect(report.status).toBe('ready-for-human-review')
    expect(report.evidence?.operation).toBe(WETH_ALLOWANCE_REVOCATION_OPERATION)
    expect(report.evidence?.owner).toBe(owner)
    expect(report.evidence?.allowanceBefore).toBe('1')
    expect(report.evidence?.allowanceAfter).toBe('0')
    expect(report.evidence?.calls).toHaveLength(2)
    expect(report.evidence?.approvalEvent.eventName).toBe('Approval')
    expect(report.implementationAuthorized).toBe(false)
    expect(report.simulationAuthorized).toBe(false)
    expect(report.executionEligible).toBe(false)
    expect(report.reportDigest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(text).toContain('Status: ready-for-human-review')
    expect(text).toContain(`Owner: ${owner}`)
    expect(text).toContain('Execution eligible: false')
  })

  it('keeps blocked ingestion blocked and omits evidence', () => {
    const fixture = validFixture()
    const ingestion = ingestWethAllowanceSimulationFixture(
      {
        ...fixture,
        sourceFormat: 'unsupported-format',
      },
      reviewedAt,
    )
    const report = createWethAllowanceSimulationReviewReport(ingestion)

    expect(report.status).toBe('blocked')
    expect(report.evidence).toBeNull()
    expect(report.checks.some((check) => check.code === 'ingestion-status' && check.status === 'fail')).toBe(true)
    expect(report.executionEligible).toBe(false)
  })

  it('blocks missing normalized evidence or policy results', () => {
    const valid = validIngestionResult()
    const cases = [
      {
        ...valid,
        normalizedInput: null,
      },
      {
        ...valid,
        policyResult: null,
      },
    ] as unknown as WethAllowanceSimulationIngestionResult[]

    for (const ingestion of cases) {
      const report = createWethAllowanceSimulationReviewReport(ingestion)
      expect(report.status).toBe('blocked')
      expect(report.evidence).toBeNull()
      expect(report.executionEligible).toBe(false)
    }
  })

  it('blocks any forged authorization flag', () => {
    const valid = validIngestionResult()
    const cases = [
      {
        ...valid,
        executionEligible: true,
      },
      {
        ...valid,
        policyResult: {
          ...valid.policyResult!,
          simulationAuthorized: true,
        },
      },
    ] as unknown as WethAllowanceSimulationIngestionResult[]

    for (const ingestion of cases) {
      const report = createWethAllowanceSimulationReviewReport(ingestion)
      expect(report.status).toBe('blocked')
      expect(report.evidence).toBeNull()
      expect(report.implementationAuthorized).toBe(false)
      expect(report.simulationAuthorized).toBe(false)
      expect(report.executionEligible).toBe(false)
    }
  })

  it('blocks normalized evidence that no longer reproduces the reviewed policy digest', () => {
    const valid = validIngestionResult()
    const forged = {
      ...valid,
      normalizedInput: {
        ...valid.normalizedInput!,
        paper: {
          ...valid.normalizedInput!.paper,
          operation: 'forged-operation',
        },
      },
    } as unknown as WethAllowanceSimulationIngestionResult

    const report = createWethAllowanceSimulationReviewReport(forged)

    expect(report.status).toBe('blocked')
    expect(report.evidence).toBeNull()
    expect(report.checks.some((check) => check.code === 'policy-integrity' && check.status === 'fail')).toBe(true)
  })

  it('produces deterministic report and text digests and changes on normalized evidence drift', () => {
    const first = createWethAllowanceSimulationReviewReport(validIngestionResult())
    const second = createWethAllowanceSimulationReviewReport(validIngestionResult())

    expect(second.reportDigest).toBe(first.reportDigest)
    expect(renderWethAllowanceSimulationReviewText(second)).toBe(renderWethAllowanceSimulationReviewText(first))

    const fixture = validFixture()
    const changedIngestion = ingestWethAllowanceSimulationFixture(
      {
        ...fixture,
        effects: {
          ...fixture.effects,
          allowanceBefore: '2',
        },
      },
      reviewedAt,
    )
    const changed = createWethAllowanceSimulationReviewReport(changedIngestion)

    expect(changed.status).toBe('ready-for-human-review')
    expect(changed.reportDigest).not.toBe(first.reportDigest)
  })

  it('does not copy upstream free-form messages, raw payloads, or secrets into report output', () => {
    const valid = validIngestionResult()
    const secret = 'super-secret-provider-key'
    const forged = {
      ...valid,
      reasons: [secret],
      checks: valid.checks.map((check, index) =>
        index === 0
          ? {
              ...check,
              code: secret,
              message: `calldata=0xdeadbeef apiKey=${secret}`,
            }
          : check,
      ),
      providerPayload: {
        transactionRequest: {
          calldata: '0xdeadbeef',
          apiKey: secret,
        },
      },
    } as unknown as WethAllowanceSimulationIngestionResult

    const report = createWethAllowanceSimulationReviewReport(forged)
    const serialized = JSON.stringify(report)
    const text = renderWethAllowanceSimulationReviewText(report)

    expect(report.status).toBe('ready-for-human-review')
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('0xdeadbeef')
    expect(text).not.toContain(secret)
    expect(text).not.toContain('0xdeadbeef')
    expect(report.checks.some((check) => check.code === 'invalid-check-code')).toBe(true)
  })

  it('sanitizes malformed digests and version strings in blocked reports', () => {
    const valid = validIngestionResult()
    const secret = 'secret-in-malformed-metadata'
    const forged = {
      ...valid,
      reviewDigest: secret,
      fixtureVersion: secret,
      sourceFormat: secret,
      policyResult: {
        ...valid.policyResult!,
        policyVersion: secret,
        evidenceDigest: secret,
      },
    } as unknown as WethAllowanceSimulationIngestionResult

    const report = createWethAllowanceSimulationReviewReport(forged)
    const serialized = JSON.stringify(report)
    const text = renderWethAllowanceSimulationReviewText(report)

    expect(report.status).toBe('blocked')
    expect(report.evidence).toBeNull()
    expect(report.ingestionReviewDigest).toBe(`0x${'00'.repeat(32)}`)
    expect(report.policyEvidenceDigest).toBeNull()
    expect(report.fixtureVersion).toBe('invalid')
    expect(report.sourceFormat).toBeNull()
    expect(report.policyVersion).toBeNull()
    expect(serialized).not.toContain(secret)
    expect(text).not.toContain(secret)
  })
})
