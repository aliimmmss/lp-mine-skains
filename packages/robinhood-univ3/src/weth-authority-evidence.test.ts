import { describe, expect, it } from 'vitest'
import {
  ROBINHOOD_WETH_AUTHORITY_EVIDENCE,
  verifyRobinhoodWethAuthorityEvidence,
  type SafeAuthorityObservedState,
  type WethAuthorityObservedState,
} from './weth-authority-evidence.js'

function safeObserved(expected: SafeAuthorityObservedState): SafeAuthorityObservedState {
  return {
    sharedBlock: expected.sharedBlock,
    deploymentBlock: expected.deploymentBlock,
    code: { ...expected.code },
    singleton: expected.singleton,
    owners: [...expected.owners],
    threshold: expected.threshold,
    nonce: expected.nonce,
    modules: [...expected.modules],
    guard: expected.guard,
    fallbackHandler: expected.fallbackHandler,
    version: expected.version,
    domainSeparator: expected.domainSeparator,
    contractOwners: [...expected.contractOwners],
  }
}

function observed(overrides: Partial<WethAuthorityObservedState> = {}): WethAuthorityObservedState {
  const expected = ROBINHOOD_WETH_AUTHORITY_EVIDENCE
  return {
    chainId: expected.chainId,
    controllerProxy: { ...expected.controllerProxy },
    controllerImplementation: { ...expected.controllerImplementation },
    controllerAdmin: { ...expected.controllerAdmin },
    controllerRoles: {
      sharedBlock: expected.controllerRoles.sharedBlock,
      eventCount: expected.controllerRoles.eventCount,
      eventDigest: expected.controllerRoles.eventDigest,
      defaultAdminRole: expected.controllerRoles.roleIds.DEFAULT_ADMIN_ROLE,
      adminRole: expected.controllerRoles.roleIds.ADMIN_ROLE,
      executorRole: expected.controllerRoles.roleIds.EXECUTOR_ROLE,
      defaultAdminRoleAdmin: expected.controllerRoles.roleAdmins.DEFAULT_ADMIN_ROLE,
      adminRoleAdmin: expected.controllerRoles.roleAdmins.ADMIN_ROLE,
      executorRoleAdmin: expected.controllerRoles.roleAdmins.EXECUTOR_ROLE,
      defaultAdminHolders: [...expected.controllerRoles.holders.DEFAULT_ADMIN_ROLE],
      adminHolders: [...expected.controllerRoles.holders.ADMIN_ROLE],
      executorHolders: [...expected.controllerRoles.holders.EXECUTOR_ROLE],
      executorEoa: { ...expected.controllerRoles.executorEoa },
    },
    timelock: {
      sharedBlock: expected.timelock.sharedBlock,
      deploymentBlock: expected.timelock.deploymentBlock,
      eventCount: expected.timelock.eventCount,
      eventDigest: expected.timelock.eventDigest,
      code: { ...expected.timelock.code },
      implementation: { ...expected.timelock.implementation },
      proxyAdmin: { ...expected.timelock.proxyAdmin },
      proxyAdminOwner: expected.timelock.proxyAdminOwner,
      minimumDelaySeconds: expected.timelock.minimumDelaySeconds,
      openExecutor: expected.timelock.openExecutor,
      defaultAdminHolders: [...expected.timelock.defaultAdminHolders],
      proposerHolders: [...expected.timelock.proposerHolders],
      cancellerHolders: [...expected.timelock.cancellerHolders],
    },
    safeSingleton: { ...expected.safeSingleton },
    fallbackHandler: { ...expected.fallbackHandler },
    safes: {
      controllerExecutor: safeObserved(expected.safes.controllerExecutor),
      timelockGovernance: safeObserved(expected.safes.timelockGovernance),
      nestedOwner: safeObserved(expected.safes.nestedOwner),
    },
    authorityBoundaries: [...expected.authorityBoundaries],
    ...overrides,
  }
}

