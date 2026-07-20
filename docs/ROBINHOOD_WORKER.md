# Robinhood Uniswap v3 worker runbook

This runbook covers the current read-only Robinhood Chain workflow. The worker indexes and analyzes canonical WETH/USDG Uniswap v3 pools. It does not create approvals, sign transactions, move funds, or infer an advertised APR.

## Prerequisites

- Node.js 22 or newer
- npm 10
- A writable local path for the SQLite database
- An optional Robinhood Chain RPC URL in `ROBINHOOD_RPC_URL`

The public Robinhood RPC is used when `ROBINHOOD_RPC_URL` is not set. A configured archive-capable provider is preferable for large historical scans.

Install and build from the repository root:

```bash
npm ci
npm run build
```

Run worker commands with the workspace selector:

```bash
npm run --workspace @lp-mine/worker <command>
```

The default database path is `./data/robinhood-univ3.sqlite`. Override it consistently for every command:

```bash
export LP_MINE_DATABASE_PATH=./data/robinhood-univ3.sqlite
```

## Canonical pools and range alignment

Only the registered WETH/USDG pools are accepted by the position-report workflow.

| Fee tier | Fee | Tick spacing |
| ---: | ---: | ---: |
| 100 | 0.01% | 1 |
| 500 | 0.05% | 10 |
| 3000 | 0.30% | 60 |
| 10000 | 1.00% | 200 |

Both position bounds must be exact multiples of the selected tick spacing, and the lower tick must be less than the upper tick. Stored observations fail closed when chain ID, pool address, fee tier, spacing, token order, token addresses, or immutable decimals do not match the canonical registry.

## Data collection workflow

### Capture current pool observations

This reads each canonical pool from the configured RPC, verifies it against the official factory, and stores a timestamped snapshot.

```bash
npm run --workspace @lp-mine/worker pools:observe
```

Run this repeatedly at a stable cadence to build observation history. `pools:history` uses the configured expected interval to assess coverage; it does not schedule observations itself.

### Index factory pool events

`pools:scan` requires a verified historical start block:

```bash
export LP_MINE_START_BLOCK=<verified-factory-bootstrap-block>
npm run --workspace @lp-mine/worker pools:scan
```

Optional controls:

- `LP_MINE_CONFIRMATION_DEPTH`, default `12`
- `LP_MINE_MAX_BLOCK_SPAN`, default `2000`

Do not guess the start block. The repository does not currently pin a verified factory deployment/bootstrap block.

### Index swaps

`swaps:scan` also requires a verified start block:

```bash
export LP_MINE_SWAP_START_BLOCK=<verified-swap-bootstrap-block>
npm run --workspace @lp-mine/worker swaps:scan
```

Optional controls:

- `LP_MINE_SWAP_CONFIRMATION_DEPTH`, default `12`
- `LP_MINE_SWAP_MAX_BLOCK_SPAN`, default `2000`

The indexer is confirmation-aware and rewinds stored rows when required by its checkpoint logic.

### Inspect data quality

Pool observation coverage:

```bash
npm run --workspace @lp-mine/worker pools:history
```

Optional controls:

- `LP_MINE_EXPECTED_INTERVAL_SECONDS`, default `300`
- `LP_MINE_MINIMUM_COVERAGE_BPS`, default `8000`
- `LP_MINE_HISTORY_LIMIT`, default `10000`

Swap evidence coverage:

```bash
npm run --workspace @lp-mine/worker swaps:evidence
```

Optional controls:

- `LP_MINE_SWAP_WINDOW_SECONDS`, default `86400`
- `LP_MINE_SWAP_EVIDENCE_LIMIT`, default `10000`, maximum `10000`

## Position report inputs

All three position commands use the same required configuration:

```bash
export LP_MINE_POSITION_FEE_TIER=500
export LP_MINE_POSITION_TICK_LOWER=-100
export LP_MINE_POSITION_TICK_UPPER=100
export LP_MINE_POSITION_LIQUIDITY=123456789
```

`LP_MINE_POSITION_LIQUIDITY` is raw Uniswap v3 liquidity, not a token amount or fiat value. Token and fee amounts in JSON output are integer base units. The current worker does not apply display-decimal formatting.

