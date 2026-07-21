import { describe, expect, it } from 'vitest'
import {
  ROBINHOOD_WETH_PROXY_EVIDENCE,
  verifyRobinhoodWethProxyEvidence,
  type WethProxyObservedState,
} from './weth-proxy-evidence.js'

function observed(overrides: Partial<WethProxyObservedState> = {}): WethProxyObservedState {
  const expected = ROBINHOOD_WETH_PROXY_EVIDENCE
  return {
    chainId: expected.chainId,
    proxy: {
      address: expected.proxy.address,
      byteLength: expected.proxy.byteLength,
      bytecodeHash: expected.proxy.bytecodeHash,
    },
    implementation: {
      address: expected.implementation.address,
      byteLength: expected.implementation.byteLength,
      bytecodeHash: expected.implementation.bytecodeHash,
    },
    admin: {
      address: expected.admin.address,
      byteLength: expected.admin.byteLength,
      bytecodeHash: expected.admin.bytecodeHash,
    },
    beacon: expected.beacon,
    adminOwner: {
      address: expected.adminOwner.address,
      byteLength: expected.adminOwner.byteLength,
      bytecodeHash: expected.adminOwner.bytecodeHash,
    },
    ...overrides,
  }
}

describe('Robinhood WETH proxy evidence', () => {
  it('pins an upgradeable proxy and keeps it execution ineligible', () => {
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.status).toBe('read-only-verified-upgradeable')
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.proxyType).toBe('transparent-eip1967')
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.sourceAgreement).toBe(true)
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.adminOwner.controlStatus).toBe('access-control-role-membership-unresolved')
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.adminOwner.implementation).toBe('0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd')
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.executionEligible).toBe(false)
    expect(ROBINHOOD_WETH_PROXY_EVIDENCE.executionBlockers.length).toBeGreaterThan(0)
  })

  it('accepts the exact read-only evidence snapshot without enabling execution', () => {
    const result = verifyRobinhoodWethProxyEvidence(observed())

    expect(result.status).toBe('verified-read-only')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.every((check) => check.status === 'pass')).toBe(true)
  })

  it('fails closed on implementation hash drift', () => {
    const result = verifyRobinhoodWethProxyEvidence(
      observed({
        implementation: {
          ...observed().implementation,
          bytecodeHash: `0x${'00'.repeat(32)}`,
        },
      }),
    )

    expect(result.status).toBe('mismatch')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.find((check) => check.code === 'implementation')?.status).toBe('fail')
  })

  it('fails closed on admin, owner, beacon, or chain substitution', () => {
    const expected = observed()
    const cases: WethProxyObservedState[] = [
      { ...expected, chainId: 1 },
      { ...expected, beacon: expected.proxy.address },
      {
        ...expected,
        admin: { ...expected.admin, address: expected.proxy.address },
      },
      {
        ...expected,
        adminOwner: { ...expected.adminOwner, byteLength: expected.adminOwner.byteLength + 1 },
      },
    ]

    for (const candidate of cases) {
      const result = verifyRobinhoodWethProxyEvidence(candidate)
      expect(result.status).toBe('mismatch')
      expect(result.executionEligible).toBe(false)
    }
  })
})
