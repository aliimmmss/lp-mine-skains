# Next M4 slice: offline simulation evidence ingestion

## Goal

Add an offline-only normalization and review boundary for simulation evidence produced outside this repository, without contacting a simulation provider and without creating transaction material.

## Allowed scope

- parse sanitized JSON fixtures that contain no calldata, transaction request, wallet, signature, nonce, gas-price, endpoint, credential, or submission fields
- normalize provider-specific call-tree, log, touched-address, and state-diff summaries into the existing inert simulation-policy schema
- bind every fixture to an exact paper-mode evidence digest, owner, shared block number, and block hash
- reject unknown provider formats, ambiguous fields, missing provenance, extra calls, extra logs, balance changes, allowance drift, bytecode drift, registry drift, or authority drift
- emit a deterministic, execution-ineligible review record

## Explicitly out of scope

- network requests to simulation providers
- ABI encoding or selector-byte generation
- raw calldata or complete transaction requests
- wallet connection or signing
- transaction submission or retry behavior
- receipt reconciliation
- live or tiny-live execution

## Required acceptance criteria

- provider adapters are pure and deterministic
- raw provider payloads are not persisted in output artifacts
- all normalized outputs remain `implementationAuthorized: false`, `simulationAuthorized: false`, and `executionEligible: false`
- malformed, unsupported, stale, inconsistent, or over-broad evidence fails closed
- tests cover supported fixtures and every rejection boundary
- any future network-backed simulation implementation requires another separately reviewed issue and pull request
