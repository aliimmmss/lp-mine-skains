# Next-session plan — path to first LP deposit

Continuation plan for the LP Mine project. Read this top to bottom before writing any code. State assessed 2026-07-23.

## Progress log

Deposit-readiness milestone COMPLETE (2026-07-23). All analysis and delivery tooling is built and green (226 tests). Remaining work is post-deposit and user-action-gated.

- **Done (`3777f91`):** Task 1.1/1.2 — `computeFeeYield` + `pools:fees`. Ranks the four fee tiers by combined daily fees per unit liquidity from `feeGrowthGlobal` deltas. Verified against live chain data.
- **Done (`2c85473`):** Task 2 — `docs/DEPOSIT_RUNBOOK.md`.
- **Done (`1e4a7f9`):** Task 1.3 — `computeTickOccupancy` + occupancy in `pools:fees` (range-width signal: fraction of observed ticks within ±1/2/5/10% bands). Differentiates as cloud tick history accumulates.
- **Done (`6db21e2`):** Task 1.4 — `fees:notify:telegram` command + daily `Telegram fee digest` workflow (read-only consumer of the monitor cache; daily cron avoids repeated-message spam).
- **Remaining — Task 3 (post-deposit, user-gated):** activates only after the user opens a position. The manual `position:fee-share` / `position:performance` / `position:history` commands already accept `LP_MINE_POSITION_*` params and work today. The small follow-up (whenever a real position exists): a daily position-summary Telegram job + an out-of-range alert, wired with the saved tick range / liquidity / NFT id from the mint (the runbook tells the user to record these).

## Where the project stands

| Area | State |
| --- | --- |
| Build/tests | Green: `npm ci && npm run build && npm test` → 211/211, lint clean |
| Cloud pipeline | GitHub Actions `monitor-telegram.yml` runs on cron (drifts to ~2–3h), captures pool observations **with feeGrowthGlobal0/1X128** since commit `18c1da8`, delivers deduplicated Telegram alerts (cooldown fix `160ca83`) |
| Secrets | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ROBINHOOD_RPC_URL` (Alchemy) set as GitHub Actions secrets. Locally the Alchemy URL is in `.rpc-url` (gitignored) |
| Evidence | Factory deploy block 8930 + pool creation blocks pinned in `docs/ROBINHOOD_REGISTRY_EVIDENCE.md`; registry triple-verified (bytecode, factory results, official Uniswap deployment docs) |
| Deposit path | **Decided: official Uniswap Web App** (app.uniswap.org supports Robinhood Chain LP natively). Do NOT build M4 execution code |

## Decisions already made — do not relitigate

1. **No full swap indexing.** The pools do ~430k swaps/day (92% in the 0.01% pool); the repo's swap-evidence reports cap at 10k rows. Fee measurement uses **feeGrowthGlobal deltas** from observations instead (exact, cadence-independent). `swaps:backfill` exists for bounded windows if ever needed.
2. **No custom execution/M4 build.** User signs in their own wallet on the official Uniswap interface. Never handle keys, never build calldata, never submit transactions.
3. **RPC constraints (verified):** public Robinhood RPC = 10k-log cap, weak log index, harsh rate limits. Alchemy free tier = 10-block `eth_getLogs` range cap. Design around observation reads, not log scans.
4. **Cloud state** lives in the Actions cache (`data/robinhood-univ3.sqlite` restored/saved per run). Suspected but unproven: silent cache misses. If Telegram alerts still repeat identically after 2026-07-24, check the "Restore monitoring state" step for `Cache not found` and if broken, replace cache with an artifact-based or committed-state strategy.

## Task 1 — Fee-yield report (the remaining build before deposit)

Goal: a worker command `pools:fees` that turns accumulated observations into the numbers a deposit decision needs.

Implementation sketch (TDD, follow repo idioms — deterministic, fail-closed, no APR hype):

1. New module in `packages/core` (pure math, unit-testable):
   - Input: two observations of one pool (earlier/later) each with `feeGrowthGlobal0X128`, `feeGrowthGlobal1X128`, `activeLiquidity`, `sqrtPriceX96`, `observedAt`.
   - `Δfg0 = (fg0_b − fg0_a) / 2^128` → token0 fees per unit liquidity over the interval (bigint math; keep Q128 until final division; guard against negative deltas → fail closed, accumulators are monotonic).
   - Same for token1. Convert token0 amount to token1 terms via price `(sqrtPriceX96/2^96)^2` to get a combined per-liquidity fee rate; scale to per-day.
   - For a hypothetical position: given a tick range and a notional, compute Uniswap v3 liquidity L for that range at current price (the repo may already have range math in `packages/core` — check `pool-analysis.ts` and reuse), then `dailyFees ≈ L × perLiquidityDailyRate` **valid only while price is in range** — label as estimate.
2. Worker command `apps/worker/src/pools-fees.ts` (mirror `pools-history.ts` structure): reads observation pairs per canonical pool over `LP_MINE_FEE_WINDOW_SECONDS` (default 86400), emits JSON per pool: window, samples used, per-liquidity daily fee rate (token0/token1/combined-in-token1), current activeLiquidity, tick, data-quality status (`complete`/`partial`/`insufficient` per repo convention — insufficient when <2 samples with fee growth or gap too small).
3. Time-in-range: from the stored tick series, report % of observations inside candidate ranges (e.g., ±1%, ±2%, ±5% around current price, aligned to tick spacing). Sparse cadence → report sample count honestly.
4. Optional: append a compact fee summary to the Telegram message in `monitor-telegram-notify.ts` (keep alerts and summaries clearly separated).

Acceptance: run `pools:fees` against the cloud-collected DB (download the Actions cache DB or run observations locally twice a few hours apart) and get non-`insufficient` output for the 100 and 500 tier pools.

## Task 2 — Deposit runbook for the user

Write `docs/DEPOSIT_RUNBOOK.md`: wallet setup (any EVM wallet; add Robinhood Chain, chainId 4663), bridging funds to Robinhood Chain, opening app.uniswap.org → Robinhood Chain → WETH/USDG pool at the fee tier the report supports, range entry, and cross-checking the pool address against `docs/ROBINHOOD_REGISTRY_EVIDENCE.md` before confirming. Include the repo's principle: start tiny (burner-wallet scale), manual confirmation only. No amount recommendations — that is the user's decision alone.

## Task 3 — Post-deposit monitoring

After the user opens a position: capture position parameters (tick range, liquidity from the mint receipt they paste), wire `position:fee-share` / `position:performance` with those params, and consider a daily Telegram summary (in-range status, fee estimate vs HODL). Alert if price exits the range (`monitor-health` extension).

## Boundaries (unchanged, non-negotiable)

- Never request, store, or handle private keys/seed phrases; never build or submit transactions; never bypass the repo's execution gates.
- No personalized financial advice; no deposit-amount recommendations; label all outputs as estimates, not APR promises.
- All new evidence: two independent checks where feasible, fail closed on mismatch.

## Verification commands

```bash
npm ci && npm run build && npm test && npm run lint
npm run --workspace @lp-mine/robinhood-univ3 smoke:live       # registry vs live chain
npm run --workspace @lp-mine/worker pools:observe             # one observation (needs ROBINHOOD_RPC_URL or public)
```

Local DB: `apps/worker/data/robinhood-univ3.sqlite` (worker cwd-relative). Cloud DB: Actions cache, key prefix `monitor-db-`.
