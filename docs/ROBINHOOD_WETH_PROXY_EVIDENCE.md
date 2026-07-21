# Robinhood WETH proxy evidence

## Status

The canonical Robinhood WETH address is verified for read-only use and remains **execution-ineligible**.

WETH is not an immutable standalone WETH9 deployment. It is a transparent ERC-1967 upgradeable proxy. Any future operation involving WETH must verify the proxy, current implementation, admin, and admin-owner chain before simulation or wallet presentation.

No wallet, approval request, calldata, signature, submission, or money movement is implemented by this evidence record.

## Canonical token

| Field | Value |
| --- | --- |
| Chain ID | `4663` |
| Proxy address | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |
| Name | `WETH` |
| Symbol | `WETH` |
| Decimals | `18` |
| Official address reference | Robinhood Chain token-contract documentation |

## Shared-block verification

Audit run `29821568270` read both the official public RPC and the configured monitoring RPC at the exact shared block `15484005`.

Both providers returned identical:

- chain ID
- proxy implementation, admin, and beacon slots
- proxy runtime bytecode
- implementation runtime bytecode
- admin runtime bytecode
- ProxyAdmin owner
- admin-owner runtime bytecode
- token name, symbol, decimals, total supply, and zero-owner allowance fixture

The audit performed read-only calls only. Provider URLs and credentials were omitted.

## ERC-1967 state

| Role | Address | Runtime bytes | Keccak-256 runtime hash |
| --- | --- | ---: | --- |
| Proxy | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 2,202 | `0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353` |
| Implementation | `0xC6B81b429797E0f555440b70cD99e032D7AE947e` | 6,961 | `0xbe1295f37be34ffe03ad779bda0ef278907e1856b51a3be2f35ee541d75d4650` |
| ProxyAdmin | `0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF` | 1,681 | `0xa4b2186ab82fa36fb4ae158582e5615ea519e757c26c13ba4a33daaaed8902a7` |
| ProxyAdmin owner | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` | 2,202 | `0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353` |

The beacon slot is empty.

The admin owner has the same runtime bytecode hash and length as the verified transparent proxy. This strongly indicates another proxy layer, but the owner proxy's implementation, admin, and ultimate authority have not yet been pinned. The control chain is therefore recorded as `proxied-owner-unresolved`.

## Verified source metadata

Blockscout reports the proxy and implementation as verified and agrees with the implementation address read from the ERC-1967 storage slot.

### Proxy

| Field | Value |
| --- | --- |
| Contract name | `TransparentUpgradeableProxy` |
| Proxy type | `eip1967` |
| Compiler | `v0.8.16+commit.07a7930e` |
| Optimization | enabled, 100 runs |
| EVM version | `london` |
| Source path | `@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol` |
| Captured source length | 8,279 characters |
| Captured source SHA-256 | `0xbe83b87e6f2dbc5d0dea923bb45092689382f1580893dfda28438452ffa10e88` |

### Implementation

| Field | Value |
| --- | --- |
| Contract name | `aeWETH` |
| Compiler | `v0.8.16+commit.07a7930e` |
| Optimization | enabled, 100 runs |
| Source path | `contracts/tokenbridge/libraries/aeWETH.sol` |
| Captured source length | 2,116 characters |
| Captured source SHA-256 | `0xb26087e549d2020917195e46ed1ec4e879905bb9b4eab0b7e64855a130e2dfce` |

The source digests identify the exact explorer responses reviewed on July 21, 2026. They are supporting provenance, not substitutes for runtime-bytecode verification.

## Required ERC-20 ABI semantics

The verified implementation ABI contains:

- `approve(address,uint256) returns (bool)`
- `allowance(address,address) returns (uint256)`
- `Approval(address indexed,address indexed,uint256)`

This confirms the interface shape needed to reason about allowance revocation. It does not approve an executable selector policy and does not establish that any proposed call is safe without exact state reads and simulation.

## Fail-closed verification

`verifyRobinhoodWethProxyEvidence` compares:

- chain ID
- proxy address, byte length, and runtime hash
- implementation address, byte length, and runtime hash
- admin address, byte length, and runtime hash
- empty beacon state
- admin-owner address, byte length, and runtime hash

Any mismatch returns `mismatch`. A successful match returns `verified-read-only`; it never enables execution.

## Execution blockers

WETH and the provisional allowance-revocation operation remain blocked because:

1. the ProxyAdmin owner is itself proxied and its implementation and ultimate authority are unresolved
2. the exact operation-specific function selector is not approved in executable policy
3. allowance-read source, freshness, and provider-agreement policy are not implemented
4. exact-call simulation and unexpected-side-effect decoding are not implemented
5. browser-wallet, confirmation, cancellation, and execution-disable boundaries are not implemented
6. receipt, `Approval` event, post-allowance, balance, and gas reconciliation fixtures are not implemented
7. any proxy, implementation, admin, owner, or bytecode change requires review to restart

## Evidence references

- Robinhood Chain canonical token contracts
- ERC-1967 proxy storage-slot standard
- issue #62 audit comments for runs `29821192934` and `29821568270`
- repository evidence object `ROBINHOOD_WETH_PROXY_EVIDENCE`

Nothing in this evidence record is financial advice or authorization to deploy capital.