describe('Robinhood WETH authority evidence', () => {
  it('pins the complete authority chain without enabling execution', () => {
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.status).toBe('read-only-authority-chain-verified')
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.sourceAgreement).toBe(true)
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.controlStatus).toBe('authority-chain-verified')
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.authorityBoundaries).toEqual([])
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.executionEligible).toBe(false)
    expect(ROBINHOOD_WETH_AUTHORITY_EVIDENCE.executionBlockers.length).toBeGreaterThan(0)
  })

  it('accepts the exact historical snapshot and stays read-only', () => {
    const result = verifyRobinhoodWethAuthorityEvidence(observed())

    expect(result.status).toBe('verified-read-only')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.every((item) => item.status === 'pass')).toBe(true)
  })

  it('fails closed on controller role-history or holder drift', () => {
    const expected = observed()
    const cases: WethAuthorityObservedState[] = [
      {
        ...expected,
        controllerRoles: {
          ...expected.controllerRoles,
          eventDigest: `0x${'00'.repeat(32)}`,
        },
      },
      {
        ...expected,
        controllerRoles: {
          ...expected.controllerRoles,
          executorHolders: expected.controllerRoles.executorHolders.slice(1),
        },
      },
      {
        ...expected,
        controllerRoles: {
          ...expected.controllerRoles,
          executorEoa: { ...expected.controllerRoles.executorEoa, byteLength: 1 },
        },
      },
    ]

    for (const candidate of cases) {
      const result = verifyRobinhoodWethAuthorityEvidence(candidate)
      expect(result.status).toBe('mismatch')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('fails closed on timelock control drift', () => {
    const expected = observed()
    const cases: WethAuthorityObservedState[] = [
      {
        ...expected,
        timelock: { ...expected.timelock, minimumDelaySeconds: 0n },
      },
      {
        ...expected,
        timelock: { ...expected.timelock, openExecutor: false },
      },
      {
        ...expected,
        timelock: { ...expected.timelock, proposerHolders: [] },
      },
      {
        ...expected,
        timelock: {
          ...expected.timelock,
          implementation: { ...expected.timelock.implementation, bytecodeHash: `0x${'00'.repeat(32)}` },
        },
      },
    ]

    for (const candidate of cases) {
      const result = verifyRobinhoodWethAuthorityEvidence(candidate)
      expect(result.status).toBe('mismatch')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('fails closed on Safe owner, threshold, module, guard, or fallback drift', () => {
    const expected = observed()
    const safe = expected.safes.controllerExecutor
    const cases: WethAuthorityObservedState[] = [
      {
        ...expected,
        safes: {
          ...expected.safes,
          controllerExecutor: { ...safe, owners: safe.owners.slice(1) },
        },
      },
      {
        ...expected,
        safes: {
          ...expected.safes,
          controllerExecutor: { ...safe, threshold: safe.threshold - 1 },
        },
      },
      {
        ...expected,
        safes: {
          ...expected.safes,
          controllerExecutor: { ...safe, modules: [safe.owners[0]!] },
        },
      },
      {
        ...expected,
        safes: {
          ...expected.safes,
          controllerExecutor: { ...safe, guard: safe.owners[0]! },
        },
      },
      {
        ...expected,
        fallbackHandler: { ...expected.fallbackHandler, bytecodeHash: `0x${'00'.repeat(32)}` },
      },
    ]

    for (const candidate of cases) {
      const result = verifyRobinhoodWethAuthorityEvidence(candidate)
      expect(result.status).toBe('mismatch')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('fails closed when an unresolved authority boundary appears', () => {
    const expected = observed()
    const result = verifyRobinhoodWethAuthorityEvidence({
      ...expected,
      authorityBoundaries: [expected.timelock.code.address],
    })

    expect(result.status).toBe('mismatch')
    expect(result.executionEligible).toBe(false)
    expect(result.checks.find((item) => item.code === 'authority-boundaries')?.status).toBe('fail')
  })
})
