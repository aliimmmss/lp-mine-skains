# M4 non-signing intent proposal assessment

## Status

This component is deterministic proposal parsing and policy comparison only.

It cannot:

- encode ABI calldata
- construct a wallet request
- connect to a wallet
- request an approval or signature
- submit a transaction
- move funds
- recommend a capital amount or deployment

Every assessment returns:

- `mode: "non-signing"`
- `signingEligible: false`
- a status of `invalid`, `blocked`, or `reviewable`

`reviewable` means that a proposal is structurally valid and consistent with the supplied policy for design or human review. It does not mean simulation-ready, executable, or signable.

## Why this slice exists

The guarded-execution design requires typed proposal data to remain separate from encoding, simulation, signing, and submission. This slice establishes the first boundary:

1. untrusted JSON-like input is parsed strictly
2. unknown fields fail closed
3. normalized proposal fields are compared with an explicit policy
4. a stable audit digest is calculated over the normalized proposal
5. no transaction-shaped output is produced

The parser intentionally rejects opaque fields such as `data`, `calldata`, transaction objects, provider responses, and signature payloads because they are not part of the allowed schema.

## Proposal fields

Schema version 1 contains:

- `schemaVersion`
- `intentId`
- `proposalReference`
- `generatedAt`
- `expiresAt`
- `expectedChainId`
- `sender`
- `operationId`
- `destinationRegistryId`
- `destinationAddress`
- `recipient`
- `nativeValueBaseUnits`
- `evidence.blockNumber`
- `evidence.observedAt`
- `evidence.registryBytecodeHash`

Addresses and bytecode hashes are normalized to lowercase hexadecimal. Integer values that may exceed JavaScript's safe integer range are represented as canonical unsigned decimal strings.

The current slice requires native value to equal zero.

## Policy fields

The caller supplies an explicit policy containing:

- expected chain ID
- selected sender, or `null` when unresolved
- selected operation ID, or `null` when unresolved
- destination registry ID, address, bytecode hash, and execution-eligibility flag
- sender-only recipient policy
- maximum proposal lifetime
- maximum evidence age

Production registry entries remain execution-ineligible. No live operation has been selected. Consequently, production-style assessments remain `blocked` until those decisions are reviewed separately.

## Outcomes

### `invalid`

At least one deterministic check failed. Examples include:

- unknown fields
- malformed addresses, hashes, timestamps, identifiers, or integer strings
- wrong chain, sender, operation, registry entry, destination, or recipient
- stale evidence
- expired proposals
- nonzero native value

### `blocked`

The proposal is structurally valid, but an explicit decision or policy gate is unresolved. Current expected blockers include:

- no selected sender
- no selected first operation
- execution-ineligible destination registry entry

### `reviewable`

All parser and supplied-policy checks pass. This state remains non-signing and cannot progress to a wallet request through this component.

Tests use synthetic fixture policies to exercise this state. They do not mark any real contract or operation execution-eligible.

## Audit digest

The component computes SHA-256 over the normalized, fixed-order proposal representation. The digest is for audit comparison and mutation detection only. It is not a signature, transaction hash, authorization, or substitute for simulation and receipt evidence.

## Remaining gates

Before any later simulation or browser-wallet work:

- select exactly one first operation
- approve exact destination and function-selector allowlists
- review contract interfaces, source provenance, upgradeability, and administration
- approve exact approval scope and lifetime
- approve simulation provider and fail-closed fallback behavior
- define the complete review and confirmation sequence
- define execution disablement, cancellation, timeout, replacement, and receipt reconciliation

No wallet secrets or signer credentials belong in the repository, worker, CI, monitoring database, or chat.
