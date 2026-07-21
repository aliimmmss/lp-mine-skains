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
- `occurrenceStartedAt`: when the current active occurrence began. This changes when a resolved condition reopens.
- `lastSeenAt`: the newest reconciliation where the condition remained present.
- `resolvedAt`: when the condition disappeared from the health snapshot.
- `acknowledgedAt`: when an operator first acknowledged the active condition.
- `status`: `active` or `resolved`.

Repeated sightings update one row rather than creating duplicates. A resolved condition can reopen under the same `alertKey`; reopening starts a new occurrence and clears the prior acknowledgement so the condition is not silently suppressed.

The command returns all stored lifecycle rows plus active and resolved counts.

Reconciliation does not deliver Telegram or email notifications. It does not change chain state, position state, or wallet state.

## Generate the local dashboard

Generate a self-contained HTML dashboard from the same health and lifecycle contracts:

```bash
npm run --workspace @lp-mine/worker monitor:dashboard
```

The default output is `./data/monitor-dashboard.html`. Set a different destination with:

```bash
export LP_MINE_DASHBOARD_PATH=./data/operator/monitor.html
npm run --workspace @lp-mine/worker monitor:dashboard
```

The command performs one alert reconciliation before rendering, so it updates only the local lifecycle metadata described above. It then writes a static HTML file and prints a compact JSON result containing the resolved dashboard path, health status, and lifecycle counts.

Open the generated file directly in a browser. It requires no web server, browser wallet, external stylesheet, JavaScript package, or network request. The page includes:

- overall health and summary counts
- all canonical WETH/USDG fee tiers
- latest observation time and age
- observation coverage and explicit risk flags
- active, resolved, acknowledged, and unacknowledged lifecycle state
- source database path, threshold, generation timestamp, and safety disclaimer
- an escaped JSON snapshot embedded for local inspection

Missing observations render as unavailable rather than as zero. Stale, partial, warning, critical, and resolved conditions remain visibly distinct. The dashboard does not deliver notifications or write acknowledgements itself.

## Acknowledge an active alert

Copy the exact deterministic `alertKey` from `monitor:reconcile`, the generated dashboard, or another snapshot consumer, then run:

```bash
npm run --workspace @lp-mine/worker monitor:acknowledge -- \
  'stale-observation:0x69bfaf19c9f377bb306a89aed9f6b07e2c1a8d9a:500'
```

Quote the key because source-warning identities can contain spaces or punctuation. The command reads only `LP_MINE_DATABASE_PATH`; unrelated monitoring-threshold settings do not affect it.

The JSON result reports one of four statuses:

- `acknowledged`: the active, previously unacknowledged row received its first acknowledgement timestamp.
- `already-acknowledged`: the row was already acknowledged; the original timestamp is preserved.
- `not-active`: the key exists but the condition is resolved.
- `not-found`: no lifecycle row exists for that key.

Acknowledgement is idempotent and applies only to active alerts. It does not change the alert severity, health status, message, first-seen time, or last-seen time. If an acknowledged condition resolves and later reopens, reconciliation clears the stale acknowledgement and the new occurrence must be acknowledged again.

Regenerate the dashboard after acknowledgement to render the updated local lifecycle state.

## Deliver Telegram notifications

The Telegram command reconciles the latest health report, selects active and unacknowledged occurrences that have not already been delivered, sends plain-text alert batches, and records successful delivery locally:

```bash
export LP_MINE_TELEGRAM_BOT_TOKEN=<bot-token>
export LP_MINE_TELEGRAM_CHAT_ID=<chat-id>
npm run --workspace @lp-mine/worker monitor:notify:telegram
```

An optional forum-topic destination can be configured with:

```bash
export LP_MINE_TELEGRAM_MESSAGE_THREAD_ID=<positive-integer-topic-id>
```

The command also accepts `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_MESSAGE_THREAD_ID` as aliases. Its JSON result never includes the bot token or chat ID.

Delivery rules:

- only active, unacknowledged occurrences are eligible
- each occurrence is delivered once per channel
- unchanged repeated reconciliations do not send duplicate messages
- acknowledged conditions are suppressed
- a resolved condition that later reopens becomes eligible as a new occurrence
- delivery is recorded only after Telegram confirms that a message was accepted
- failures do not gain wallet, signer, transaction, or capital-deployment authority

Long alert sets are split into Telegram-safe plain-text batches. Messages do not use Telegram markup, so stored evidence is rendered as text rather than interpreted as formatting.

## GitHub Actions monitor

The `Telegram monitor` workflow can be started manually and is also scheduled hourly at minute 17. Each run:

1. restores the most recent cached SQLite monitoring state
2. captures current observations for all canonical pools
3. reconciles health and sends only new Telegram alert occurrences
4. saves the updated SQLite monitoring and delivery state

The workflow reads:

- `TELEGRAM_BOT_TOKEN` from Actions secrets
- `TELEGRAM_CHAT_ID` from either Actions secrets or Actions variables
- optional `TELEGRAM_MESSAGE_THREAD_ID` from either Actions secrets or Actions variables
- optional `ROBINHOOD_RPC_URL` from Actions secrets; the worker retains its documented public-RPC fallback

The workflow uses an explicit one-hour observation interval and a 90-minute freshness threshold. GitHub schedules can be delayed, so the health report remains evidence-based and will visibly degrade when observations become stale rather than silently treating missing runs as healthy.

The first persisted run can emit insufficient-history alerts because the database has not accumulated enough observations yet. Those alerts are deduplicated after successful delivery and can resolve naturally as evidence accumulates.

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

The health report includes a precomputed `summary` object:

- `poolCounts`: total, healthy, degraded, and critical pool counts.
- `alertCounts`: total alerts, counts by severity, and counts by alert code.
- `oldestObservationAgeSeconds`: the greatest age among pools with stored observations, or `null` when none have observations.

The `source` object records the SQLite database path and the generation timestamp of the underlying pool-history report. Raw per-pool evidence remains available in `pools`.

## Alert identities

Every alert includes an `alertKey`. The key is deterministic for the underlying condition and is intended for dashboard reconciliation and notification deduplication.

For example, a stale-observation alert keeps the same key as its displayed age increases. A history-risk key includes the exact risk flag, while a source-warning key includes the warning text so distinct source warnings remain distinct.

Alert keys are identities, not evidence that a human has reviewed the condition. Persisted acknowledgements and notification delivery records are local operator metadata and do not alter health severity.

## Alert codes

- `missing-pool`: no stored observations exist for a canonical pool.
- `stale-observation`: the newest observation exceeds the configured age threshold.
- `history-risk`: pool-history analysis emitted an explicit risk flag.
- `source-warning`: stored source evidence contains a warning.

## Safety boundary

The health snapshot, lifecycle state, local dashboard, acknowledgement command, and Telegram delivery command are descriptive monitoring outputs. They do not infer fees, APR, expected return, execution quality, or whether a position should be opened, changed, or closed. Notification delivery must remain isolated from wallet-signing authority.
