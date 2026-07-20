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
- **Verified contracts only.** Contract addresses and bytecode hashes are pinned per chain.
- **Uniswap v3 before v4.** v4 pools are rejected unless the hook is zero-address or explicitly allowlisted and reviewed.
- **No headline-APR chasing.** Rankings use multi-period fee persistence and active liquidity.

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

### M5 — Limited automation

Automation is considered only after a statistically meaningful paper and tiny-live sample. Every strategy must have capital, loss, turnover, asset, and protocol limits.

## Proposed repository layout

```text
apps/
  web/                 dashboard and browser-wallet execution
  worker/              indexers, scheduled snapshots, alerts
packages/
  core/                shared types and deterministic calculations
  robinhood-univ3/     Uniswap v3 adapter
  meteora-dlmm/        Meteora adapter
  strategy/            screening, simulation, and portfolio rules
  accounting/          realized PnL and LP-vs-HODL
  security/            contract registry, hook policy, transaction gates
docs/
  ARCHITECTURE.md
  SECURITY.md
  METRICS.md
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

**Planning and foundation. No live execution code yet.**

This software will be experimental and may result in total loss of funds. Nothing in this repository is financial advice.
