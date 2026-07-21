import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import {
  WETH_ALLOWANCE_REVOCATION_OPERATION,
  defaultWethAllowanceAuthorityPaperEvidence,
  defaultWethAllowanceRegistryPaperEvidence,
  evaluateWethAllowanceRevocationPaperMode,
  type WethAllowancePaperInput,
} from './weth-allowance-paper.js'

const generatedAt = new Date('2026-07-21T17:45:00.000Z')
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')

function validInput(): WethAllowancePaperInput {
  return {
    intent: {
      operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
      chainId: ROBINHOOD_CHAIN_ID,
      owner,
      token: ROBINHOOD_UNISWAP_V3.wrappedNative,
      spender: ROBINHOOD_UNISWAP_V3.positionManager,
      desiredAllowance: 0n,
      nativeValue: 0n,
    },
    registry: defaultWethAllowanceRegistryPaperEvidence(),
    authority: defaultWethAllowanceAuthorityPaperEvidence(),
    allowance: {
      status: 'available',
      sharedBlock: 15_692_744n,
      blockHash: `0x${'11'.repeat(32)}`,
      observedAt: new Date('2026-07-21T17:44:30.000Z'),
      providerCount: 2,
      providerAgreement: true,
      allowance: 1n,
      maximumAgeSeconds: 300,
    },
  }
}

describe('WETH allowance-revocation paper mode', () => {
  it('returns ready-for-separate-simulation-review without enabling execution', () => {
    const report = evaluateWethAllowanceRevocationPaperMode(validInput(), generatedAt)

    expect(report.decision).toBe('ready-for-separate-simulation-review')
    expect(report.executionEligible).toBe(false)
    expect(report.checks.every((item) => item.status === 'pass')).toBe(true)
    expect(report.evidence.allowance.freshness).toBe('fresh')
    expect(report.evidence.allowance.ageSeconds).toBe(30)
    expect(report.evidenceDigest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(
      JSON.stringify(report, (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value)),
    ).not.toContain('rpc')
  })

  it('returns a non-signing no-op when the current allowance is zero', () => {
    const input = validInput()
    const report = evaluateWethAllowanceRevocationPaperMode(
      {
        ...input,
        allowance: { ...input.allowance, allowance: 0n },
      },
      generatedAt,
    )

    expect(report.decision).toBe('noop')
    expect(report.executionEligible).toBe(false)
    expect(report.reasons).toEqual(['Current allowance is already zero; no transaction should be requested.'])
  })

  it('blocks every operation-field substitution', () => {
    const input = validInput()
    const invalidInputs: WethAllowancePaperInput[] = [
      { ...input, intent: { ...input.intent, operation: 'other-operation' } },
      { ...input, intent: { ...input.intent, chainId: 1 } },
      { ...input, intent: { ...input.intent, owner: '0x0000000000000000000000000000000000000000' } },
      { ...input, intent: { ...input.intent, token: getAddress('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168') } },
      { ...input, intent: { ...input.intent, spender: ROBINHOOD_UNISWAP_V3.factory } },
      { ...input, intent: { ...input.intent, desiredAllowance: 1n } },
      { ...input, intent: { ...input.intent, nativeValue: 1n } },
    ]

    for (const candidate of invalidInputs) {
      const report = evaluateWethAllowanceRevocationPaperMode(candidate, generatedAt)
      expect(report.decision).toBe('blocked')
      expect(report.executionEligible).toBe(false)
      expect(report.checks.some((item) => item.status === 'fail')).toBe(true)
    }
  })

  it('blocks registry and authority drift', () => {
    const input = validInput()
    const invalidInputs: WethAllowancePaperInput[] = [
      { ...input, registry: { ...input.registry, tokenStatus: 'hash-mismatch' } },
      { ...input, registry: { ...input.registry, spenderStatus: 'missing-code' } },
      { ...input, registry: { ...input.registry, allEntriesExecutionIneligible: false } },
      { ...input, registry: { ...input.registry, tokenExecutionEligible: true } },
      { ...input, authority: { ...input.authority, status: 'unresolved' } },
      { ...input, authority: { ...input.authority, sourceAgreement: false } },
      { ...input, authority: { ...input.authority, authorityBoundaryCount: 1 } },
      { ...input, authority: { ...input.authority, executionEligible: true } },
    ]

    for (const candidate of invalidInputs) {
      const report = evaluateWethAllowanceRevocationPaperMode(candidate, generatedAt)
      expect(report.decision).toBe('blocked')
      expect(report.executionEligible).toBe(false)
    }
  })

  it('blocks unavailable, incomplete, stale, future, or disagreeing allowance evidence', () => {
    const input = validInput()
    const invalidInputs: WethAllowancePaperInput[] = [
      {
        ...input,
        allowance: {
          ...input.allowance,
          status: 'unavailable',
          sharedBlock: null,
          blockHash: null,
          observedAt: null,
          allowance: null,
        },
      },
      { ...input, allowance: { ...input.allowance, providerCount: 1 } },
      { ...input, allowance: { ...input.allowance, providerAgreement: false } },
      { ...input, allowance: { ...input.allowance, sharedBlock: null } },
      { ...input, allowance: { ...input.allowance, blockHash: null } },
      { ...input, allowance: { ...input.allowance, maximumAgeSeconds: 0 } },
      { ...input, allowance: { ...input.allowance, observedAt: new Date('2026-07-21T17:30:00.000Z') } },
      { ...input, allowance: { ...input.allowance, observedAt: new Date('2026-07-21T17:46:00.000Z') } },
    ]

    for (const candidate of invalidInputs) {
      const report = evaluateWethAllowanceRevocationPaperMode(candidate, generatedAt)
      expect(report.decision).toBe('blocked')
      expect(report.executionEligible).toBe(false)
    }
  })

  it('produces a stable digest for identical normalized evidence', () => {
    const first = evaluateWethAllowanceRevocationPaperMode(validInput(), generatedAt)
    const second = evaluateWethAllowanceRevocationPaperMode(validInput(), new Date(generatedAt))

    expect(second.evidenceDigest).toBe(first.evidenceDigest)
  })

  it('changes the digest when evidence changes', () => {
    const input = validInput()
    const first = evaluateWethAllowanceRevocationPaperMode(input, generatedAt)
    const second = evaluateWethAllowanceRevocationPaperMode(
      {
        ...input,
        allowance: { ...input.allowance, allowance: 2n },
      },
      generatedAt,
    )

    expect(second.evidenceDigest).not.toBe(first.evidenceDigest)
  })
})
