# Security Model

## Security posture

LP Mine begins as a read-only research and paper-trading system. Money-moving functionality is intentionally excluded until the project has deterministic transaction validation, reproducible tests, and independent review.

## Threats in scope

- malicious or non-standard ERC-20 tokens
- manipulated pool prices and thin liquidity
- spoofed token symbols or pool contracts
- compromised or incorrect RPC responses
- stale quotes and front-running
- malicious aggregator calldata
- unsafe Uniswap v4 hooks
- frontend or dependency compromise
- incorrect PnL and fee accounting
- excessive approvals
- accidental wrong-chain transactions
- autonomous strategy mistakes
- leaked private keys or seed phrases

## Non-custodial rules

- The application never requests a seed phrase.
- Private keys are never stored in application configuration, databases, logs, CI, or servers.
- Hosted workers are read-only.
- Eventual live transactions are signed by a browser wallet.
- Telegram, email, and other alert integrations never receive signing authority.

## Contract registry

Every write-capable contract must be registered with:

- chain ID
- protocol and version
- address
- verified source reference
- deployed bytecode hash
- expected interfaces
- upgradeability status
- owner or admin controls
- review date

Unknown contracts are rejected by default.

## Uniswap v4 policy

Initial policy:

- zero-address hooks may be considered after normal pool checks
- nonzero hooks are rejected

A future hook allowlist requires:

- verified source
- exact bytecode hash
- decoded permissions
- upgradeability and admin analysis
- audit references
- withdrawal-path testing
- explicit risk approval

A successful simulation is not evidence that a hook is safe.

## Token policy

Initial live eligibility requires established tokens with:

- verified contract source where available
- no fee-on-transfer behavior
- no rebasing
- no wallet blacklist or transfer cooldown
- no unrestricted minting or freezing authority
- adequate exit liquidity

Unknown or speculative assets may be observed and paper-traded but are not live-eligible.

## Transaction gates

Before presenting a transaction for signature, verify:

- expected chain ID
- destination contract allowlist
- decoded function and arguments
- token addresses rather than symbols
- spender and recipient
- exact input and approval amounts
- deadline
- minimum output and maximum input
- fee tier and tick spacing
- range bounds
- current pool state
- expected balance changes
- successful full-call simulation

Quote failure or zero minimum output must always stop execution.

## Approval policy

- exact approvals by default
- no `setApprovalForAll` unless the spender and use case are explicitly reviewed
- display existing allowance before every approval
- provide an allowance-revocation view
- never silently reuse an unrelated approval

## Accounting policy

Only actual transaction receipts and wallet balance deltas count as realized values.

The system must never:

- count a quote as realized proceeds
- sell unrelated wallet inventory when closing a position
- combine another bot's wallet activity with LP PnL
- hide gas or failed transactions

Report separately:

- principal returned
- fees collected
- gas and execution costs
- unsold token inventory
- unrealized value
- realized PnL
- LP-versus-HODL return

## Automation policy

LLMs may summarize evidence or generate explanations. They cannot:

- alter capital limits
- bypass asset or contract allowlists
- choose arbitrary transaction destinations
- approve tokens
- override stop conditions

Any future automation requires:

- per-position cap
- daily deployment cap
- maximum open positions
- maximum turnover
- drawdown and loss limits
- emergency pause
- deterministic exit rules
- complete decision logs

## Development controls

Required before live execution:

- protected main branch
- pull-request review
- CI type checks and tests
- dependency lockfile
- dependency review and secret scanning
- unit, property, fork, and failure-injection tests
- reproducible production build
- public deployment commit identifier

## Incident response

The system must support:

1. stopping workers and alerts
2. disabling all execution UI
3. displaying current positions and approvals
4. generating withdrawal-only transaction intents
5. revoking allowances
6. preserving logs and decision records
7. publishing affected commits and contracts

## Current status

No production funds should be used. The project is in foundation and paper-mode development.
