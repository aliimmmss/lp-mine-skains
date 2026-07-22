import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
  digestWethAllowanceRevocationReviewIntentBody,
  type WethAllowanceRevocationReviewIntentBody,
} from './weth-allowance-revocation-review-intent.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
  createWethAllowanceRevocationReviewConfirmation,
  digestWethAllowanceRevocationReviewConfirmationBody,
} from './weth-allowance-revocation-review-confirmation.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const generatedAt = new Date('2026-07-22T23:20:00.000Z')
const intentAssessedAt = new Date('2026-07-22T23:20:10.000Z')
const confirmedAt = new Date('2026-07-22T23:20:20.000Z')
const assessedAt = new Date('2026-07-22T23:20:30.000Z')
const expiresAt = new Date('2026-07-22T23:25:00.000Z')
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const otherOwner = getAddress('0x0000000000000000000000000000000000000001')
const otherAddress = getAddress('0x0000000000000000000000000000000000000002')
const paperDigest = `0x${'11'.repeat(32)}` as const
const reviewDigest = `0x${'22'.repeat(32)}` as const
const policyDigest = `0x${'33'.repeat(32)}` as const
const lifecycleDigest = `0x${'44'.repeat(32)}` as const
const currentStateDigest = `0x${'55'.repeat(32)}` as const
const blockHash = `0x${'66'.repeat(32)}` as const

const intentCheckCodes = [
  'build-commit',
  'generated-at',
  'assessed-at',
  'generated-not-future',
  'review-window-open',
  'lifecycle-valid',
  'lifecycle-authorization-disabled',
  'report-evidence',
  'policy-evidence-digest',
  'owner-nonzero',
  'operation-boundary',
] as const

function validIntentResult() {
  const body: WethAllowanceRevocationReviewIntentBody = {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
    operation: WETH_ALLOWANCE_REVOCATION_OPERATION,
    generatedAt: generatedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    buildCommit: 'a'.repeat(40),
    chainId: ROBINHOOD_CHAIN_ID,
    owner,
    destination: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
    reviewedImplementation: ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address,
    functionName: 'approve',
    token: ROBINHOOD_UNISWAP_V3.wrappedNative,
    spender: ROBINHOOD_UNISWAP_V3.positionManager,
    desiredAllowance: '0',
    nativeValue: '0',
    paperEvidenceDigest: paperDigest,
    reviewReportDigest: reviewDigest,
    policyEvidenceDigest: policyDigest,
    lifecycleDigest,
    currentStateDigest,
    sharedBlock: '15700000',
    blockHash,
  }
  const intentId = digestWethAllowanceRevocationReviewIntentBody(body)
  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_REVIEW_INTENT_VERSION,
    status: 'ready-for-human-review',
    assessedAt: intentAssessedAt.toISOString(),
    intent: { ...body, intentId },
    intentId,
    lifecycle: {
      status: 'valid-for-human-review',
      originalReportDigest: reviewDigest,
      currentStateDigest,
      lifecycleDigest,
      reasonCodes: [],
    },
    checks: intentCheckCodes.map((code) => ({ code, status: 'pass', message: 'Reviewed check passed.' })),
    reasonCodes: [],
    reasons: ['Ready for human review only.'],
    transactionBuildAuthorized: false,
    implementationAuthorized: false,
    simulationAuthorized: false,
    signingEligible: false,
    executionEligible: false,
    disclaimer: 'No execution authority.',
  }
}

function validConfirmation() {
  const intent = validIntentResult().intent
  return {
    intentId: intent.intentId,
    phrase: WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
    owner: intent.owner,
    destination: intent.destination,
    spender: intent.spender,
    desiredAllowance: '0',
    nativeValue: '0',
    confirmedAt,
    acknowledgesAllowanceRevocation: true,
    acknowledgesNoTokenTransfer: true,
    acknowledgesNoTransactionSigningExecutionAuthority: true,
  }
}

function createValidResult() {
  return createWethAllowanceRevocationReviewConfirmation({
    intentResult: validIntentResult(),
    confirmation: validConfirmation(),
    assessedAt,
  })
}

