import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import {
  POSITION_MANAGER_DISPLAY_LABEL,
  ROBINHOOD_CHAIN_DISPLAY_NAME,
  WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION,
  WETH_DECIMALS,
  WETH_DISPLAY_LABEL,
  WETH_PROXY_DISPLAY_LABEL,
  createWethAllowanceRevocationFinalReviewSummary,
  digestWethAllowanceRevocationFinalReviewSummaryBody,
  renderWethAllowanceRevocationFinalReviewSummary,
  type WethAllowanceRevocationFinalReviewSummaryBody,
} from './weth-allowance-revocation-final-review-summary.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3 } from './registry.js'
import { WETH_ALLOWANCE_REVOCATION_OPERATION } from './weth-allowance-paper.js'
import {
  WETH_ALLOWANCE_REVOCATION_REVIEW_CONFIRMATION_PHRASE,
  createWethAllowanceRevocationReviewConfirmation,
} from './weth-allowance-revocation-review-confirmation.js'
import { createWethAllowanceRevocationReviewIntent } from './weth-allowance-revocation-review-intent.js'
import {
  WETH_ALLOWANCE_SIMULATION_FIXTURE_VERSION,
  WETH_ALLOWANCE_SIMULATION_SOURCE_FORMAT,
  ingestWethAllowanceSimulationFixture,
  type WethAllowanceSimulationOfflineFixture,
} from './weth-allowance-simulation-ingestion.js'
import type { WethAllowanceSimulationReviewCurrentState } from './weth-allowance-simulation-review-lifecycle.js'
import { createWethAllowanceSimulationReviewReport } from './weth-allowance-simulation-review-report.js'
import { defaultWethAllowanceSimulationIdentityEvidence } from './weth-allowance-simulation-policy.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const evidenceReviewedAt = new Date('2026-07-23T04:00:00.000Z')
const intentGeneratedAt = new Date('2026-07-23T04:00:10.000Z')
const intentAssessedAt = new Date('2026-07-23T04:00:20.000Z')
const confirmedAt = new Date('2026-07-23T04:00:30.000Z')
const confirmationAssessedAt = new Date('2026-07-23T04:00:40.000Z')
const summaryAssessedAt = new Date('2026-07-23T04:00:50.000Z')
const buildCommit = 'a'.repeat(40)
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const otherOwner = getAddress('0x0000000000000000000000000000000000000001')
const otherAddress = getAddress('0x0000000000000000000000000000000000000002')
const paperDigest = `0x${'11'.repeat(32)}` as const
const otherDigest = `0x${'33'.repeat(32)}` as const
const blockHash = `0x${'22'.repeat(32)}` as const
const otherBlockHash = `0x${'44'.repeat(32)}` as const

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
      observedAt: '2026-07-23T03:59:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-23T03:59:30.000Z',
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

function validReport() {
  return createWethAllowanceSimulationReviewReport(
    ingestWethAllowanceSimulationFixture(validFixture(), evidenceReviewedAt),
  )
}

function validCurrentState(): WethAllowanceSimulationReviewCurrentState {
  const evidence = validReport().evidence
  if (evidence === null) throw new Error('Expected valid review evidence')

  return {
    incidentDisabled: false,
    operation: evidence.operation,
    chainId: evidence.chainId,
    owner: evidence.owner,
    token: evidence.token,
    proxyAddress: evidence.proxyAddress,
    implementationAddress: evidence.implementationAddress,
    spender: evidence.spender,
    paperEvidenceDigest: evidence.paperEvidenceDigest,
    sharedBlock: BigInt(evidence.sharedBlock),
    blockHash: evidence.blockHash,
    currentAllowance: BigInt(evidence.allowanceBefore),
    registryVerified: true,
    authorityStatus: evidence.authorityStatus,
    authoritySourceAgreement: true,
    unresolvedAuthorityBoundaryCount: 0,
    providerAgreement: true,
    freshness: 'fresh',
  }
}

function validIntentResult() {
  return createWethAllowanceRevocationReviewIntent({
    report: validReport(),
    currentState: validCurrentState(),
    buildCommit,
    generatedAt: intentGeneratedAt,
    assessedAt: intentAssessedAt,
  })
}

function validConfirmationResult() {
  const intentResult = validIntentResult()
  const intent = intentResult.intent
  if (intent === null) throw new Error('Expected valid typed intent')

  return createWethAllowanceRevocationReviewConfirmation({
    intentResult,
    confirmation: {
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
    },
    assessedAt: confirmationAssessedAt,
  })
}

