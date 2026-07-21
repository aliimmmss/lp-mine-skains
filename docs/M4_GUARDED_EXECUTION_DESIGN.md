# M4 guarded manual execution design gate

## Status

This document is a design and review artifact only. It does not authorize or implement wallet connections, approvals, transaction construction, signing, submission, or capital deployment.

M4 implementation remains blocked until:

- M3 notification delivery is merged.
- The first default-branch Telegram workflow run is reviewed.
- Monitoring state is proven to persist across scheduled runs.
- Notification deduplication and secret-safe failure behavior are observed in the live workflow.
- The contract registry and chain metadata required by the first execution target are independently verified.

## Objective

M4 may eventually allow an operator to review and manually sign a narrowly scoped transaction in a browser wallet. The system must make unsafe actions difficult, visible, and fail-closed.

The core invariant is:

> Research, monitoring, and strategy outputs can propose an action, but only deterministic validation plus explicit browser-wallet confirmation can reach a signature request.

No worker, GitHub Action, Telegram integration, server, database, or language model may receive signing authority.

## Trust boundaries

### Read-only worker

The worker may:

- collect and verify chain evidence
- compute deterministic monitoring and simulation outputs
- persist evidence and lifecycle metadata
- emit unsigned, descriptive proposal data after M4 is explicitly approved

The worker must never:

- store wallet credentials
- sign messages or transactions
- submit transactions
- request token approvals
- choose an arbitrary destination or calldata payload

### Web application

The web application is the only eventual interface allowed to request a browser-wallet connection. It must treat the connected wallet, RPC, frontend bundle, and displayed transaction summary as separate trust surfaces.

A wallet connection must not imply permission to sign. Every signature request requires a fresh, explicit review step.

### Browser wallet

The browser wallet is the exclusive signing boundary. The user must be able to reject or cancel without changing application state into a false success condition.

The application must never ask for:

- seed phrases
- private keys
- exported keystores
- cloud wallet backups
- signer secrets in environment variables or GitHub Actions

### RPC and simulation providers

RPC and simulation responses are untrusted evidence. A single provider response cannot silently override pinned registry data or locally deterministic validation.

Provider disagreement, unavailable simulation, stale state, or undecodable output must stop the flow.

### Contract registry

Every write-capable destination and spender must resolve from a pinned registry entry containing:

- chain ID
- protocol and version
- contract address
- verified source reference
- deployed bytecode hash
- expected interface and allowed function selectors
- upgradeability and admin status
- review date
- explicit live-eligibility status

Unknown, stale, mismatched, or non-eligible registry entries are rejected.

## Entry gates

No M4 implementation pull request should be approved until all gates below are satisfied.

### Operational gate

- M3 dashboard, acknowledgement, and Telegram notification paths are merged.
- Scheduled monitoring has completed successfully on the default branch.
- Monitoring database restoration and persistence have been observed across at least two runs.
- Duplicate alerts are suppressed and reopened alert occurrences notify again.
- No notification path exposes credentials in logs or errors.

### Evidence gate

- Chain ID is pinned.
- Canonical pool and token addresses are pinned.
- Token decimals, ordering, fee tier, and tick spacing are verified.
- The first write-capable contract is independently verified.
- Historical bootstrap assumptions required by the execution target are resolved or explicitly irrelevant.

### Security gate

- Threat model is reviewed.
- Exact contract and function allowlists are approved.
- Approval policy is approved.
- Simulation and fallback policy is approved.
- Incident-response and execution-disable controls are documented.
- Dependency review and secret scanning are enabled for execution-related changes.

### Product gate

- The first supported operation is explicitly selected.
- The transaction summary fields are defined.
- The user confirmation sequence is approved.
- Cancellation, rejection, timeout, and replacement behavior are defined.
- No profitability or capital-allocation recommendation is presented as execution authority.

## First-operation selection

The first operation must be narrower than a general-purpose router or arbitrary transaction builder.