describe('offline WETH allowance-revocation deliberate confirmation', () => {
  it('creates a deterministic non-authorizing confirmation record', () => {
    const result = createValidResult()
    const confirmation = result.confirmation

    expect(result.status).toBe('confirmed-for-offline-review')
    expect(confirmation).not.toBeNull()
    if (confirmation === null) throw new Error('Expected confirmation')

    const { confirmationId, ...body } = confirmation
    expect(confirmationId).toBe(digestWethAllowanceRevocationReviewConfirmationBody(body))
    expect(result.confirmationId).toBe(confirmationId)
    expect(confirmation.phrase).toBe(WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE)
    expect(confirmation.intentId).toBe(validIntentResult().intentId)
    expect(confirmation.intentExpiresAt).toBe(expiresAt.toISOString())
    expect(result.transactionBuildAuthorized).toBe(false)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.walletRequestAuthorized).toBe(false)
    expect(result.signingEligible).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.reusableAuthority).toBe(false)
  })

  it('is deterministic for exact typed intent, confirmation, and assessment inputs', () => {
    expect(createValidResult()).toEqual(createValidResult())
  })

  it('blocks every confirmation content and acknowledgement mismatch', () => {
    const base = validConfirmation()
    const cases: readonly [string, unknown][] = [
      ['confirmation-intent-id', { ...base, intentId: paperDigest }],
      ['confirmation-phrase', { ...base, phrase: 'Revoke WETH Allowance' }],
      ['confirmation-owner', { ...base, owner: otherOwner }],
      ['confirmation-destination', { ...base, destination: otherAddress }],
      ['confirmation-spender', { ...base, spender: otherAddress }],
      ['confirmation-desired-allowance', { ...base, desiredAllowance: '1' }],
      ['confirmation-native-value', { ...base, nativeValue: '1' }],
      ['acknowledges-allowance-revocation', { ...base, acknowledgesAllowanceRevocation: false }],
      ['acknowledges-no-token-transfer', { ...base, acknowledgesNoTokenTransfer: false }],
      ['acknowledges-no-authority', { ...base, acknowledgesNoTransactionSigningExecutionAuthority: false }],
    ]

    for (const [reasonCode, confirmation] of cases) {
      const result = createWethAllowanceRevocationReviewConfirmation({
        intentResult: validIntentResult(),
        confirmation,
        assessedAt,
      })
      expect(result.status, reasonCode).toBe('blocked')
      expect(result.confirmation, reasonCode).toBeNull()
      expect(result.reasonCodes, reasonCode).toContain(reasonCode)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('blocks pre-generation, pre-review, expired, and future confirmation timing', () => {
    const base = validConfirmation()
    const cases: readonly [string, Date, Date][] = [
      ['confirmation-after-generation', new Date(generatedAt.getTime() - 1), assessedAt],
      ['confirmation-after-intent-assessment', new Date(intentAssessedAt.getTime() - 1), assessedAt],
      ['confirmation-before-expiry', new Date(expiresAt), new Date(expiresAt.getTime() + 1)],
      ['confirmation-not-future', new Date(assessedAt.getTime() + 1), assessedAt],
      ['assessment-before-expiry', confirmedAt, new Date(expiresAt)],
    ]

    for (const [reasonCode, candidateConfirmedAt, candidateAssessedAt] of cases) {
      const result = createWethAllowanceRevocationReviewConfirmation({
        intentResult: validIntentResult(),
        confirmation: { ...base, confirmedAt: candidateConfirmedAt },
        assessedAt: candidateAssessedAt,
      })
      expect(result.status, reasonCode).toBe('blocked')
      expect(result.reasonCodes, reasonCode).toContain(reasonCode)
      expect(result.confirmation).toBeNull()
    }
  })

  it('blocks malformed, tampered, incomplete, or authorization-enabled intent results', () => {
    const valid = validIntentResult()
    const cases: readonly unknown[] = [
      { ...valid, executionEligible: true },
      { ...valid, intentId: paperDigest },
      { ...valid, intent: { ...valid.intent, owner: otherOwner } },
      { ...valid, checks: valid.checks.slice(1) },
      { ...valid, lifecycle: { ...valid.lifecycle, reasonCodes: ['stale'] } },
      { ...valid, assessedAt: expiresAt.toISOString() },
    ]

    for (const intentResult of cases) {
      const result = createWethAllowanceRevocationReviewConfirmation({
        intentResult,
        confirmation: validConfirmation(),
        assessedAt,
      })
      expect(result.status).toBe('blocked')
      expect(result.reasonCodes).toContain('intent-result')
      expect(result.confirmation).toBeNull()
      expect(result.walletRequestAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('rejects extra secret, wallet, and transaction fields without preserving them', () => {
    const secret = 'super-secret-wallet-key'
    const candidates: readonly [unknown, unknown][] = [
      [{ ...validIntentResult(), wallet: { signature: secret } }, validConfirmation()],
      [
        validIntentResult(),
        {
          ...validConfirmation(),
          transactionRequest: { calldata: '0xdeadbeef', privateKey: secret },
        },
      ],
    ]

    for (const [intentResult, confirmation] of candidates) {
      const result = createWethAllowanceRevocationReviewConfirmation({
        intentResult,
        confirmation,
        assessedAt,
      })
      const serialized = JSON.stringify(result)

      expect(result.status).toBe('blocked')
      expect(result.confirmation).toBeNull()
      expect(serialized).not.toContain(secret)
      expect(serialized).not.toContain('0xdeadbeef')
      expect(serialized).not.toContain('transactionRequest')
      expect(result.reusableAuthority).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })
})
