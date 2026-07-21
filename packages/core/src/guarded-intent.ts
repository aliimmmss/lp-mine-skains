import { createHash } from 'node:crypto'

export const GUARDED_INTENT_SCHEMA_VERSION = 1 as const

export type GuardedIntentProposal = {
  schemaVersion: typeof GUARDED_INTENT_SCHEMA_VERSION
  intentId: string
  proposalReference: string
  generatedAt: string
  expiresAt: string
  expectedChainId: number
  sender: `0x${string}`
  operationId: string
  destinationRegistryId: string
  destinationAddress: `0x${string}`
  recipient: `0x${string}`
  nativeValueBaseUnits: string
  evidence: {
    blockNumber: string
    observedAt: string
    registryBytecodeHash: `0x${string}`
  }
}

export type GuardedIntentPolicy = {
  expectedChainId: number
  expectedSender: `0x${string}` | null
  selectedOperationId: string | null
  destination: {
    registryId: string
    address: `0x${string}`
    bytecodeHash: `0x${string}`
    executionEligible: boolean
  }
  recipientPolicy: 'sender-only'
  maximumLifetimeSeconds: number
  maximumEvidenceAgeSeconds: number
}

export type GuardedIntentCheckOutcome = 'pass' | 'fail' | 'blocked'

export type GuardedIntentCheck = {
  code: string
  outcome: GuardedIntentCheckOutcome
  message: string
}

export type GuardedIntentAssessmentStatus = 'invalid' | 'blocked' | 'reviewable'

export type GuardedIntentAssessment = {
  mode: 'non-signing'
  status: GuardedIntentAssessmentStatus
  signingEligible: false
  assessedAt: string
  proposal: GuardedIntentProposal | null
  proposalDigest: `0x${string}` | null
  checks: readonly GuardedIntentCheck[]
  disclaimer: string
}

const PROPOSAL_KEYS = Object.freeze([
  'schemaVersion',
  'intentId',
  'proposalReference',
  'generatedAt',
  'expiresAt',
  'expectedChainId',
  'sender',
  'operationId',
  'destinationRegistryId',
  'destinationAddress',
  'recipient',
  'nativeValueBaseUnits',
  'evidence',
] as const)

const EVIDENCE_KEYS = Object.freeze(['blockNumber', 'observedAt', 'registryBytecodeHash'] as const)
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/
const UNSIGNED_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/

export function assessGuardedIntentProposal(
  input: unknown,
  policy: GuardedIntentPolicy,
  now = new Date(),
): GuardedIntentAssessment {
  assertValidPolicy(policy)
  assertValidDate(now, 'now')

  const parsed = parseProposal(input)
  const checks = [...parsed.checks]

  if (parsed.proposal !== null) {
    checks.push(...assessPolicy(parsed.proposal, policy, now))
  }

  const status = assessmentStatus(checks)
  return {
    mode: 'non-signing',
    status,
    signingEligible: false,
    assessedAt: now.toISOString(),
    proposal: parsed.proposal,
    proposalDigest: parsed.proposal === null ? null : digestProposal(parsed.proposal),
    checks,
    disclaimer:
      'This assessment parses and compares unsigned proposal data only. It cannot encode calldata, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.',
  }
}

export function digestGuardedIntentProposal(proposal: GuardedIntentProposal): `0x${string}` {
  return digestProposal(proposal)
}

