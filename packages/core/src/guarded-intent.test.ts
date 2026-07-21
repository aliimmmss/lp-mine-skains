import { describe, expect, it } from 'vitest'
import {
  GUARDED_INTENT_SCHEMA_VERSION,
  assessGuardedIntentProposal,
  type GuardedIntentPolicy,
  type GuardedIntentProposal,
} from './guarded-intent.js'

const SENDER = '0x1111111111111111111111111111111111111111' as const
const DESTINATION = '0x2222222222222222222222222222222222222222' as const
const BYTECODE_HASH = `0x${'ab'.repeat(32)}` as const
const NOW = new Date('2026-07-21T10:00:00.000Z')

function proposal(overrides: Partial<GuardedIntentProposal> = {}): GuardedIntentProposal {
  return {
    schemaVersion: GUARDED_INTENT_SCHEMA_VERSION,
    intentId: 'intent-fixture-001',
    proposalReference: 'proposal-fixture-001',
    generatedAt: '2026-07-21T09:58:00.000Z',
    expiresAt: '2026-07-21T10:03:00.000Z',
    expectedChainId: 4663,
    sender: SENDER,
    operationId: 'fixture-review-operation',
    destinationRegistryId: 'fixture.destination',
    destinationAddress: DESTINATION,
    recipient: SENDER,
    nativeValueBaseUnits: '0',
    evidence: {
      blockNumber: '15442048',
      observedAt: '2026-07-21T09:59:00.000Z',
      registryBytecodeHash: BYTECODE_HASH,
    },
    ...overrides,
  }
}

function policy(overrides: Partial<GuardedIntentPolicy> = {}): GuardedIntentPolicy {
  return {
    expectedChainId: 4663,
    expectedSender: null,
    selectedOperationId: null,
    destination: {
      registryId: 'fixture.destination',
      address: DESTINATION,
      bytecodeHash: BYTECODE_HASH,
      executionEligible: false,
    },
    recipientPolicy: 'sender-only',
    maximumLifetimeSeconds: 600,
    maximumEvidenceAgeSeconds: 300,
    ...overrides,
  }
}

function checkOutcome(result: ReturnType<typeof assessGuardedIntentProposal>, code: string) {
  return result.checks.find((item) => item.code === code)?.outcome
}

