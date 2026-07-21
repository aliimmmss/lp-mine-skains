# M4 WETH allowance-revocation paper mode

## Status

This command is a deterministic, read-only paper-mode evaluator for the provisionally selected operation:

`revoke-weth-allowance-for-position-manager`

It does **not** encode `approve(address,uint256)` transaction calldata, construct or simulate a state-changing call, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.

Every report includes `executionEligible: false`.

## Exact scope

| Field             | Pinned value                                                             |
| ----------------- | ------------------------------------------------------------------------ |
| Chain ID          | `4663`                                                                   |
| Token             | WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73`                        |
| Spender           | Uniswap v3 position manager `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` |
| Desired allowance | exactly `0`                                                              |
| Native value      | exactly `0`                                                              |
| Owner             | explicitly supplied checksummed address                                  |

USDG, arbitrary tokens or spenders, batching, multicall, permit, typed-data signatures, recipient selection, liquidity mutation, and ambient browser-wallet state are excluded.

## Evidence collection

The worker command uses two read providers:

1. the official Robinhood Chain public RPC from the pinned registry
2. the configured `ROBINHOOD_RPC_URL`

It chooses the lower provider tip minus a confirmation margin, then requires both providers to agree at that exact block on:

- chain ID
- block number, block hash, and timestamp
- WETH runtime bytecode
- position-manager runtime bytecode
- `allowance(owner, positionManager)`

Both bytecodes must match the durable registry hashes. The evaluator also requires the merged WETH authority evidence to remain source-agreed, execution-ineligible, and free of unresolved authority boundaries.

Provider URLs and credentials are never included in the JSON report.

## Command

Build the repository, then run:

```bash
PAPER_OWNER_ADDRESS=0xChecksummedOwner \
ROBINHOOD_RPC_URL=https://configured-provider.example \
npm run --workspace @lp-mine/worker paper:weth-allowance
```

Optional settings:

- `PAPER_CONFIRMATIONS`: positive integer, default `12`
- `PAPER_MAX_EVIDENCE_AGE_SECONDS`: positive integer, default `900`

`PAPER_OWNER_ADDRESS` must be the exact checksummed representation. A missing, invalid, zero, or differently cased address fails closed before allowance collection.

## Decisions

### `blocked`

Returned when any intent, registry, authority, bytecode, provider, shared-block, availability, or freshness check fails.

A blocked command exits with status code `2` after writing the complete sanitized report.

### `noop`

Returned when all checks pass and both providers agree the current allowance is already zero.

No transaction should be requested.

### `ready-for-separate-simulation-review`

Returned when all paper checks pass and the current allowance is nonzero.

This status means only that the evidence package is suitable for a later, separately reviewed simulation-design issue. It is **not** simulation approval, transaction approval, wallet approval, signing approval, or execution approval.

The report intentionally contains no selector bytes, transaction calldata, transaction request, gas estimate, signature payload, wallet instruction, or submission path.

## Evidence digest

The evaluator canonicalizes the normalized report payload by:

- sorting object keys
- converting dates to ISO-8601 strings
- converting integers represented as `bigint` to decimal strings

It then records a Keccak-256 digest. Identical normalized evidence and generation time produce the same digest; any material evidence change changes the digest.

## Remaining gates

Before any state-changing simulation or transaction construction is considered, a separate reviewed issue must define at minimum:

- the exact allowed function identity and argument policy
- simulation provider and independent fallback behavior
- internal-call, log, balance-change, and state-diff expectations
- human review fields and deliberate confirmation behavior
- transaction disable and incident-response controls
- receipt and post-allowance reconciliation

Nothing in this document authorizes capital deployment or constitutes financial advice.