Before implementation, select exactly one operation and record the rationale in the tracking issue. Candidate operations may be considered only after contract and receipt semantics are verified.

The first operation must not support:

- arbitrary calldata
- arbitrary destination addresses
- arbitrary token approvals
- unlimited approvals
- unknown tokens or pools
- non-allowlisted hooks
- autonomous submission
- transaction batching that obscures individual actions

Adding liquidity, removing liquidity, collecting fees, and revoking an allowance are separate operation types and require separate validation policies. Approval for one does not authorize another.

## Proposed execution flow

This flow describes the review sequence only. It is not an implementation specification.

1. **Load a proposal**
   - Proposal references stored evidence and a deterministic strategy or operator request.
   - Proposal has an immutable identifier and generation timestamp.

2. **Resolve registry entries**
   - Resolve chain, pool, tokens, destination, spender, and allowed function.
   - Compare deployed bytecode with the pinned registry hash.

3. **Re-read current state**
   - Read chain ID, block number, pool state, balances, allowances, and operation-specific state.
   - Reject stale or internally inconsistent evidence.

4. **Build a typed intent**
   - Intent contains only fields allowed for the selected operation.
   - No raw or opaque calldata is accepted as an input.

5. **Run deterministic validation**
   - Validate every field against explicit rules and registry evidence.
   - Produce passed and failed gates in machine-readable form.

6. **Simulate the complete call**
   - Use the exact sender, destination, value, and encoded call intended for signing.
   - Decode expected balance, allowance, ownership, and position effects.

7. **Revalidate after simulation**
   - Confirm simulation output matches the typed intent and expected effects.
   - Reject unexpected token transfers, recipients, approvals, callbacks, or state changes.

8. **Present the review screen**
   - Display decoded actions, addresses, token amounts, limits, deadlines, and warnings.
   - Display the block and evidence age used by validation and simulation.

9. **Require explicit confirmation**
   - Require a deliberate operator action after the final summary is visible.
   - A connected wallet alone is not confirmation.

10. **Request browser-wallet signature**
    - Submit only the previously reviewed transaction request.
    - Any mutation requires validation and confirmation to restart.

11. **Reconcile the receipt**
    - Record transaction hash, receipt status, logs, gas, and actual balance deltas.
    - Do not mark success from a wallet prompt, submitted hash, or optimistic UI state.

12. **Update monitoring and accounting**
    - Link receipt evidence to the originating intent and proposal.
    - Preserve failures, replacements, and cancellations.

## Typed intent requirements

A future typed intent must include, at minimum:

- schema version
- immutable intent ID
- proposal or operator-request reference
- generated-at timestamp
- expiration timestamp
- expected chain ID
- sender address
- destination contract registry ID and address
- allowed function identity
- token addresses and decimals
- pool address and fee tier when applicable
- recipient address
- exact input or maximum input
- minimum output or minimum received amounts where applicable
- approval spender, token, and exact allowance amount when applicable
- position identifier or range bounds when applicable
- native value
- evidence block number and timestamp
- simulation reference and timestamp
- deterministic validation result hash

The intent must not contain an unreviewed arbitrary data field that can replace typed validation.

## Deterministic validation matrix

Every future transaction request must fail closed on any failed or unavailable required check.

| Area | Required validation |
| --- | --- |
| Chain | Connected wallet chain equals the pinned chain ID |
| Sender | Sender equals the currently connected wallet and the simulated sender |
| Destination | Exact address is live-eligible in the registry |
| Bytecode | Deployed bytecode hash equals the pinned hash |
| Function | Selector and decoded arguments match an allowed operation |
| Tokens | Exact addresses, ordering, decimals, and policy eligibility match |
| Pool | Address, fee tier, tick spacing, tokens, and immutable metadata match |
| Recipient | Explicitly displayed and constrained to the approved policy |
| Amounts | Integer base units, bounded, nonnegative, and derived from displayed inputs |
| Approval | Exact token, spender, amount, and lifetime; no silent unrelated reuse |
| Range | Tick bounds ordered, spacing-aligned, and operation-valid |
| Deadline | Present, displayed, and within the approved maximum horizon |
| Limits | Minimum output or maximum input is nonzero and explicitly displayed |
| State age | Reads and simulation are within the approved freshness window |
| Simulation | Exact call succeeds and effects match the typed intent |
| Side effects | No unexpected transfers, approvals, recipients, callbacks, or ownership changes |
| Wallet request | Exactly matches the validated and reviewed request |