function parseProposal(input: unknown): {
  proposal: GuardedIntentProposal | null
  checks: GuardedIntentCheck[]
} {
  const checks: GuardedIntentCheck[] = []
  if (!isRecord(input)) {
    return {
      proposal: null,
      checks: [check('proposal.object', 'fail', 'Proposal must be a plain object.')],
    }
  }

  const unknownKeys = Object.keys(input).filter(
    (key) => !(PROPOSAL_KEYS as readonly string[]).includes(key),
  )
  checks.push(
    unknownKeys.length === 0
      ? check('proposal.known-fields', 'pass', 'Proposal contains only allowed fields.')
      : check(
          'proposal.known-fields',
          'fail',
          `Proposal contains unknown fields: ${unknownKeys.sort().join(', ')}.`,
        ),
  )

  const schemaVersion = parseSchemaVersion(input.schemaVersion, checks)
  const intentId = parseIdentifier(input.intentId, 'proposal.intent-id', 'intentId', checks)
  const proposalReference = parseIdentifier(
    input.proposalReference,
    'proposal.reference',
    'proposalReference',
    checks,
  )
  const generatedAt = parseIsoTimestamp(input.generatedAt, 'proposal.generated-at', 'generatedAt', checks)
  const expiresAt = parseIsoTimestamp(input.expiresAt, 'proposal.expires-at', 'expiresAt', checks)
  const expectedChainId = parsePositiveInteger(
    input.expectedChainId,
    'proposal.chain-id',
    'expectedChainId',
    checks,
  )
  const sender = parseAddress(input.sender, 'proposal.sender', 'sender', checks)
  const operationId = parseIdentifier(input.operationId, 'proposal.operation-id', 'operationId', checks)
  const destinationRegistryId = parseIdentifier(
    input.destinationRegistryId,
    'proposal.destination-registry-id',
    'destinationRegistryId',
    checks,
  )
  const destinationAddress = parseAddress(
    input.destinationAddress,
    'proposal.destination-address',
    'destinationAddress',
    checks,
  )
  const recipient = parseAddress(input.recipient, 'proposal.recipient', 'recipient', checks)
  const nativeValueBaseUnits = parseUnsignedIntegerString(
    input.nativeValueBaseUnits,
    'proposal.native-value',
    'nativeValueBaseUnits',
    checks,
  )
  const evidence = parseEvidence(input.evidence, checks)

  if (
    schemaVersion === null ||
    intentId === null ||
    proposalReference === null ||
    generatedAt === null ||
    expiresAt === null ||
    expectedChainId === null ||
    sender === null ||
    operationId === null ||
    destinationRegistryId === null ||
    destinationAddress === null ||
    recipient === null ||
    nativeValueBaseUnits === null ||
    evidence === null ||
    unknownKeys.length > 0
  ) {
    return { proposal: null, checks }
  }

  return {
    proposal: {
      schemaVersion,
      intentId,
      proposalReference,
      generatedAt,
      expiresAt,
      expectedChainId,
      sender,
      operationId,
      destinationRegistryId,
      destinationAddress,
      recipient,
      nativeValueBaseUnits,
      evidence,
    },
    checks,
  }
}

function parseEvidence(
  input: unknown,
  checks: GuardedIntentCheck[],
): GuardedIntentProposal['evidence'] | null {
  if (!isRecord(input)) {
    checks.push(check('proposal.evidence-object', 'fail', 'evidence must be a plain object.'))
    return null
  }
  const unknownKeys = Object.keys(input).filter(
    (key) => !(EVIDENCE_KEYS as readonly string[]).includes(key),
  )
  checks.push(
    unknownKeys.length === 0
      ? check('proposal.evidence-known-fields', 'pass', 'Evidence contains only allowed fields.')
      : check(
          'proposal.evidence-known-fields',
          'fail',
          `Evidence contains unknown fields: ${unknownKeys.sort().join(', ')}.`,
        ),
  )

  const blockNumber = parseUnsignedIntegerString(
    input.blockNumber,
    'proposal.evidence-block-number',
    'evidence.blockNumber',
    checks,
  )
  const observedAt = parseIsoTimestamp(
    input.observedAt,
    'proposal.evidence-observed-at',
    'evidence.observedAt',
    checks,
  )
  const registryBytecodeHash = parseHash(
    input.registryBytecodeHash,
    'proposal.registry-bytecode-hash',
    'evidence.registryBytecodeHash',
    checks,
  )

  if (
    blockNumber === null ||
    blockNumber === '0' ||
    observedAt === null ||
    registryBytecodeHash === null ||
    unknownKeys.length > 0
  ) {
    if (blockNumber === '0') {
      checks.push(
        check('proposal.evidence-block-positive', 'fail', 'evidence.blockNumber must be greater than zero.'),
      )
    }
    return null
  }
  checks.push(check('proposal.evidence-block-positive', 'pass', 'Evidence block number is positive.'))

  return { blockNumber, observedAt, registryBytecodeHash }
}

