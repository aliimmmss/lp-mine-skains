# LP Mine

A research-first, non-custodial toolkit for finding, simulating, monitoring, and eventually executing liquidity-provider strategies across concentrated-liquidity AMMs.

The project starts with **Uniswap v3 on Robinhood Chain** and **Meteora DLMM on Solana**. Live execution is deliberately postponed until the data, accounting, simulations, and safety controls are trustworthy.

## Mission

Build an LP decision system that answers four questions before capital is deployed:

1. Is the volume organic and persistent?
2. Will expected fees compensate for divergence loss, adverse selection, slippage, and operational costs?
3. What range and position type match the current market regime?
4. Did the strategy outperform simply holding the original assets?

## Non-negotiable principles

- **Paper mode first.** No autonomous transactions in the initial milestones.
- **Non-custodial by default.** Browser-wallet signing; never store seed phrases or private keys.
- **Deterministic risk controls.** AI may explain and rank, but cannot bypass hard limits.
- **Real accounting.** Report realized PnL, unrealized inventory, fees, gas, and LP-vs-HODL separately.
- **Verified contracts only.** Contract addresses and immutable pool metadata are pinned per chain.
- **Uniswap v3 before v4.** v4 pools are rejected unless the hook is zero-address or explicitly allowlisted and reviewed.
- **No headline-APR chasing.** Rankings use evidence quality, fee persistence, and active liquidity.

## Current Robinhood workflow

The repository now includes a read-only Robinhood Chain data, analysis, monitoring, and paper-review pipeline:

- Canonical WETH/USDG Uniswap v3 pool registry and live verification
- SQLite-backed pool observations and swap evidence
- Reorg-aware event indexing and timestamp coverage checks
- Range-aware lower, endpoint, and upper fee-share estimates
- LP-versus-HODL accounting, historical replay, drawdown, and time-in-range
- Optional realized-fee and categorized-cost inputs with source/timestamp provenance
- Fail-closed tick-spacing and immutable pool-metadata validation
- Deterministic health and dashboard snapshots with explicit missing, stale, partial, and unavailable states
- Persisted alert lifecycle, deduplication, Telegram delivery, and hourly read-only production monitoring
- Read-only WETH allowance-revocation paper evaluation with two-provider evidence and immutable report digests
- Inert simulation-evidence policy validation with execution, simulation, and implementation authorization disabled
- Offline-only sanitized simulation-evidence ingestion with strict schema checks, deterministic normalization, and fail-closed policy review
- Deterministic offline operator-review reports with policy-integrity replay, safe evidence summaries, and immutable report digests
- Offline review-record lifecycle evaluation with fail-closed invalidation on identity, block, allowance, registry, authority, provider, freshness, or incident-state drift
- Immutable offline typed review intents with deterministic IDs, exact evidence binding, full build-commit references, and fixed 300-second expiry
- Deterministic offline deliberate-confirmation records with exact phrase, identity, timing, and acknowledgement checks; all wallet, signing, execution, and reusable-authority flags remain disabled
- Offline deliberate-confirmation lifecycle evaluation with confirmation replay, current-intent reproduction, deterministic lifecycle digests, and fail-closed invalidation on expiry or reviewed-state drift

Start with the [Robinhood worker runbook](docs/ROBINHOOD_WORKER.md) for setup, commands, environment variables, evidence rules, report statuses, and current limitations.

```bash
npm ci
npm run build
npm run --workspace @lp-mine/worker pools:observe
```

The worker commands are read-only. They do not sign transactions or require wallet keys.

## Initial scope

### Robinhood Chain

- Discover official Uniswap v3 pools.
- Index pool state, volume, liquidity, fees, ticks, and token metadata.
- Simulate symmetric and one-sided positions.
- Track range occupancy and projected fee share.
- Compare LP performance against holding.

### Meteora

- Discover DLMM pools using the official SDK and public APIs.
- Support Spot, Curve, Bid/Ask, and one-sided position simulations.
- Measure fee/TVL persistence, active-bin occupancy, and token risk.
- Reconcile results with independent wallet transaction data.

## Milestones

### M0 — Foundation

- Architecture and threat model
- Chain and contract registry
- Data schemas
- CI, linting, type checking, and tests

### M1 — Read-only data engine

- Robinhood Uniswap v3 indexer
- Meteora DLMM pool adapter
- Normalized pool snapshots
- Historical storage

### M2 — Strategy and simulation

- Range math
- Fee-share estimator
- Divergence-loss and LP-vs-HODL model
- One-sided range-order simulator
- Paper portfolio and replay engine

### M3 — Dashboard and alerts

- Pool screener
- Position monitor
- Risk flags
- Telegram or email notifications with no signing authority

### M4 — Guarded manual execution

- Browser-wallet transaction builder
- Exact approvals
- Contract allowlists
- Preflight simulation
- Receipt-based accounting

The [guarded manual execution design gate](docs/M4_GUARDED_EXECUTION_DESIGN.md), authority evidence, paper-mode evaluator, inert simulation-evidence policy, offline sanitized evidence ingestion, deterministic operator-review reporting, offline review-record invalidation lifecycle, immutable typed review-intent boundary, offline deliberate-confirmation record, and offline confirmation lifecycle invalidation are complete. M4 remains execution-disabled: no wallet connection or request, calldata generation, provider network simulation call, signature request, transaction submission, or receipt reconciliation is authorized or implemented. Confirmation records and lifecycle outputs are non-reusable review evidence only. Each later capability requires a separately reviewed issue and pull request.

### M5 — Limited automation

Automation is considered only after a statistically meaningful paper and tiny-live sample. Every strategy must have capital, loss, turnover, asset, and protocol limits.

## Repository layout

```text
apps/
  web/                 dashboard and browser-wallet execution
  worker/              indexers, observations, evidence reports, position replay
packages/
  core/                shared types and deterministic calculations
  robinhood-univ3/     Uniswap v3 adapter, registry, storage, integrity checks
  meteora-dlmm/        Meteora adapter
  strategy/            screening, simulation, and portfolio rules
  accounting/          realized PnL and LP-vs-HODL
  security/            contract registry, hook policy, transaction gates
docs/
  ARCHITECTURE.md
  CURRENT_STATUS.md
  SECURITY.md
  METRICS.md
  ROBINHOOD_WORKER.md
  M4_GUARDED_EXECUTION_DESIGN.md
```

## First strategy target

The first deployable strategy will be intentionally boring:

- Established token pairs only
- Uniswap v3 or Meteora DLMM
- Wide or one-sided ranges
- Manual confirmation
- No unknown v4 hooks
- No memecoin autonomous entry
- Small burner wallet for any eventual live test

## Success criteria

The project is not successful because it displays a high APR. It is successful when it can reproducibly show:

- Fee income net of gas and execution costs
- Time in range
- Realized and unrealized token exposure
- LP return versus passive holding
- Drawdown and worst-case exit value
- The exact reason a pool was selected, rejected, opened, or closed

## Status

See [Current project status](docs/CURRENT_STATUS.md) for the explicit implemented and non-authorized capability boundary.

**M0, the Robinhood portion of M1, M2 analysis, and M3 read-only monitoring are operational. M4 readiness, authority evidence, paper mode, simulation-policy design, offline sanitized evidence ingestion, operator-review reporting, review-record invalidation, immutable typed review intents, deliberate offline confirmation records, and confirmation lifecycle invalidation are complete, but all execution capabilities remain disabled. No live execution code exists.**

The historical factory deployment/bootstrap block is not yet pinned, so historical scans must use a separately verified start block rather than a guessed value.

This software is experimental and may result in total loss of funds. Nothing in this repository is financial advice.
