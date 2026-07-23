import { keccak256, stringToHex, type Hex } from 'viem'
import { canonicalJson } from './weth-allowance-paper.js'
import {
  createWethAllowanceRevocationFinalReviewSummary,
  type WethAllowanceRevocationFinalReviewSummaryInput,
} from './weth-allowance-revocation-final-review-summary.js'

export const WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION = '1.0.0' as const
export const WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE = 'text/html; charset=utf-8' as const
export const WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP =
  "default-src 'none'; base-uri 'none'; connect-src 'none'; font-src 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'; img-src 'none'; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'none'; worker-src 'none'" as const
export const WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS = Object.freeze({
  'Content-Security-Policy': WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP,
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
} as const)

const PROHIBITED_ELEMENTS = [
  'script',
  'style',
  'link',
  'img',
  'iframe',
  'object',
  'embed',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  'a',
  'video',
  'audio',
  'canvas',
  'svg',
  'base',
  'area',
  'details',
  'summary',
  'dialog',
  'menu',
  'fieldset',
  'label',
  'option',
  'optgroup',
] as const

const PROHIBITED_SCHEMES = ['http:', 'https:', 'javascript:', 'data:', 'blob:', 'file:', 'ftp:'] as const

export type WethAllowanceRevocationStaticReviewDocumentInput = WethAllowanceRevocationFinalReviewSummaryInput

export type WethAllowanceRevocationStaticReviewDocumentMetadata = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION
  summaryId: Hex
  confirmationLifecycleDigest: Hex
  htmlDigest: Hex
  contentType: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE
  headers: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS
}>

export type WethAllowanceRevocationStaticReviewDocument = WethAllowanceRevocationStaticReviewDocumentMetadata &
  Readonly<{
    documentId: Hex
    html: string
  }>

export type WethAllowanceRevocationStaticReviewDocumentCheck = Readonly<{
  code: string
  status: 'pass' | 'fail'
  message: string
}>

export type WethAllowanceRevocationStaticReviewDocumentResult = Readonly<{
  schemaVersion: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION
  status: 'blocked' | 'ready-for-static-review'
  document: WethAllowanceRevocationStaticReviewDocument | null
  documentId: Hex | null
  htmlDigest: Hex | null
  html: string | null
  summaryId: Hex | null
  confirmationLifecycleDigest: Hex
  contentType: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE
  headers: typeof WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS
  checks: readonly WethAllowanceRevocationStaticReviewDocumentCheck[]
  reasonCodes: readonly string[]
  reasons: readonly string[]
  browserInteractionAuthorized: false
  transactionBuildAuthorized: false
  implementationAuthorized: false
  simulationAuthorized: false
  walletRequestAuthorized: false
  signingEligible: false
  executionEligible: false
  reusableAuthority: false
  disclaimer: string
}>

export function createWethAllowanceRevocationStaticReviewDocument(
  input: WethAllowanceRevocationStaticReviewDocumentInput,
): WethAllowanceRevocationStaticReviewDocumentResult {
  const summaryResult = createWethAllowanceRevocationFinalReviewSummary(input)
  const summary = summaryResult.summary
  const renderedText = summaryResult.renderedText

  const authorizationDisabled =
    summaryResult.transactionBuildAuthorized === false &&
    summaryResult.implementationAuthorized === false &&
    summaryResult.simulationAuthorized === false &&
    summaryResult.walletRequestAuthorized === false &&
    summaryResult.signingEligible === false &&
    summaryResult.executionEligible === false &&
    summaryResult.reusableAuthority === false

  let candidateHtml: string | null = null
  if (summary !== null && renderedText !== null) {
    candidateHtml = renderStaticReviewHtml(renderedText)
  }

  const checks: WethAllowanceRevocationStaticReviewDocumentCheck[] = [
    documentCheck(
      'final-summary-ready',
      summaryResult.status === 'ready-for-offline-display' && summary !== null,
      'Final review summary is ready for offline display.',
      'Final review summary is blocked or unavailable.',
    ),
    documentCheck(
      'final-summary-text-present',
      renderedText !== null && renderedText.length > 0,
      'Strict final-review text is present.',
      'Strict final-review text is unavailable.',
    ),
    documentCheck(
      'final-summary-authorization-disabled',
      authorizationDisabled,
      'All final-summary authorization flags remain disabled.',
      'A final-summary authorization flag is not disabled.',
    ),
    documentCheck(
      'static-html-present',
      candidateHtml !== null && candidateHtml.length > 0,
      'Static review HTML is present.',
      'Static review HTML is unavailable.',
    ),
    documentCheck(
      'static-html-required-metadata',
      candidateHtml !== null && hasRequiredMetadata(candidateHtml),
      'Static review HTML contains the required metadata and CSP.',
      'Static review HTML is missing required metadata or CSP.',
    ),
    documentCheck(
      'static-html-prohibited-elements',
      candidateHtml !== null && !containsProhibitedElement(candidateHtml),
      'Static review HTML contains no prohibited interactive or external-resource elements.',
      'Static review HTML contains a prohibited interactive or external-resource element.',
    ),
    documentCheck(
      'static-html-prohibited-attributes',
      candidateHtml !== null && !containsProhibitedAttribute(candidateHtml),
      'Static review HTML contains no event, navigation, resource, form, or style attributes.',
      'Static review HTML contains a prohibited event, navigation, resource, form, or style attribute.',
    ),
    documentCheck(
      'static-html-prohibited-schemes',
      candidateHtml !== null && !containsProhibitedScheme(candidateHtml),
      'Static review HTML contains no external, JavaScript, data, blob, file, or FTP scheme.',
      'Static review HTML contains a prohibited URL scheme.',
    ),
  ]

  for (const reasonCode of summaryResult.reasonCodes) {
    checks.push(
      documentCheck(
        `final-summary-${reasonCode}`,
        false,
        'Final-summary check passed.',
        `Final-summary invalidation remains active: ${reasonCode}.`,
      ),
    )
  }

  let document: WethAllowanceRevocationStaticReviewDocument | null = null
  if (checks.every((check) => check.status === 'pass') && summary !== null && candidateHtml !== null) {
    const htmlDigest = keccak256(stringToHex(candidateHtml))
    const metadata: WethAllowanceRevocationStaticReviewDocumentMetadata = {
      schemaVersion: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION,
      summaryId: summary.summaryId,
      confirmationLifecycleDigest: summary.evidence.confirmationLifecycleDigest,
      htmlDigest,
      contentType: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE,
      headers: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS,
    }
    const documentId = digestWethAllowanceRevocationStaticReviewDocumentMetadata(metadata)
    document = { ...metadata, documentId, html: candidateHtml }
  }

  const status = document === null ? ('blocked' as const) : ('ready-for-static-review' as const)
  const reasonCodes = checks.filter((check) => check.status === 'fail').map((check) => check.code)
  const reasons =
    status === 'ready-for-static-review'
      ? [
          'The deterministic static document is ready for read-only review only. It contains no controls, external resources, wallet access, transaction construction, signing, execution, or reusable authority.',
        ]
      : checks.filter((check) => check.status === 'fail').map((check) => check.message)

  return {
    schemaVersion: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_DOCUMENT_VERSION,
    status,
    document,
    documentId: document?.documentId ?? null,
    htmlDigest: document?.htmlDigest ?? null,
    html: document?.html ?? null,
    summaryId: document?.summaryId ?? null,
    confirmationLifecycleDigest: summaryResult.lifecycle.lifecycleDigest,
    contentType: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CONTENT_TYPE,
    headers: WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_HEADERS,
    checks,
    reasonCodes,
    reasons,
    browserInteractionAuthorized: false,
    transactionBuildAuthorized: false,
    implementationAuthorized: false,
    simulationAuthorized: false,
    walletRequestAuthorized: false,
    signingEligible: false,
    executionEligible: false,
    reusableAuthority: false,
    disclaimer:
      'This static HTML document is a framework-neutral read-only review artifact. It contains no scripts, controls, external resources, provider request, selector, ABI data, calldata, transaction request, wallet state, signature, nonce, gas field, submission field, receipt, money movement, or execution authority.',
  }
}

