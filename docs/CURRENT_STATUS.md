# Current project status

This document records the current reviewed project boundary after completion of M3 and the current non-executing M4 evidence work.

## Operational

- Robinhood Uniswap v3 read-only data collection and verification
- deterministic LP strategy analysis and LP-versus-HODL accounting
- read-only dashboard snapshots and alert lifecycle
- Telegram delivery with persisted-state deduplication
- hourly read-only production monitoring

## M4 reviewed non-execution capabilities

- guarded manual execution design and threat model
- pinned Robinhood chain and contract registry
- WETH proxy, implementation, ProxyAdmin, controller, timelock, and Safe authority evidence
- read-only two-provider WETH allowance-revocation paper evaluator
- deterministic simulation-evidence policy and negative fixtures
- offline-only sanitized simulation-evidence ingestion, deterministic normalization, and fail-closed policy review
- deterministic offline operator-review reports with policy-integrity replay, safe evidence summaries, and immutable report digests
- offline review-record lifecycle evaluation with exact report/current-state validation and stable fail-closed invalidation reasons
- immutable offline typed WETH allowance-revocation review intents with deterministic IDs, full build-commit binding, exact evidence references, and fixed 300-second expiry
- deterministic offline deliberate-confirmation records with exact-key parsing, intent-ID recomputation, exact phrase and identity matching, strict timing checks, explicit acknowledgements, and non-reusable authority
- offline deliberate-confirmation lifecycle evaluation with strict confirmation-result validation, confirmation replay, current typed-intent reproduction, deterministic lifecycle digests, and fail-closed invalidation on expiry or report, state, identity, allowance, registry, authority, provider, freshness, incident, build, or generation drift

## Explicitly not implemented or authorized

- browser-wallet connection or wallet request
- ABI encoding or selector-byte generation
- complete calldata or transaction-request creation
- network calls to a state-changing simulation provider
- approval or signature prompts
- transaction submission or retries
- receipt reconciliation
- live or tiny-live execution
- automated capital deployment

Every later M4 capability requires a separately reviewed issue and pull request. All current policy, ingestion, review-report, review lifecycle, typed-intent, deliberate-confirmation, confirmation-lifecycle, and evidence outputs remain transaction-build-unauthorized, implementation-unauthorized, simulation-unauthorized, wallet-request-unauthorized, signing-ineligible, execution-ineligible, and non-reusable as authority.
