# Architecture

## Objective

LP Mine separates market research, simulation, accounting, and transaction execution so that a failure in one layer cannot silently become a money-moving action.

## System layers

### 1. Protocol adapters

Each adapter converts protocol-specific data into normalized domain objects.

Initial adapters:

- `robinhood-univ3`
- `meteora-dlmm`

An adapter may read chain state and construct unsigned transaction intents. It must not hold keys or autonomously broadcast transactions.

### 2. Data worker

The worker collects immutable snapshots:

- pool identifiers and verified contract metadata
- token metadata
- price and tick/bin state
- total and active liquidity
- volume and fees over multiple windows
- range occupancy
- holder and token-risk signals where available

Raw observations are stored separately from derived metrics so calculations can be reproduced.

### 3. Deterministic analytics

The analytics packages calculate:

- proposed position token amounts
- active-liquidity share
- projected fee income
- time-in-range estimates
- divergence loss
- gas and turnover costs
- LP-versus-HODL return
- drawdown and conservative liquidation value

No LLM output may be used as a numeric source of truth.

### 4. Strategy engine

The strategy engine consumes normalized observations and deterministic metrics. It returns one of:

- `REJECT`
- `WATCH`
- `PAPER_OPEN`
- `MANUAL_OPEN_PROPOSAL`
- `HOLD`
- `REBALANCE_PROPOSAL`
- `CLOSE_PROPOSAL`

Every result includes machine-readable reasons and failed or passed gates.

### 5. Paper portfolio

The paper engine replays strategies against historical observations and maintains synthetic positions with realistic:

- entry and exit slippage
- gas costs
- position inventory
- fees
- range transitions
- rebalances

Paper results must be reproducible from stored inputs.

### 6. Web application

The web application provides:

- pool rankings
- strategy simulation
- position and paper-portfolio monitoring
- accounting views
- unsigned transaction previews

Any eventual live transaction is signed in the browser wallet.

### 7. Execution boundary

Execution is a separate package with strict responsibilities:

1. Resolve a verified contract from the chain registry.
2. Re-read current chain state.
3. Construct an unsigned intent.
4. Simulate the complete call.
5. Validate spender, recipient, amount, deadline, minimum output, pool, fee tier, and hook policy.
6. Present decoded actions to the user.
7. Request browser-wallet signature.
8. Reconcile using transaction receipts and actual balance deltas.

## Suggested technology

- TypeScript monorepo
- pnpm workspaces
- Node.js workers
- React/Vite web application
- viem for EVM reads and transaction construction
- official Meteora SDK for Solana
- SQLite for local development, PostgreSQL for hosted deployment
- Vitest for unit and property tests
- GitHub Actions for type checks, linting, tests, and dependency review

## Data model

Core entities:

- `Chain`
- `Protocol`
- `ContractRegistryEntry`
- `Token`
- `Pool`
- `PoolSnapshot`
- `ProposedRange`
- `StrategyDecision`
- `PaperPosition`
- `LivePositionObservation`
- `LedgerEvent`
- `RiskFlag`

All monetary values are stored in integer base units plus token decimals. Floating-point values may be used for presentation only.

## First vertical slice

The first end-to-end slice should do only this:

1. Fetch verified Uniswap v3 pools on Robinhood Chain.
2. Store current pool state and 7-day/30-day market metrics.
3. Simulate a symmetric or one-sided range.
4. Estimate active share and fee income.
5. Compare the simulated result with holding.
6. Save a paper decision and show it in a simple dashboard.

No wallet connection is required for this milestone.