describe('guarded intent proposal assessment', () => {
  it('blocks a valid proposal while operation, sender, and execution eligibility are unresolved', () => {
    const result = assessGuardedIntentProposal(proposal(), policy(), NOW)

    expect(result.mode).toBe('non-signing')
    expect(result.status).toBe('blocked')
    expect(result.signingEligible).toBe(false)
    expect(result.proposal).not.toBeNull()
    expect(result.proposalDigest).toMatch(/^0x[0-9a-f]{64}$/)
    expect(checkOutcome(result, 'policy.sender-selected')).toBe('blocked')
    expect(checkOutcome(result, 'policy.operation-selected')).toBe('blocked')
    expect(checkOutcome(result, 'policy.execution-eligible')).toBe('blocked')
  })

  it('rejects unknown top-level and evidence fields, including opaque calldata', () => {
    const input = {
      ...proposal(),
      calldata: '0xdeadbeef',
      evidence: {
        ...proposal().evidence,
        providerResponse: 'opaque',
      },
    }
    const result = assessGuardedIntentProposal(input, policy(), NOW)

    expect(result.status).toBe('invalid')
    expect(result.signingEligible).toBe(false)
    expect(result.proposal).toBeNull()
    expect(result.proposalDigest).toBeNull()
    expect(checkOutcome(result, 'proposal.known-fields')).toBe('fail')
    expect(checkOutcome(result, 'proposal.evidence-known-fields')).toBe('fail')
  })

  it('reports deterministic failures for chain, recipient, value, expiry, and stale evidence', () => {
    const result = assessGuardedIntentProposal(
      proposal({
        expectedChainId: 1,
        recipient: '0x3333333333333333333333333333333333333333',
        nativeValueBaseUnits: '1',
        expiresAt: '2026-07-21T09:59:00.000Z',
        evidence: {
          ...proposal().evidence,
          observedAt: '2026-07-21T09:40:00.000Z',
        },
      }),
      policy({
        expectedSender: SENDER,
        selectedOperationId: 'fixture-review-operation',
        destination: {
          ...policy().destination,
          executionEligible: true,
        },
      }),
      NOW,
    )

    expect(result.status).toBe('invalid')
    expect(result.signingEligible).toBe(false)
    expect(checkOutcome(result, 'policy.chain-id')).toBe('fail')
    expect(checkOutcome(result, 'policy.recipient')).toBe('fail')
    expect(checkOutcome(result, 'policy.zero-native-value')).toBe('fail')
    expect(checkOutcome(result, 'policy.not-expired')).toBe('fail')
    expect(checkOutcome(result, 'policy.evidence-age')).toBe('fail')
  })

  it('can mark a synthetic fixture reviewable without ever making it signable', () => {
    const result = assessGuardedIntentProposal(
      proposal(),
      policy({
        expectedSender: SENDER,
        selectedOperationId: 'fixture-review-operation',
        destination: {
          ...policy().destination,
          executionEligible: true,
        },
      }),
      NOW,
    )

    expect(result.status).toBe('reviewable')
    expect(result.signingEligible).toBe(false)
    expect(result.checks.every((item) => item.outcome === 'pass')).toBe(true)
  })

  it('produces the same digest regardless of input object key order and address casing', () => {
    const original = proposal()
    const reordered = {
      evidence: {
        registryBytecodeHash: BYTECODE_HASH.toUpperCase().replace('0X', '0x'),
        observedAt: original.evidence.observedAt,
        blockNumber: original.evidence.blockNumber,
      },
      nativeValueBaseUnits: original.nativeValueBaseUnits,
      recipient: original.recipient.toUpperCase().replace('0X', '0x'),
      destinationAddress: original.destinationAddress.toUpperCase().replace('0X', '0x'),
      destinationRegistryId: original.destinationRegistryId,
      operationId: original.operationId,
      sender: original.sender.toUpperCase().replace('0X', '0x'),
      expectedChainId: original.expectedChainId,
      expiresAt: original.expiresAt,
      generatedAt: original.generatedAt,
      proposalReference: original.proposalReference,
      intentId: original.intentId,
      schemaVersion: original.schemaVersion,
    }

    const left = assessGuardedIntentProposal(original, policy(), NOW)
    const right = assessGuardedIntentProposal(reordered, policy(), NOW)

    expect(left.proposalDigest).not.toBeNull()
    expect(right.proposalDigest).toBe(left.proposalDigest)
    expect(right.proposal?.sender).toBe(SENDER)
    expect(right.proposal?.destinationAddress).toBe(DESTINATION)
  })

  it('fails closed on malformed identifiers, timestamps, addresses, hashes, and integers', () => {
    const result = assessGuardedIntentProposal(
      {
        ...proposal(),
        intentId: '',
        generatedAt: 'not-a-date',
        sender: '0x1234',
        nativeValueBaseUnits: '01',
        evidence: {
          blockNumber: '0',
          observedAt: '2026-07-21T09:59:00Z',
          registryBytecodeHash: '0x1234',
        },
      },
      policy(),
      NOW,
    )

    expect(result.status).toBe('invalid')
    expect(result.proposal).toBeNull()
    expect(checkOutcome(result, 'proposal.intent-id')).toBe('fail')
    expect(checkOutcome(result, 'proposal.generated-at')).toBe('fail')
    expect(checkOutcome(result, 'proposal.sender')).toBe('fail')
    expect(checkOutcome(result, 'proposal.native-value')).toBe('fail')
    expect(checkOutcome(result, 'proposal.evidence-block-positive')).toBe('fail')
    expect(checkOutcome(result, 'proposal.evidence-observed-at')).toBe('fail')
    expect(checkOutcome(result, 'proposal.registry-bytecode-hash')).toBe('fail')
  })
})
