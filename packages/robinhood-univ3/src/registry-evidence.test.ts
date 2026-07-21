import { describe, expect, it } from 'vitest'
import { getAddress, keccak256 } from 'viem'
import {
  ROBINHOOD_REGISTRY_EVIDENCE,
  registryEvidenceForAddress,
  verifyBytecodeEvidence,
  verifyRobinhoodRegistryBytecode,
  type RobinhoodRegistryBytecodeEvidence,
} from './registry-evidence.js'
import { ROBINHOOD_TOKENS, ROBINHOOD_UNISWAP_V3, ROBINHOOD_WETH_USDG_POOLS } from './registry.js'

const syntheticEvidence = {
  name: 'synthetic',
  role: 'pool',
  address: getAddress('0x0000000000000000000000000000000000000001'),
  byteLength: 2,
  bytecodeHash: keccak256('0x6000'),
  readEligible: true,
  executionEligible: false,
} satisfies RobinhoodRegistryBytecodeEvidence

describe('Robinhood registry evidence', () => {
  it('covers every pinned contract, token, and canonical pool', () => {
    const expectedAddresses = [
      ROBINHOOD_UNISWAP_V3.factory,
      ROBINHOOD_UNISWAP_V3.positionManager,
      ROBINHOOD_TOKENS.wrappedNative,
      ROBINHOOD_TOKENS.usdg,
      ...ROBINHOOD_WETH_USDG_POOLS.map((pool) => pool.poolAddress),
    ]

    expect(ROBINHOOD_REGISTRY_EVIDENCE.entries).toHaveLength(expectedAddresses.length)
    for (const address of expectedAddresses) {
      expect(registryEvidenceForAddress(address)).not.toBeNull()
    }
  })

  it('keeps every entry read-only eligible and execution ineligible', () => {
    expect(ROBINHOOD_REGISTRY_EVIDENCE.status).toBe('read-only-verified')
    expect(ROBINHOOD_REGISTRY_EVIDENCE.executionEligible).toBe(false)
    expect(ROBINHOOD_REGISTRY_EVIDENCE.executionBlockers.length).toBeGreaterThan(0)
    for (const entry of ROBINHOOD_REGISTRY_EVIDENCE.entries) {
      expect(entry.readEligible).toBe(true)
      expect(entry.executionEligible).toBe(false)
      expect(entry.byteLength).toBeGreaterThan(0)
      expect(entry.bytecodeHash).toMatch(/^0x[0-9a-f]{64}$/)
    }
  })

  it('verifies exact bytecode and rejects missing or changed code', () => {
    expect(verifyBytecodeEvidence(syntheticEvidence, '0x6000')).toMatchObject({ status: 'verified' })
    expect(verifyBytecodeEvidence(syntheticEvidence, undefined)).toMatchObject({ status: 'missing-code' })
    expect(verifyBytecodeEvidence(syntheticEvidence, '0x6001')).toMatchObject({ status: 'hash-mismatch' })
  })

  it('rejects unregistered addresses without inferring eligibility', () => {
    expect(
      verifyRobinhoodRegistryBytecode(getAddress('0x0000000000000000000000000000000000000002'), '0x6000'),
    ).toMatchObject({
      status: 'unregistered',
      expectedHash: null,
      expectedByteLength: null,
    })
  })
})
