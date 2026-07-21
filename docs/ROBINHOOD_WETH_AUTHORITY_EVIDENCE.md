# Robinhood WETH authority evidence

## Status

The WETH upgrade-controller role membership and every material downstream authority boundary have been reconstructed and pinned as a read-only historical evidence snapshot.

The durable repository object is `ROBINHOOD_WETH_AUTHORITY_EVIDENCE` in `packages/robinhood-univ3/src/weth-authority-evidence.ts`.

The authority status is:

`authority-chain-verified`

Execution eligibility remains `false`. This evidence does not authorize calldata construction, wallet connection, signing, transaction submission, money movement, or capital deployment.

## Evidence model

The reviewed audits required the configured Alchemy endpoint for archive evidence and shared-block current-state agreement. The official Robinhood public RPC and Robinhood Blockscout were independent corroborating sources.

The durable snapshot records four reviewed audit runs:

| Layer | Run | Reviewed block |
| --- | --- | ---: |
| Controller AccessControl history | `29837850292` | `15624191` |
| Timelock roles and proxy controls | `29843251873` | `15664291` |
| Parent Safe configurations | `29845750811` | `15683672` |
| Shared nested Safe configuration | `29846927871` | `15692744` |

Every live audit remained read-only and was removed from `main` immediately after artifact review.

## Controller roles

The complete controller history contains 10 normalized `RoleGranted`, `RoleRevoked`, and `RoleAdminChanged` events.

Event digest:

`0xd880dde31907ed8351ec66af46cc7f96afffbda565e67501b23f4f4dabdabd06`

Current role holders at block `15624191`:

| Role | Holder | Classification |
| --- | --- | --- |
| `ADMIN_ROLE` | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` | controller proxy |
| `EXECUTOR_ROLE` | `0x560C81fe78FcC276e460524428f1a62057Ca8173` | timelock proxy |
| `EXECUTOR_ROLE` | `0x663703B4bC1F5e896Af2854548d6380F45F1C5D0` | EOA |
| `EXECUTOR_ROLE` | `0x6b9F63817F1442e40Bb9c3C2207758934C323FdC` | Safe proxy |

The controller has no active event-derived `DEFAULT_ADMIN_ROLE` holder. `ADMIN_ROLE` administers itself and `EXECUTOR_ROLE`.

## Timelock controls

The timelock is a pinned transparent proxy:

| Field | Value |
| --- | --- |
| Proxy | `0x560C81fe78FcC276e460524428f1a62057Ca8173` |
| Proxy runtime hash | `0xf48156e5fbedbcb08b438f07fd522b4365eab310620cfbcdf8b9e7a788153290` |
| Implementation | `0x145046bdd5c4bc72338f60dE5d9707BD73ff1843` |
| Implementation runtime hash | `0x17b6f897444c34a6a4f33c13f8f31bce8219a7d93a498b033559dde2604d8894` |
| ProxyAdmin | `0x672Da8B43058D1bC78956d71d9A208E168E2a3EF` |
| ProxyAdmin owner | controller proxy |
| Minimum delay | 604800 seconds (7 days) |
| Execution | open through the zero-address executor sentinel |

The complete timelock role history contains 5 events with digest:

`0xb6c5a26b4609847486a3a41ea4b801b2539b6c9653ae58c2a4900245e0bb8631`

The governance Safe `0x4C0360aFedD31e53718e4343F95E40b692402462` holds both `PROPOSER_ROLE` and `CANCELLER_ROLE`.

## Safe controls

All three Safes use the canonical SafeL2 v1.4.1 singleton:

- address `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`
- runtime bytes `24421`
- runtime hash `0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff`

All three use the canonical v1.4.1 CompatibilityFallbackHandler:

- address `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`
- runtime bytes `5637`
- runtime hash `0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9`

| Safe | Configuration | Modules | Guard | Contract owner |
| --- | --- | --- | --- | --- |
| Controller executor `0x6b9F63817F1442e40Bb9c3C2207758934C323FdC` | 7-of-8 | none | none | nested Safe |
| Timelock governance `0x4C0360aFedD31e53718e4343F95E40b692402462` | 6-of-8 | none | none | nested Safe |
| Nested owner `0x3A0C507Cc7F8785C877359ad49d0476966d17a1C` | 3-of-7 | none | none | none; all owners are EOAs |

The final nested Safe audit reported no unresolved authority boundaries.

## Fail-closed regression verification

`verifyRobinhoodWethAuthorityEvidence` compares the observed historical snapshot against the pinned record, including:

- chain ID and controller proxy/implementation/admin bytecode
- controller event count, digest, role IDs, role-admin relationships, and active holders
- timelock event digest, proxy chain, minimum delay, and role holders
- canonical Safe singleton and fallback-handler bytecode
- every Safe owner set, threshold, reviewed nonce, module list, guard, fallback handler, version, domain separator, and contract-owner classification
- the absence of unresolved authority boundaries

Any mismatch returns `mismatch`. An exact match returns `verified-read-only`. Both outcomes return `executionEligible: false`.

## Remaining execution blockers

Authority identification is no longer the blocker. The remaining M4 gates are separate:

- approved deterministic transaction intent
- exact contract and function allowlists
- mandatory simulation and fail-closed provider behavior
- user-controlled browser-wallet confirmation
- manual submission and receipt reconciliation
- paper-mode and tiny-live evidence before any broader execution discussion

Any authority or bytecode drift requires a fresh review before those later gates may proceed.

## References

- issue #72: controller role reconstruction
- issue #89: timelock authority
- issues #90 and #93: parent Safe configurations
- issue #99: nested Safe configuration
- `ROBINHOOD_WETH_CONTROL_EVIDENCE`
- `ROBINHOOD_WETH_AUTHORITY_EVIDENCE`

Nothing in this document constitutes financial advice or authorizes capital deployment.