function assessPolicy(
  proposal: GuardedIntentProposal,
  policy: GuardedIntentPolicy,
  now: Date,
): GuardedIntentCheck[] {
  const checks: GuardedIntentCheck[] = []
  const generatedAt = new Date(proposal.generatedAt)
  const expiresAt = new Date(proposal.expiresAt)
  const evidenceObservedAt = new Date(proposal.evidence.observedAt)
  const lifetimeSeconds = Math.floor((expiresAt.getTime() - generatedAt.getTime()) / 1_000)
  const evidenceAgeSeconds = Math.floor((now.getTime() - evidenceObservedAt.getTime()) / 1_000)

  checks.push(
    proposal.generatedAt <= now.toISOString()
      ? check('policy.generated-not-future', 'pass', 'Proposal generation time is not in the future.')
      : check('policy.generated-not-future', 'fail', 'Proposal generation time is in the future.'),
  )
  checks.push(
    expiresAt.getTime() > generatedAt.getTime() && expiresAt.getTime() > now.getTime()
      ? check('policy.not-expired', 'pass', 'Proposal is unexpired and expires after generation.')
      : check('policy.not-expired', 'fail', 'Proposal is expired or has an invalid time ordering.'),
  )
  checks.push(
    lifetimeSeconds <= policy.maximumLifetimeSeconds
      ? check('policy.lifetime', 'pass', 'Proposal lifetime is within the configured maximum.')
      : check('policy.lifetime', 'fail', 'Proposal lifetime exceeds the configured maximum.'),
  )
  checks.push(
    evidenceAgeSeconds >= 0 && evidenceAgeSeconds <= policy.maximumEvidenceAgeSeconds
      ? check('policy.evidence-age', 'pass', 'Evidence age is within the configured maximum.')
      : check('policy.evidence-age', 'fail', 'Evidence is future-dated or too old.'),
  )
  checks.push(
    proposal.expectedChainId === policy.expectedChainId
      ? check('policy.chain-id', 'pass', 'Proposal chain matches policy.')
      : check('policy.chain-id', 'fail', 'Proposal chain does not match policy.'),
  )

  if (policy.expectedSender === null) {
    checks.push(check('policy.sender-selected', 'blocked', 'No sender address has been selected by policy.'))
  } else {
    checks.push(
      proposal.sender === normalizeAddress(policy.expectedSender)
        ? check('policy.sender', 'pass', 'Proposal sender matches policy.')
        : check('policy.sender', 'fail', 'Proposal sender does not match policy.'),
    )
  }

  if (policy.selectedOperationId === null) {
    checks.push(check('policy.operation-selected', 'blocked', 'No first operation has been selected.'))
  } else {
    checks.push(
      proposal.operationId === policy.selectedOperationId
        ? check('policy.operation', 'pass', 'Proposal operation matches the selected operation.')
        : check('policy.operation', 'fail', 'Proposal operation does not match the selected operation.'),
    )
  }

  checks.push(
    proposal.destinationRegistryId === policy.destination.registryId
      ? check('policy.destination-registry', 'pass', 'Destination registry ID matches policy.')
      : check('policy.destination-registry', 'fail', 'Destination registry ID does not match policy.'),
  )
  checks.push(
    proposal.destinationAddress === normalizeAddress(policy.destination.address)
      ? check('policy.destination-address', 'pass', 'Destination address matches policy.')
      : check('policy.destination-address', 'fail', 'Destination address does not match policy.'),
  )
  checks.push(
    proposal.evidence.registryBytecodeHash === normalizeHash(policy.destination.bytecodeHash)
      ? check('policy.bytecode-hash', 'pass', 'Pinned bytecode hash matches policy.')
      : check('policy.bytecode-hash', 'fail', 'Pinned bytecode hash does not match policy.'),
  )
  checks.push(
    policy.destination.executionEligible
      ? check('policy.execution-eligible', 'pass', 'Destination is marked execution-eligible by policy.')
      : check('policy.execution-eligible', 'blocked', 'Destination is not execution-eligible.'),
  )
  checks.push(
    policy.recipientPolicy === 'sender-only' && proposal.recipient === proposal.sender
      ? check('policy.recipient', 'pass', 'Recipient is constrained to the sender.')
      : check('policy.recipient', 'fail', 'Recipient must equal the sender.'),
  )
  checks.push(
    proposal.nativeValueBaseUnits === '0'
      ? check('policy.zero-native-value', 'pass', 'Proposal native value is zero.')
      : check('policy.zero-native-value', 'fail', 'This slice rejects nonzero native value.'),
  )

  return checks
}

function parseSchemaVersion(value: unknown, checks: GuardedIntentCheck[]): 1 | null {
  if (value === GUARDED_INTENT_SCHEMA_VERSION) {
    checks.push(check('proposal.schema-version', 'pass', 'Schema version is supported.'))
    return value
  }
  checks.push(check('proposal.schema-version', 'fail', 'Schema version is unsupported.'))
  return null
}

