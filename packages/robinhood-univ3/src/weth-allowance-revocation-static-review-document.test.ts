import { describe, expect, it } from 'vitest'
import { getAddress, keccak256, stringToHex } from 'viem'
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
import {
  WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE,
  WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP,
  WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION,
  WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS,
  createWethAllowanceRevocationStaticReviewDocument,
  digestWethAllowanceRevocationStaticReviewDocumentMetadata,
  escapeWethAllowanceRevocationStaticReviewText,
} from './weth-allowance-revocation-static-review-document.js'
import { ROBINHOOD_WETH_PROXY_EVIDENCE } from './weth-proxy-evidence.js'

const evidenceReviewedAt = new Date('2026-07-23T05:00:00.000Z')
const intentGeneratedAt = new Date('2026-07-23T05:00:10.000Z')
const intentAssessedAt = new Date('2026-07-23T05:00:20.000Z')
const confirmedAt = new Date('2026-07-23T05:00:30.000Z')
const confirmationAssessedAt = new Date('2026-07-23T05:00:40.000Z')
const documentAssessedAt = new Date('2026-07-23T05:00:50.000Z')
const buildCommit = 'a'.repeat(40)
const owner = getAddress('0x640BF0B6b8706f35195d6491cbE347c01b967393')
const otherOwner = getAddress('0x0000000000000000000000000000000000000001')
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
      observedAt: '2026-07-23T04:59:00.000Z',
      freshness: 'fresh',
    },
    provider: {
      status: 'available',
      providerCount: 2,
      providerAgreement: true,
      referencedPaperDigest: paperDigest,
      sharedBlock: '15700000',
      blockHash,
      observedAt: '2026-07-23T04:59:30.000Z',
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

function createValidDocument(
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
  return createWethAllowanceRevocationStaticReviewDocument({
    intentResult: overrides.intentResult ?? validIntentResult(),
    confirmationResult: overrides.confirmationResult ?? validConfirmationResult(),
    report: overrides.report ?? validReport(),
    currentState: overrides.currentState ?? validCurrentState(),
    buildCommit: overrides.buildCommit ?? buildCommit,
    generatedAt: overrides.generatedAt ?? intentGeneratedAt,
    assessedAt: overrides.assessedAt ?? documentAssessedAt,
  })
}

describe('static read-only WETH allowance-revocation review document', () => {
  it('creates deterministic script-free HTML and pinned serving metadata', () => {
    const result = createValidDocument()
    const document = result.document

    expect(result.status).toBe('ready-for-static-review')
    expect(document).not.toBeNull()
    if (document === null) throw new Error('Expected static review document')

    const { documentId, html, ...metadata } = document
    expect(documentId).toBe(digestWethAllowanceRevocationStaticReviewDocumentMetadata(metadata))
    expect(document.htmlDigest).toBe(keccak256(stringToHex(html)))
    expect(document.schemaVersion).toBe(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION)
    expect(document.contentType).toBe(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE)
    expect(document.headers).toEqual(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS)
    expect(document.headers['Content-Security-Policy']).toBe(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP)
    expect(document.headers['Referrer-Policy']).toBe('no-referrer')
    expect(document.headers['X-Content-Type-Options']).toBe('nosniff')
    expect(document.headers['Cache-Control']).toBe('no-store')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<meta http-equiv="Content-Security-Policy"')
    expect(html).toContain('OFFLINE FINAL REVIEW SUMMARY')
    expect(html).toContain('NO SIGNING OR EXECUTION AUTHORITY')
    expect(html).not.toMatch(
      /<\s*(script|style|link|img|iframe|object|embed|form|button|input|select|textarea|a|video|audio|canvas|svg)(?:\s|>)/i,
    )
    expect(html).not.toMatch(/\son[a-z0-9_-]+\s*=/i)
    expect(html).not.toMatch(
      /\s(?:href|src|srcset|action|formaction|poster|cite|background|ping|srcdoc|style|contenteditable|tabindex|autofocus|popover|popovertarget|download|draggable|target|usemap)\s*=/i,
    )
    expect(html).not.toMatch(/(?:https?:|javascript:|data:|blob:|file:|ftp:)/i)
    expect(result.browserInteractionAuthorized).toBe(false)
    expect(result.transactionBuildAuthorized).toBe(false)
    expect(result.walletRequestAuthorized).toBe(false)
    expect(result.signingEligible).toBe(false)
    expect(result.executionEligible).toBe(false)
    expect(result.reusableAuthority).toBe(false)
  })

  it('is deterministic for exact explicit inputs', () => {
    expect(createValidDocument()).toEqual(createValidDocument())
  })

  it('escapes every HTML-significant character', () => {
    expect(escapeWethAllowanceRevocationStaticReviewText(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;',
    )
    expect(escapeWethAllowanceRevocationStaticReviewText(42)).toBeNull()
  })

  it('blocks expiry and reviewed-state drift without emitting stale HTML', () => {
    const expiresAt = validIntentResult().intent?.expiresAt
    if (expiresAt === undefined) throw new Error('Expected expiry')
    const base = validCurrentState()
    const cases: readonly Partial<Parameters<typeof createValidDocument>[0]>[] = [
      { assessedAt: new Date(expiresAt) },
      { currentState: { ...base, incidentDisabled: true } },
      { currentState: { ...base, owner: otherOwner } },
      { currentState: { ...base, currentAllowance: 0n } },
      { currentState: { ...base, freshness: 'stale' } },
      { buildCommit: 'b'.repeat(40) },
      { generatedAt: new Date(intentGeneratedAt.getTime() + 1_000) },
    ]

    for (const overrides of cases) {
      const result = createValidDocument(overrides)

      expect(result.status).toBe('blocked')
      expect(result.document).toBeNull()
      expect(result.documentId).toBeNull()
      expect(result.htmlDigest).toBeNull()
      expect(result.html).toBeNull()
      expect(result.reasonCodes).toContain('final-summary-ready')
      expect(result.executionEligible).toBe(false)
    }
  })

  it('rejects forged, over-broad, and secret-bearing inputs without preserving them', () => {
    const secret = 'super-secret-static-document-key'
    const intent = validIntentResult()
    const confirmation = validConfirmationResult()
    const cases: readonly Partial<Parameters<typeof createValidDocument>[0]>[] = [
      { intentResult: { ...intent, executionEligible: true } },
      { intentResult: { ...intent, wallet: { signature: secret } } },
      { confirmationResult: { ...confirmation, walletRequestAuthorized: true } },
      { confirmationResult: { ...confirmation, transactionRequest: { calldata: '0xdeadbeef' } } },
      { report: { ...validReport(), providerPayload: { apiKey: secret } } },
      { currentState: { ...validCurrentState(), wallet: { signature: secret } } },
    ]

    for (const overrides of cases) {
      const result = createValidDocument(overrides)
      const serialized = JSON.stringify(result)

      expect(result.status).toBe('blocked')
      expect(result.document).toBeNull()
      expect(result.html).toBeNull()
      expect(serialized).not.toContain(secret)
      expect(serialized).not.toContain('0xdeadbeef')
      expect(serialized).not.toContain('providerPayload')
      expect(result.browserInteractionAuthorized).toBe(false)
      expect(result.walletRequestAuthorized).toBe(false)
      expect(result.signingEligible).toBe(false)
      expect(result.executionEligible).toBe(false)
      expect(result.reusableAuthority).toBe(false)
    }
  })
})
