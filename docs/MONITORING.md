# Read-only monitoring snapshot

The M3 monitoring layer converts stored Robinhood Chain pool evidence into a dashboard-ready health snapshot. It remains read-only: it does not sign transactions, move funds, estimate APR, or recommend deploying capital.

## Run the health snapshot

Build the repository, point the worker at the same SQLite database used by observation collection, and run:

```bash
npm ci
npm run build
export LP_MINE_DATABASE_PATH=./data/robinhood-univ3.sqlite
npm run --workspace @lp-mine/worker monitor:health
```

The command reads the canonical WETH/USDG pool histories and writes JSON to standard output. It does not modify the database.

Consumers should treat each command result as an immutable snapshot and reconcile alerts by `alertKey` rather than by message text.

## Persist alert lifecycle state

Run reconciliation after producing fresh observations:

```bash
npm run --workspace @lp-mine/worker monitor:reconcile
```

This command computes the same health snapshot and writes alert lifecycle rows into the SQLite database identified by `LP_MINE_DATABASE_PATH`. It stores local monitoring metadata only:

- `firstSeenAt`: when the condition was first recorded.
- `lastSeenAt`: the newest reconciliation where the condition remained present.
- `resolvedAt`: when the condition disappeared from the health snapshot.
- `acknowledgedAt`: reserved for an operator acknowledgement while the condition is active.
- `status`: `active` or `resolved`.

Repeated sightings update one row rather than creating duplicates. A resolved condition can reopen under the same `alertKey`; reopening clears the prior acknowledgement so the new occurrence is not silently suppressed.

The command returns all stored lifecycle rows plus active and resolved counts, making the result directly consumable by a future dashboard.

Reconciliation does not deliver Telegram or email notifications. It does not change chain state, position state, or wallet state.

## Thresholds

The health command reuses the pool-history settings:

- `LP_MINE_EXPECTED_INTERVAL_SECONDS`, default `300`
- `LP_MINE_MINIMUM_COVERAGE_BPS`, default `8000`
- `LP_MINE_HISTORY_LIMIT`, default `10000`

It also accepts:

- `LP_MINE_MAXIMUM_OBSERVATION_AGE_SECONDS`, default `900`

A threshold is an explicit monitoring rule, not a profitability assumption.

## Status meanings

- `healthy`: no warning or critical alerts were generated.
- `degraded`: at least one warning alert was generated and no critical alert exists.
- `critical`: at least one critical alert was generated.

Missing canonical pools, persistent zero liquidity, and insufficient observation history are critical. Stale observations, coverage gaps, incomplete history, and source warnings are degraded unless another critical condition is present.

## Dashboard summary

The report includes a precomputed `summary` object:

- `poolCounts`: total, healthy, degraded, and critical pool counts.
- `alertCounts`: total alerts, counts by severity, and counts by alert code.
- `oldestObservationAgeSeconds`: the greatest age among pools with stored observations, or `null` when none have observations.

The `source` object records the SQLite database path and the generation timestamp of the underlying pool-history report. Raw per-pool evidence remains available in `pools`.

## Alert identities

Every alert includes an `alertKey`. The key is deterministic for the underlying condition and is intended for dashboard reconciliation and notification deduplication.

For example, a stale-observation alert keeps the same key as its displayed age increases. A history-risk key includes the exact risk flag, while a source-warning key includes the warning text so distinct source warnings remain distinct.

Alert keys are identities, not evidence that a human has reviewed the condition. Persisted acknowledgements are local operator metadata and do not alter health severity.

## Alert codes

- `missing-pool`: no stored observations exist for a canonical pool.
- `stale-observation`: the newest observation exceeds the configured age threshold.
- `history-risk`: pool-history analysis emitted an explicit risk flag.
- `source-warning`: stored source evidence contains a warning.

## Safety boundary

The health snapshot and lifecycle state are descriptive monitoring outputs. They do not infer fees, APR, expected return, execution quality, or whether a position should be opened, changed, or closed. Notification delivery and any future dashboard UI must preserve this boundary and must not gain wallet-signing authority.