function parseIdentifier(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): string | null {
  if (typeof value === 'string' && IDENTIFIER_PATTERN.test(value)) {
    checks.push(check(code, 'pass', `${name} is valid.`))
    return value
  }
  checks.push(check(code, 'fail', `${name} must be a nonempty bounded identifier.`))
  return null
}

function parseAddress(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): `0x${string}` | null {
  if (typeof value === 'string' && ADDRESS_PATTERN.test(value)) {
    checks.push(check(code, 'pass', `${name} is a valid address.`))
    return normalizeAddress(value as `0x${string}`)
  }
  checks.push(check(code, 'fail', `${name} must be a 20-byte hexadecimal address.`))
  return null
}

function parseHash(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): `0x${string}` | null {
  if (typeof value === 'string' && HASH_PATTERN.test(value)) {
    checks.push(check(code, 'pass', `${name} is a valid 32-byte hash.`))
    return normalizeHash(value as `0x${string}`)
  }
  checks.push(check(code, 'fail', `${name} must be a 32-byte hexadecimal hash.`))
  return null
}

function parseIsoTimestamp(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): string | null {
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString() === value) {
      checks.push(check(code, 'pass', `${name} is a canonical ISO timestamp.`))
      return value
    }
  }
  checks.push(check(code, 'fail', `${name} must be a canonical ISO timestamp.`))
  return null
}

function parsePositiveInteger(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    checks.push(check(code, 'pass', `${name} is a positive integer.`))
    return value
  }
  checks.push(check(code, 'fail', `${name} must be a positive safe integer.`))
  return null
}

function parseUnsignedIntegerString(
  value: unknown,
  code: string,
  name: string,
  checks: GuardedIntentCheck[],
): string | null {
  if (typeof value === 'string' && UNSIGNED_INTEGER_PATTERN.test(value)) {
    checks.push(check(code, 'pass', `${name} is a canonical unsigned integer string.`))
    return value
  }
  checks.push(check(code, 'fail', `${name} must be a canonical unsigned integer string.`))
  return null
}

function assessmentStatus(checks: readonly GuardedIntentCheck[]): GuardedIntentAssessmentStatus {
  if (checks.some((item) => item.outcome === 'fail')) return 'invalid'
  if (checks.some((item) => item.outcome === 'blocked')) return 'blocked'
  return 'reviewable'
}

function digestProposal(proposal: GuardedIntentProposal): `0x${string}` {
  return `0x${createHash('sha256').update(JSON.stringify(proposal)).digest('hex')}`
}

function check(code: string, outcome: GuardedIntentCheckOutcome, message: string): GuardedIntentCheck {
  return { code, outcome, message }
}

function normalizeAddress(value: `0x${string}`): `0x${string}` {
  return value.toLowerCase() as `0x${string}`
}

function normalizeHash(value: `0x${string}`): `0x${string}` {
  return value.toLowerCase() as `0x${string}`
}

function assertValidPolicy(policy: GuardedIntentPolicy): void {
  if (!Number.isSafeInteger(policy.expectedChainId) || policy.expectedChainId <= 0) {
    throw new RangeError('policy.expectedChainId must be a positive safe integer')
  }
  if (!Number.isSafeInteger(policy.maximumLifetimeSeconds) || policy.maximumLifetimeSeconds <= 0) {
    throw new RangeError('policy.maximumLifetimeSeconds must be a positive safe integer')
  }
  if (!Number.isSafeInteger(policy.maximumEvidenceAgeSeconds) || policy.maximumEvidenceAgeSeconds <= 0) {
    throw new RangeError('policy.maximumEvidenceAgeSeconds must be a positive safe integer')
  }
  if (!IDENTIFIER_PATTERN.test(policy.destination.registryId)) {
    throw new RangeError('policy.destination.registryId must be a valid identifier')
  }
  if (!ADDRESS_PATTERN.test(policy.destination.address)) {
    throw new RangeError('policy.destination.address must be a valid address')
  }
  if (!HASH_PATTERN.test(policy.destination.bytecodeHash)) {
    throw new RangeError('policy.destination.bytecodeHash must be a valid hash')
  }
  if (policy.expectedSender !== null && !ADDRESS_PATTERN.test(policy.expectedSender)) {
    throw new RangeError('policy.expectedSender must be a valid address or null')
  }
  if (policy.selectedOperationId !== null && !IDENTIFIER_PATTERN.test(policy.selectedOperationId)) {
    throw new RangeError('policy.selectedOperationId must be a valid identifier or null')
  }
}

function assertValidDate(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) throw new RangeError(`${name} must be a valid date`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
