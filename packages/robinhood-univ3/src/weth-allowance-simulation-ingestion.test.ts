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
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const reviewedAt = new Date('2026-07-22T22:00:00.000Z')
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
      observedAt: '2026-07-22T21:59:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-22T21:59:30.000Z',
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

describe('offline WETH allowance simulation evidence ingestion', () => {
  it('normalizes an exact sanitized fixture without authorizing implementation or execution', () => {
    const result = ingestWethAllowanceSimulationFixture(validFixture(), reviewedAt)

    expect(result.status).toBe('normalized')
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true)
    expect(result.normalizedInput).not.toBeNull()
    expect(result.policyResult?.status).toBe('policy-conformant')
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.reviewDigest).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('rejects transaction, wallet, provider-secret, and submission material without preserving it', () => {
    const fixture = validFixture()
    const result = ingestWethAllowanceSimulationFixture(
      {
        ...fixture,
        providerPayload: {
          transactionRequest: {
            calldata: '0xdeadbeef',
            apiKey: 'super-secret-key',
          },
        },
      },
      reviewedAt,
    )

    expect(result.status).toBe('blocked')
    expect(result.checks.find((check) => check.code === 'raw-material-absent')?.status).toBe('fail')
    expect(result.normalizedInput).toBeNull()
    expect(JSON.stringify(result)).not.toContain('super-secret-key')
    expect(JSON.stringify(result)).not.toContain('0xdeadbeef')
  })

  it('rejects unknown fields and malformed values fail closed', () => {
    const fixture = validFixture()
    const cases: unknown[] = [
      { ...fixture, sourceFormat: 'other-format' },
      { ...fixture, paper: { ...fixture.paper, owner: 'not-an-address' } },
      { ...fixture, paper: { ...fixture.paper, desiredAllowance: '0x0' } },
      { ...fixture, provider: { ...fixture.provider, observedAt: 'not-a-date' } },
      {
        ...fixture,
        trace: [{ ...fixture.trace[0]!, providerOutput: 'opaque' }, fixture.trace[1]!],
      },
    ]

    for (const candidate of cases) {
      const result = ingestWethAllowanceSimulationFixture(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('normalizes well-formed drift and then lets the reviewed policy block it', () => {
    const fixture = validFixture()
    const extraCall = {
      ...fixture.trace[0]!,
      id: 'extra',
      parentId: 'implementation',
      depth: 2,
      to: ROBINHOOD_UNISWAP_V3.positionManager,
    }
    const cases: unknown[] = [
      { ...fixture, trace: [...fixture.trace, extraCall] },
      { ...fixture, events: [...fixture.events, fixture.events[0]!] },
      {
        ...fixture,
        effects: {
          ...fixture.effects,
          tokenBalanceDeltas: [
            {
              account: owner,
              asset: ROBINHOOD_UNISWAP_V3.wrappedNative,
              delta: '-1',
            },
          ],
        },
      },
      {
        ...fixture,
        provider: {
          ...fixture.provider,
          referencedPaperDigest: `0x${'33'.repeat(32)}`,
        },
      },
    ]

    for (const candidate of cases) {
      const result = ingestWethAllowanceSimulationFixture(candidate, reviewedAt)
      expect(result.status).toBe('blocked')
      expect(result.normalizedInput).not.toBeNull()
      expect(result.policyResult?.status).toBe('blocked')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('produces a stable digest from normalized evidence and changes it on drift', () => {
    const first = ingestWethAllowanceSimulationFixture(validFixture(), reviewedAt)
    const second = ingestWethAllowanceSimulationFixture(validFixture(), new Date(reviewedAt))
    expect(second.reviewDigest).toBe(first.reviewDigest)

    const fixture = validFixture()
    const changed = ingestWethAllowanceSimulationFixture(
      {
        ...fixture,
        effects: {
          ...fixture.effects,
          allowanceBefore: '2',
        },
      },
      reviewedAt,
    )
    expect(changed.status).toBe('normalized')
    expect(changed.reviewDigest).not.toBe(first.reviewDigest)
  })
})