## Approval policy

The default approval policy is exact and temporary:

- exact token address
- exact allowlisted spender
- exact amount required by the reviewed operation
- no unlimited amount
- no `setApprovalForAll` by default
- no silent reuse of an allowance granted for another purpose
- current allowance displayed before approval
- approval and execution treated as separate reviewable transactions
- revocation path documented and available before live eligibility

Any exception requires a separate security review and explicit registry policy. Convenience is not sufficient justification.

## Simulation policy

Simulation is mandatory but not sufficient.

A valid simulation must:

- use the intended sender
- use the exact destination, value, and calldata produced from the typed intent
- execute against a clearly identified block or state reference
- decode all relevant token, allowance, position, ownership, and native-balance changes
- expose internal calls or callbacks required to assess side effects
- return no unexpected recipients or asset movements

Execution stops when:

- simulation is unavailable
- the provider returns an undecodable result
- the simulated state is stale
- the wallet request differs from the simulated call
- deterministic validation and simulation disagree
- multiple required providers disagree beyond the approved policy

A successful simulation does not override a registry, token-policy, hook-policy, or validation failure.

## Review-screen requirements

The final review screen must display, without relying on token symbols alone:

- operation type
- chain name and chain ID
- wallet address
- destination contract name and full address
- function name
- token names, full addresses, decimals, and base-unit amounts
- spender and approval amount, when applicable
- recipient
- pool address and fee tier, when applicable
- range bounds and current tick, when applicable
- deadline and remaining time
- minimum received or maximum spent limits
- current and expected allowance
- expected balance and position changes
- simulation status and evidence age
- all warnings and failed non-required checks
- intent ID and build commit

Critical fields must not be hidden behind expandable sections.

## State machine

A future execution attempt must have explicit states:

- `draft`
- `validating`
- `validation-failed`
- `simulation-pending`
- `simulation-failed`
- `ready-for-review`
- `user-rejected`
- `signature-requested`
- `wallet-rejected`
- `submitted`
- `replaced`
- `confirmed`
- `reverted`
- `dropped-or-unknown`
- `reconciled`

Only receipt evidence may transition an attempt to `confirmed`. Only receipt and balance/log reconciliation may transition it to `reconciled`.

Retrying or modifying an intent creates a new attempt identity. It must not overwrite the previous audit record.

## Threat model

### Compromised frontend

Mitigations:

- reproducible build and public commit identifier
- strict content security policy before execution eligibility
- dependency review and lockfile integrity
- decoded wallet request compared with the reviewed intent
- no arbitrary transaction request interface

### Malicious or incorrect RPC

Mitigations:

- pinned chain ID and registry data
- bytecode verification
- independent evidence sources for critical metadata
- explicit block and freshness reporting
- fail closed on disagreement

### Address substitution

Mitigations:

- full addresses displayed
- registry IDs resolved to pinned addresses
- typed intent hash covers destination, spender, recipient, and tokens
- wallet request equality check before signature

### Approval abuse

Mitigations:

- exact approvals
- allowlisted spender
- approval and execution separated
- existing allowance displayed
- revocation workflow

### Stale state and price movement

Mitigations:

- short evidence and simulation freshness windows
- explicit deadline
- nonzero minimum-output or maximum-input limits
- complete revalidation after any mutation or delay

### Simulation mismatch

Mitigations:

- simulate the exact call
- compare expected and simulated side effects
- compare wallet request with the validated call
- stop on provider disagreement or undecodable effects

### Replay or duplicated submission

Mitigations:

- immutable intent and attempt IDs
- expiration and deadline checks
- receipt and nonce tracking
- no automatic retry with the same approval or intent state

### User-interface deception

Mitigations:

- full addresses and decoded actions
- critical fields always visible
- no green success state before receipt confirmation
- warnings cannot be dismissed into a valid state
- wallet prompt details must match the application summary

### Language-model authority escalation

Mitigations:

- language models may explain only
- deterministic code owns allowlists, limits, validation, and state transitions
- model output cannot produce or modify a signable request
- model output cannot clear a failed gate

## Audit evidence

Every future execution attempt must preserve:

- proposal or operator-request reference
- typed intent
- registry version and relevant entries
- evidence block and timestamps
- validation results
- simulation input and decoded output
- displayed review summary hash
- build commit
- wallet request hash
- transaction hash and replacement relationship
- receipt and decoded logs
- actual wallet balance and allowance deltas
- failure, rejection, cancellation, and timeout reasons

Do not log private keys, seed phrases, wallet authentication material, Telegram credentials, provider secrets, or unnecessary personal wallet metadata.

## Incident response

Before live eligibility, the project must document and test how to:

1. disable execution UI without disabling read-only monitoring
2. stop presenting new intents
3. preserve pending and submitted attempt records
4. identify current positions and allowances
5. generate reviewable revocation or withdrawal-only proposals under a separately approved policy
6. communicate affected commits, contracts, and transaction hashes
7. reconcile receipts and balances after an incident

Monitoring and Telegram alerts remain read-only throughout an incident.

## Review checklist

### Architecture

- [ ] Signing exists only in the browser wallet.
- [ ] Workers, CI, servers, and alert integrations remain read-only.
- [ ] Typed intents are separated from signing and submission.
- [ ] Arbitrary calldata is impossible through supported interfaces.

### Registry and contracts

- [ ] Chain ID and all write-capable addresses are pinned.
- [ ] Bytecode hashes and interfaces are verified.
- [ ] Allowed selectors and operation types are explicit.
- [ ] Upgradeability and admin risk are documented.

### Validation and simulation

- [ ] Every signable field has a deterministic validation rule.
- [ ] All required checks fail closed.
- [ ] Exact-call simulation is mandatory.
- [ ] Unexpected side effects stop execution.
- [ ] Wallet request equality is checked after simulation.

### Approvals

- [ ] Exact approvals are the default.
- [ ] Unlimited approvals are rejected.
- [ ] Spender, token, amount, and current allowance are displayed.
- [ ] Revocation behavior is documented.

### User review

- [ ] Full addresses are visible.
- [ ] Amounts and limits are shown in both human-readable and base-unit form where practical.
- [ ] Critical warnings cannot be bypassed.
- [ ] Cancellation and wallet rejection are first-class states.

### Reconciliation

- [ ] Success requires a confirmed receipt.
- [ ] Accounting uses actual logs and balance deltas.
- [ ] Replacements, reverts, and dropped transactions remain visible.
- [ ] Audit evidence is immutable and linked to the intent.

### Operational readiness

- [ ] M3 live notification behavior is verified.
- [ ] Execution can be disabled independently.
- [ ] Incident-response steps are tested.
- [ ] No production funds are used during initial implementation or review.

## User preparation

Nothing additional is required from the operator during this design phase.

Do not add wallet keys, seed phrases, signer credentials, or exchange credentials to repository secrets.

Only after the design is reviewed and a narrowly scoped first operation is approved may a later implementation phase request non-secret configuration such as a preferred browser wallet and an explicitly disposable test wallet address. Any wallet setup must happen outside the repository and must never expose recovery material.

## Exit criteria for the design phase

The design phase is complete when:

- this document is reviewed and merged
- issue #39 records the selected first operation and unresolved decisions
- PR #38 is merged and the first scheduled Telegram workflow behavior is reviewed
- required contract and token registry evidence is pinned
- a follow-up implementation issue is limited to deterministic, non-signing components with explicit test fixtures

Until then, M4 remains design-only.