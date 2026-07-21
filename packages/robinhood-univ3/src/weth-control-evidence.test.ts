import { describe, expect, it } from 'vitest'
import {
  ROBINHOOD_WETH_CONTROL_EVIDENCE,
  verifyRobinhoodWethControlEvidence,
  type WethControlObservedState,
} from './weth-control-evidence.js'

function observed(overrides: Partial<WethControlObservedState> = {}): WethControlObservedState {
  const expected = ROBINHOOD_WETH_CONTROL_EVIDENCE
  return {
    chainId: expected.chainId,
    controllerProxy: {
      address: expected.controllerProxy.address,
      byteLength: expected.controllerProxy.byteLength,
      bytecodeHash: expected.controllerProxy.bytecodeHash,
    },
    controllerImplementation: {
      address: expected.controllerImplementation.address,
      byteLength: expected.controllerImplementation.byteLength,
      bytecodeHash: expected.controllerImplementation.bytecodeHash,
    },
    controllerAdmin: {
      address: expected.controllerAdmin.address,
      byteLength: expected.controllerAdmin.byteLength,
      bytecodeHash: expected.controllerAdmin.bytecodeHash,
    },
    controllerBeacon: expected.controllerBeacon,
    proxyAdminOwner: expected.controllerAdmin.owner,
    ...overrides,
  }
}

describe('Robinhood WETH upgrade-control evidence', () => {
  it('pins the bounded controller chain while leaving role authority unresolved', () => {
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.status).toBe('read-only-verified-role-membership-unresolved')
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.sourceAgreement).toBe(true)
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.controllerImplementation.accessControl.enumerable).toBe(false)
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.controlStatus).toBe('access-control-role-membership-unresolved')
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.executionEligible).toBe(false)
    expect(ROBINHOOD_WETH_CONTROL_EVIDENCE.executionBlockers.length).toBeGreaterThan(0)
  })

  it('accepts the exact read-only snapshot without enabling execution', () => {
    const result = verifyRobinhoodWethControlEvidence(observed())

    expect(result.status).toBe('verified-read-only')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.every((item) => item.status === 'pass')).toBe(true)
  })

  it('fails closed on controller implementation hash drift', () => {
    const result = verifyRobinhoodWethControlEvidence(
      observed({
        controllerImplementation: {
          ...observed().controllerImplementation,
          bytecodeHash: `0x${'00'.repeat(32)}`,
        },
      }),
    )

    expect(result.status).toBe('mismatch')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.find((item) => item.code === 'controller-implementation')?.status).toBe('fail')
  })

  it('fails closed on proxy, admin, beacon, owner, or chain substitution', () => {
    const expected = observed()
    const cases: WethControlObservedState[] = [
      { ...expected, chainId: 1 },
      { ...expected, controllerBeacon: expected.controllerProxy.address },
      {
        ...expected,
        controllerProxy: { ...expected.controllerProxy, address: expected.controllerImplementation.address },
      },
      {
        ...expected,
        controllerAdmin: { ...expected.controllerAdmin, byteLength: expected.controllerAdmin.byteLength + 1 },
      },
      { ...expected, proxyAdminOwner: expected.controllerImplementation.address },
    ]

    for (const candidate of cases) {
      const result = verifyRobinhoodWethControlEvidence(candidate)
      expect(result.status).toBe('mismatch')
      expect(result.executionEligible).toBe(false)
    }
  })
})