function createValidSummary(
  overrides: Partial<{
    intentResult: unknown
    confirmationResult: unknown
    report: unknown
    currentState: unknown
    buildCommit: unknown
    generatedAt: unknown
    assessedAt: unknown
  }> = {},
) {
  return createWethAllowanceRevocationFinalReviewSummary({
    intentResult: overrides.intentResult ?? validIntentResult(),
    confirmationResult: overrides.confirmationResult ?? validConfirmationResult(),
    report: overrides.report ?? validReport(),
    currentState: overrides.currentState ?? validCurrentState(),
    buildCommit: overrides.buildCommit ?? buildCommit,
    generatedAt: overrides.generatedAt ?? intentGeneratedAt,
    assessedAt: overrides.assessedAt ?? summaryAssessedAt,
  })
}

describe('offline WETH allowance-revocation final review summary', () => {
  it('creates a complete deterministic display artifact without authorization', () => {
    const result = createValidSummary()
    const summary = result.summary

    expect(result.status).toBe('ready-for-offline-display')
    expect(summary).not.toBeNull()
    if (summary === null) throw new Error('Expected final review summary')

    const { summaryId, ...body } = summary
    expect(summaryId).toBe(digestWethAllowanceRevocationFinalReviewSummaryBody(body))
    expect(result.summaryId).toBe(summaryId)
    expect(summary.schemaVersion).toBe(WETH_ALLOWANCE_REVOCATION_FINAL_REVIEW_SUMMARY_VERSION)
    expect(summary.operation).toBe(WETH_ALLOWANCE_REVOCATION_OPERATION)
    expect(summary.chain).toEqual({ name: ROBINHOOD_CHAIN_DISPLAY_NAME, chainId: ROBINHOOD_CHAIN_ID })
    expect(summary.owner).toBe(owner)
    expect(summary.destination).toEqual({
      label: WETH_PROXY_DISPLAY_LABEL,
      address: ROBINHOOD_WETH_PROXY_EVIDENCE.proxy.address,
    })
    expect(summary.reviewedImplementation).toBe(ROBINHOOD_WETH_PROXY_EVIDENCE.implementation.address)
    expect(summary.functionName).toBe('approve')
    expect(summary.token).toEqual({
      label: WETH_DISPLAY_LABEL,
      address: ROBINHOOD_UNISWAP_V3.wrappedNative,
      decimals: WETH_DECIMALS,
    })
    expect(summary.spender).toEqual({
      label: POSITION_MANAGER_DISPLAY_LABEL,
      address: ROBINHOOD_UNISWAP_V3.positionManager,
    })
    expect(summary.currentReviewedAllowance).toBe('1')
    expect(summary.desiredAllowance).toBe('0')
    expect(summary.nativeValue).toBe('0')
    expect(summary.actionEffect).toEqual({
      revokesAllowance: true,
      transfersTokens: false,
      description:
        'Revoke the pinned WETH allowance for the pinned Uniswap v3 position manager without transferring tokens.',
    })
    expect(summary.buildCommit).toBe(buildCommit)
    expect(summary.sharedBlock).toBe('15700000')
    expect(summary.blockHash).toBe(blockHash)
    expect(summary.evidence.intentId).toBe(validIntentResult().intentId)
    expect(summary.evidence.confirmationId).toBe(validConfirmationResult().confirmationId)
    expect(summary.criticalWarnings).toHaveLength(4)
    expect(result.renderedText).toBe(renderWethAllowanceRevocationFinalReviewSummary(summary))
    expect(result.renderedText).toContain(`Owner: ${owner}`)
    expect(result.renderedText).toContain(`Destination: ${WETH_PROXY_DISPLAY_LABEL}`)
    expect(result.renderedText).toContain('NO SIGNING OR EXECUTION AUTHORITY')
    expect(result.transactionBuildAuthorized).toBe(false)
    expect(result.implementationAuthorized).toBe(false)
    expect(result.simulationAuthorized).toBe(false)
    expect(result.walletRequestAuthorized).toBe(false)
    expect(result.signingEligible).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.reusableAuthority).toBe(false)
  })

  it('is deterministic for exact explicit inputs', () => {
    expect(createValidSummary()).toEqual(createValidSummary())
  })

  it('blocks at expiry and does not render stale review text', () => {
    const expiresAt = validIntentResult().intent?.expiresAt
    if (expiresAt === undefined) throw new Error('Expected expiry')

    const result = createValidSummary({ assessedAt: new Date(expiresAt) })

    expect(result.status).toBe('blocked')
    expect(result.summary).toBeNull()
    expect(result.summaryId).toBeNull()
    expect(result.renderedText).toBeNull()
    expect(result.reasonCodes).toContain('confirmation-lifecycle-valid')
    expect(result.reasonCodes).toContain('confirmation-lifecycle-assessment-before-expiry')
    expect(result.executionEligible).toBe(false)
  })

  it('blocks representative current-state and evidence drift', () => {
    const base = validCurrentState()
    const cases: readonly [string, Partial<Parameters<typeof createValidSummary>[0]>][] = [
      ['incident', { currentState: { ...base, incidentDisabled: true } }],
      ['owner', { currentState: { ...base, owner: otherOwner } }],
      ['proxy', { currentState: { ...base, proxyAddress: otherAddress } }],
      ['allowance', { currentState: { ...base, currentAllowance: 0n } }],
      ['block', { currentState: { ...base, blockHash: otherBlockHash } }],
      ['freshness', { currentState: { ...base, freshness: 'stale' } }],
      ['report', { report: { ...validReport(), reportDigest: otherDigest } }],
      ['build', { buildCommit: 'b'.repeat(40) }],
      ['generation', { generatedAt: new Date(intentGeneratedAt.getTime() + 1_000) }],
    ]

    for (const [label, overrides] of cases) {
      const result = createValidSummary(overrides)

      expect(result.status, label).toBe('blocked')
      expect(result.summary, label).toBeNull()
      expect(result.renderedText, label).toBeNull()
      expect(result.reasonCodes, label).toContain('confirmation-lifecycle-valid')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('blocks forged intent and confirmation records', () => {
    const intent = validIntentResult()
    const confirmation = validConfirmationResult()
    const cases: readonly Partial<Parameters<typeof createValidSummary>[0]>[] = [
      { intentResult: { ...intent, executionEligible: true } },
      { intentResult: { ...intent, intentId: otherDigest } },
      { intentResult: { ...intent, checks: intent.checks.slice(1) } },
      { confirmationResult: { ...confirmation, walletRequestAuthorized: true } },
      { confirmationResult: { ...confirmation, confirmationId: otherDigest } },
      { confirmationResult: { ...confirmation, checks: confirmation.checks.slice(1) } },
    ]

    for (const overrides of cases) {
      const result = createValidSummary(overrides)

      expect(result.status).toBe('blocked')
      expect(result.summary).toBeNull()
      expect(result.renderedText).toBeNull()
      expect(result.reasonCodes).toContain('confirmation-lifecycle-valid')
      expect(result.walletRequestAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
    }
  })

  it('refuses to render forged runtime summaries even with recomputed digests', () => {
    const summary = createValidSummary().summary
    if (summary === null) throw new Error('Expected summary')
    const secret = 'forged-secret-display-copy'
    const { summaryId, ...body } = summary
    expect(summaryId).toBe(summary.summaryId)
    const forgedBody = {
      ...body,
      criticalWarnings: [...body.criticalWarnings.slice(0, 3), secret],
    }
    const forged = {
      ...forgedBody,
      summaryId: digestWethAllowanceRevocationFinalReviewSummaryBody(
        forgedBody as unknown as WethAllowanceRevocationFinalReviewSummaryBody,
      ),
    }

    expect(renderWethAllowanceRevocationFinalReviewSummary(forged)).toBeNull()
    expect(
      renderWethAllowanceRevocationFinalReviewSummary({ ...summary, providerPayload: { apiKey: secret } }),
    ).toBeNull()
  })

  it('rejects extra and inherited secret-bearing fields without copying them', () => {
    const secret = 'super-secret-wallet-key'
    const currentState = validCurrentState()
    const inherited = Object.create({ currentAllowance: currentState.currentAllowance }) as Record<string, unknown>
    for (const [key, value] of Object.entries(currentState)) {
      if (key !== 'currentAllowance') inherited[key] = value
    }
    inherited.providerPayload = { apiKey: secret }

    const cases: readonly Partial<Parameters<typeof createValidSummary>[0]>[] = [
      { intentResult: { ...validIntentResult(), wallet: { signature: secret } } },
      { confirmationResult: { ...validConfirmationResult(), transactionRequest: { calldata: '0xdeadbeef' } } },
      { report: { ...validReport(), providerPayload: { apiKey: secret } } },
      { currentState: { ...validCurrentState(), wallet: { signature: secret } } },
      { currentState: inherited },
    ]

    for (const overrides of cases) {
      const result = createValidSummary(overrides)
      const serialized = JSON.stringify(result)

      expect(result.status).toBe('blocked')
      expect(result.summary).toBeNull()
      expect(result.renderedText).toBeNull()
      expect(serialized).not.toContain(secret)
      expect(serialized).not.toContain('0xdeadbeef')
      expect(serialized).not.toContain('providerPayload')
      expect(result.transactionBuildAuthorized).toBe(false)
      expect(result.walletRequestAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
      expect(result.reusableAuthority).toBe(false)
    }
  })
})