export function digestWethAllowanceRevocationStaticReviewDocumentMetadata(
  metadata: WethAllowanceRevocationStaticReviewDocumentMetadata,
): Hex {
  return keccak256(stringToHex(canonicalJson(metadata)))
}

function renderStaticReviewHtml(renderedText: string): string {
  const escapedText = escapeHtml(renderedText)
  const escapedCsp = escapeHtmlAttribute(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP)

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="${escapedCsp}">`,
    '<meta name="referrer" content="no-referrer">',
    '<title>Offline WETH Allowance Revocation Review</title>',
    '</head>',
    '<body>',
    '<header>',
    '<h1>Offline WETH Allowance Revocation Review</h1>',
    '<p>Static read-only evidence. No controls, network access, wallet access, signing, or execution.</p>',
    '</header>',
    '<main>',
    '<section>',
    '<h2>Validated final review</h2>',
    `<pre>${escapedText}</pre>`,
    '</section>',
    '<section>',
    '<h2>Document boundary</h2>',
    '<ul>',
    '<li>No scripts, forms, links, buttons, inputs, media, frames, or external resources.</li>',
    '<li>No transaction construction, wallet request, signing, submission, or money movement.</li>',
    '<li>This document is non-reusable review evidence and expires with the underlying intent.</li>',
    '</ul>',
    '</section>',
    '</main>',
    '<footer>',
    '<p>Generated deterministically from a validated offline final-review summary.</p>',
    '</footer>',
    '</body>',
    '</html>',
  ].join('\n')
}

export function escapeWethAllowanceRevocationStaticReviewText(value: unknown): string | null {
  return typeof value === 'string' ? escapeHtml(value) : null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value)
}

function hasRequiredMetadata(html: string): boolean {
  return (
    html.startsWith('<!doctype html>\n<html lang="en">\n<head>') &&
    html.includes('<meta charset="utf-8">') &&
    html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">') &&
    html.includes('<meta http-equiv="Content-Security-Policy"') &&
    html.includes(escapeHtmlAttribute(WETH_ALLOWANCE_REVOCATION_STATIC_REVIEW_CSP)) &&
    html.includes('<meta name="referrer" content="no-referrer">')
  )
}

function containsProhibitedElement(html: string): boolean {
  return PROHIBITED_ELEMENTS.some((element) => new RegExp(`<\\s*${element}(?:\\s|>)`, 'i').test(html))
}

function containsProhibitedAttribute(html: string): boolean {
  return (
    /\son[a-z0-9_-]+\s*=/i.test(html) ||
    /\s(?:href|src|srcset|action|formaction|poster|cite|background|ping|srcdoc|style|contenteditable|tabindex|autofocus|popover|popovertarget|download|draggable|target|usemap)\s*=/i.test(
      html,
    )
  )
}

function containsProhibitedScheme(html: string): boolean {
  const normalized = html.toLowerCase()
  return PROHIBITED_SCHEMES.some((scheme) => normalized.includes(scheme))
}

function documentCheck(
  code: string,
  passes: boolean,
  passMessage: string,
  failMessage: string,
): WethAllowanceRevocationStaticReviewDocumentCheck {
  return {
    code,
    status: passes ? 'pass' : 'fail',
    message: passes ? passMessage : failMessage,
  }
}
