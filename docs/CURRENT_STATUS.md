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

## Explicitly not implemented or authorized

- browser-wallet connection
- ABI encoding or selector-byte generation
- complete calldata or transaction-request creation
- network calls to a state-changing simulation provider
- approval or signature prompts
- transaction submission or retries
- receipt reconciliation
- live or tiny-live execution
- automated capital deployment

Every later M4 capability requires a separately reviewed issue and pull request. All current policy, ingestion, and evidence outputs remain implementation-unauthorized, simulation-unauthorized, and execution-ineligible.
