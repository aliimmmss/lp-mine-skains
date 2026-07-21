# M4 first-operation decision

## Status

**Provisional design selection only. No operation-specific implementation is authorized.**

The first candidate operation is:

`revoke-weth-allowance-for-position-manager`

An eventual implementation would be limited to setting the pinned WETH allowance for the pinned Uniswap v3 position manager to exactly zero through the user-controlled browser wallet.

This document does not add or authorize:

- wallet connection code
- ABI encoding or calldata construction
- approval or signature requests
- transaction submission
- transaction batching or multicall
- capital deployment
- profitability or position recommendations

All current registry entries remain execution-ineligible.

## Decision rationale

ERC-20 defines `approve(spender, value)` as replacing the spender's allowance with the supplied value and requires a successful call to emit an `Approval` event. Setting the value to zero therefore provides a narrow, independently reconcilable permission-reduction operation. The standard also warns clients to set an existing allowance to zero before setting another nonzero value, reinforcing zero allowance as the safe reset state.

Source: [ERC-20 token standard](https://eips.ethereum.org/EIPS/eip-20).

The Uniswap v3 position manager alternatives are materially broader:

- `increaseLiquidity` spends token0 and token1 and includes desired amounts, minimum amounts, and a deadline.
- `decreaseLiquidity` changes position liquidity and accounts token amounts to the position.
- `collect` transfers owed token0 and token1 to a specified recipient up to maximum amounts.
- `mint` creates a new position and includes tokens, range, desired amounts, minimum amounts, recipient, and deadline.

Source: [Uniswap v3 `INonfungiblePositionManager`](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/INonfungiblePositionManager.sol).

Allowance revocation is narrower because it has:

- one pinned token contract
- one pinned spender
- one exact amount: zero
- no arbitrary recipient
- no token transfer by the approval operation itself
- no pool, tick, liquidity, price, slippage, or deadline input
- no ability to increase spending permission

It also exercises the execution-disable and receipt-reconciliation architecture before considering any capital-deploying operation.

## Exact provisional scope

| Field | Required value |
| --- | --- |
| Chain | Robinhood Chain mainnet |
| Chain ID | `4663` |
| Token | Pinned WETH only |
| Token registry evidence | `robinhood.weth` entry and pinned bytecode hash |
| Spender | Pinned Uniswap v3 position manager only |
| Amount | Exactly `0` |
| Owner | Currently connected browser-wallet account only |
| Native value | Exactly `0` |
| Recipient | Not applicable |
| Batching | Prohibited |
| Multicall | Prohibited |
| Permit / typed-data approval | Prohibited |
| Server or worker signing | Prohibited |
| Autonomous submission | Prohibited |

The pinned addresses and current two-source bytecode evidence are recorded in [Robinhood registry evidence](ROBINHOOD_REGISTRY_EVIDENCE.md).

## Explicit exclusions

The first operation must not support:

- USDG or any token other than the pinned WETH entry
- any spender other than the pinned position manager
- any nonzero approval amount
- increasing, replacing, or refreshing an allowance
- `permit`, EIP-2612, or any off-chain approval signature
- arbitrary token contracts
- arbitrary destination addresses
- arbitrary calldata or function selectors
- token transfers
- minting, increasing liquidity, decreasing liquidity, collecting, burning, swapping, or position transfer
- multicall or transaction batching
- native token value
- transaction retries without a new validation and confirmation cycle

USDG is excluded because its exact source, proxy, implementation, administration, and token-specific approval behavior have not been approved for execution use.

## Required pre-read evidence

Before an intent can be considered for later simulation, deterministic code must read and verify:

1. connected chain ID equals `4663`
2. connected account equals the typed intent sender
3. WETH address equals the pinned registry address
4. WETH deployed bytecode hash equals the pinned hash
5. position manager address equals the pinned spender
6. position manager deployed bytecode hash equals the pinned hash
7. current WETH allowance for `(owner, positionManager)`
8. evidence block number and timestamp
9. provider agreement under the approved evidence policy

If the current allowance is already zero, the result must be a non-signing no-op. The application must not request a transaction solely to reproduce the existing zero state.

## Required intent fields

An operation-specific intent would eventually need, at minimum:

- schema version
- immutable intent ID
- proposal or operator-request reference
- generated-at and expiration timestamps
- expected chain ID
- owner/sender address
- operation ID `revoke-weth-allowance-for-position-manager`
- WETH registry ID and address
- WETH pinned bytecode hash
- spender registry ID and address
- spender pinned bytecode hash
- exact amount string `0`
- native value string `0`
- current allowance before the operation
- evidence block and timestamp
- approved ABI/function identity reference
- later simulation reference
- deterministic validation digest

No raw calldata field is permitted in proposal input.

## Deterministic checks

Every check fails closed:

### Identity

- chain ID is exact
- owner equals the connected account
- token registry ID and address are exact
- spender registry ID and address are exact
- operation ID is exact

### Bytecode and interface

- WETH code exists and hash matches the pinned value
- position manager code exists and hash matches the pinned value
- reviewed WETH source and ABI semantics match the deployed bytecode evidence
- the exact allowed function identity and selector are pinned
- no fallback, proxy, delegatecall, or administration uncertainty remains unresolved

### Values

- approval amount equals zero
- native value equals zero
- no recipient field is accepted
- no deadline, token amount, position, pool, range, or slippage field is accepted
- no unknown field is accepted

### State and freshness

- current allowance is available
- allowance evidence is within the approved freshness window
- critical providers agree
- allowance is greater than zero before a transaction can be proposed

## Simulation gate

Operation-specific code remains blocked until a separate review approves the simulation policy.

A later exact-call simulation must establish:

- the call succeeds from the intended owner
- the destination is the pinned WETH address
- the spender is the pinned position manager
- the amount is zero
- native value is zero
- post-call allowance is zero
- no WETH or USDG balance transfer occurs
- no ownership or position state changes
- no unexpected logs, internal calls, approvals, callbacks, or recipients occur

Simulation unavailability, undecodable effects, stale state, or provider disagreement stops the flow.

## Review screen

Before any eventual wallet request, the final review must display without truncation:

- operation: revoke WETH allowance
- chain name and chain ID
- owner address
- WETH full address
- WETH bytecode evidence status
- spender name and full address
- spender bytecode evidence status
- current allowance in base units and human-readable units
- new allowance: exactly zero
- native value: zero
- evidence block and age
- simulation status and age
- intent ID and build commit
- a clear statement that the operation removes permission and does not transfer WETH

A connected wallet is not confirmation. Confirmation must occur only after this summary is visible.

## Receipt reconciliation

Success requires all of the following:

1. confirmed transaction receipt with successful status
2. destination equals the pinned WETH address
3. decoded operation matches the reviewed intent
4. expected ERC-20 `Approval(owner, spender, 0)` evidence is present under the approved token-specific policy
5. post-transaction allowance reads as zero
6. WETH and USDG token balances do not change because of the approval call
7. no position ownership or liquidity state changes
8. no unexpected logs, internal calls, recipients, or approvals
9. gas and native-balance changes are recorded separately

A wallet prompt, wallet approval, submitted hash, or optimistic UI state is never success.

## Incident and disablement requirements

Before operation-specific implementation:

- execution UI must have an independent hard-disable switch
- disabling execution must not disable read-only monitoring
- pending intents must expire and remain auditable
- submitted attempts must remain visible for reconciliation
- no automatic retry is allowed
- any registry drift, dependency incident, simulation mismatch, or unexpected receipt disables the operation

## Remaining blockers

This provisional selection is not ready for implementation. The following remain unresolved:

- exact WETH source-to-bytecode provenance
- WETH proxy, upgradeability, and administration conclusion
- exact approved ABI fragment and function selector
- token-specific return-value and event-handling policy
- approved simulation provider and fallback behavior
- independent evidence-source policy for allowance reads
- browser-wallet interface boundary
- operator confirmation UX
- execution-disable implementation design
- receipt and unexpected-side-effect test fixtures
- dependency review and secret-scanning requirements for later wallet-related changes

Until these blockers are closed, the selected operation remains design-only and execution-ineligible.