The report window and swap-row cap are shared with swap evidence:

```bash
export LP_MINE_SWAP_WINDOW_SECONDS=86400
export LP_MINE_SWAP_EVIDENCE_LIMIT=10000
```

## Position commands

### Fee-share estimate

```bash
npm run --workspace @lp-mine/worker position:fee-share
```

This estimates lower, endpoint, and upper fee-share scenarios from stored swaps and active-liquidity evidence. These are estimates, not realized fees. Endpoint share is an approximation based on observed swap endpoints and should not be interpreted as exact intra-swap liquidity participation.

### LP-versus-HODL performance

```bash
npm run --workspace @lp-mine/worker position:performance
```

This combines entry and exit observations with estimated fee scenarios, inventory math, LP-versus-HODL accounting, and optional externally supplied realized fees and costs.

### Historical replay

```bash
npm run --workspace @lp-mine/worker position:history
```

This builds a discrete replay from stored observations and a one-pass, block-bounded fee timeline. It does not reconstruct the exact intra-observation price path.

## Realized-fee and cost evidence

Estimated fees remain separate from realized fees. Supply both realized-fee token amounts together:

```bash
export LP_MINE_POSITION_REALIZED_FEES0=1000
export LP_MINE_POSITION_REALIZED_FEES1=2500
```

Optional categorized costs are also token base units:

```bash
export LP_MINE_POSITION_GAS_COST0=0
export LP_MINE_POSITION_GAS_COST1=40
export LP_MINE_POSITION_SLIPPAGE_COST0=5
export LP_MINE_POSITION_SLIPPAGE_COST1=0
export LP_MINE_POSITION_REBALANCE_COST0=0
export LP_MINE_POSITION_REBALANCE_COST1=10
export LP_MINE_POSITION_OTHER_COST0=0
export LP_MINE_POSITION_OTHER_COST1=0
```

Nonzero external evidence is considered complete only when it has a source and observation timestamp:

```bash
export LP_MINE_POSITION_EVIDENCE_SOURCE=wallet-reconciliation
export LP_MINE_POSITION_EVIDENCE_OBSERVED_AT=2026-07-20T10:30:00.000Z
export LP_MINE_POSITION_EVIDENCE_REFERENCE=batch-42
```

Rules:

- `LP_MINE_POSITION_EVIDENCE_SOURCE` and `LP_MINE_POSITION_EVIDENCE_OBSERVED_AT` are required together.
- `LP_MINE_POSITION_EVIDENCE_REFERENCE` is optional, but cannot be empty when supplied.
- One shared provenance envelope is attached to realized fees and every nonzero categorized cost supplied in that run.
- Amount-only evidence is still calculated, but the report is marked partial and emits warnings.
- Provenance records where the input came from; it does not independently verify that the external source is correct.

## Report status and interpretation

Every report is read-only and returns one of these statuses:

- `complete`: required stored evidence and any supplied external evidence passed the report's checks without warnings.
- `partial`: the calculation ran, but evidence was missing, stale, truncated, approximate, or lacked provenance.
- `insufficient`: the report could not support the requested analysis, commonly because observations or swaps were unavailable or not aligned.

Warnings are part of the result contract and should be reviewed before using any numeric output. A complete report is not a profitability guarantee.

Cost-adjusted accounting values costs at the report's exit price so token-denominated costs can be compared with LP and HODL exit values. This is an accounting convention, not proof that the costs were executed at that price.

## Safety and limitations

- No command signs transactions or requires a wallet key.
- Never place seed phrases or private keys in environment variables, repository files, or GitHub Actions secrets for this read-only workflow.
- Reports do not infer APR.
- Estimated fee scenarios are not realized fees.
- Gas, slippage, rebalance costs, incentives, taxes, and execution quality are absent unless explicitly represented by the relevant report inputs.
- Historical replay is discrete and can miss intra-observation paths.
- Swap evidence is capped by the configured row limit and reports truncation.
- Observation and swap timestamps depend on indexed block evidence and may be incomplete for previously collected rows.
- The verified historical deployment/bootstrap block remains unresolved; historical scans should not be started from an invented block.

Nothing produced by these commands is financial advice. The software is experimental and may contain errors.