# Robinhood WETH upgrade-control chain

## Status

The WETH proxy administration chain is identified and pinned for read-only verification.

Ultimate authority remains **unresolved at the AccessControl role-membership layer**. WETH and the provisional allowance-revocation operation remain execution-ineligible.

No wallet connection, calldata construction, state-changing call, signature, transaction submission, or money movement is implemented by this evidence record.

## Evidence method

Audit run `29822600084` traced the WETH ProxyAdmin owner at shared block `15493693` using:

- the official public Robinhood RPC
- the configured monitoring RPC
- ERC-1967 implementation, admin, and beacon storage slots
- runtime bytecode hashes
- official Robinhood Blockscout verified metadata
- verified read-only `owner()` calls only where the explorer ABI exposed the exact function

Both RPC sources agreed exactly. The trace was bounded to six levels and rejected address cycles.

## Identified control chain

### WETH ProxyAdmin

| Field | Value |
| --- | --- |
| Address | `0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF` |
| Contract | verified `ProxyAdmin` |
| Runtime bytes | 1,681 |
| Runtime hash | `0xa4b2186ab82fa36fb4ae158582e5615ea519e757c26c13ba4a33daaaed8902a7` |
| Verified owner | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` |
| Source-response SHA-256 | `0xe1f18ca464715b24fa20b49ca2b75aff9084a96bd7e726ace63097270719433b` |

### Upgrade-controller proxy

| Field | Value |
| --- | --- |
| Address | `0x2A153c6A1B66DBc930a8d7017230ab0253005C09` |
| Contract | verified `TransparentUpgradeableProxy` |
| Runtime bytes | 2,202 |
| Runtime hash | `0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353` |
| Implementation | `0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd` |
| Admin | `0xa3Acd31AFb851B4eB9DAD00F5204c01D924267dF` |
| Beacon | none |
| Source-response SHA-256 | `0xbe83b87e6f2dbc5d0dea923bb45092689382f1580893dfda28438452ffa10e88` |

The same ProxyAdmin administers both WETH and the controller proxy. The ProxyAdmin's owner is the controller proxy, forming an intentional governance structure rather than an unknown owner address.

### Controller implementation

| Field | Value |
| --- | --- |
| Address | `0x3c3E52bC8C181D06A76e2518bBc655C5BB3Ce7Cd` |
| Explorer name | `UpgradeExtractor` |
| Source path | `src/UpgradeExecutor.sol` |
| Runtime bytes | 6,204 |
| Runtime hash | `0x0d88feac198ef1b50b99fddf06aa9f6b1050bfe7211d6f04173de9b6d8953bcb` |
| Compiler | `v0.8.16+commit.07a7930e` |
| Source verification | verified, partially verified metadata |
| Source-response SHA-256 | `0x202d0719dbd3588e63a8c3675a63383d739f3438e393740ca61ca768e6abe30c` |

The implementation is not another proxy.

## AccessControl boundary

The verified ABI exposes:

- `DEFAULT_ADMIN_ROLE`
- `ADMIN_ROLE`
- `EXECUTOR_ROLE`
- `hasRole`
- `getRoleAdmin`
- `supportsInterface`
- `grantRole`
- `revokeRole`
- `renounceRole`
- `execute`
- `executeCall`
- `initialize`

It does **not** expose AccessControlEnumerable functions such as `getRoleMember` or `getRoleMemberCount`.

Therefore the current role holders cannot be proven through direct enumeration. Ultimate upgrade authority depends on the current holders and administration relationships of `DEFAULT_ADMIN_ROLE`, `ADMIN_ROLE`, and `EXECUTOR_ROLE`.

The control status is recorded as:

`access-control-role-membership-unresolved`

This is a hard execution blocker, not a warning.

## Fail-closed verification

`verifyRobinhoodWethControlEvidence` compares:

- chain ID
- controller proxy address, runtime length, and runtime hash
- controller implementation address, runtime length, and runtime hash
- controller admin address, runtime length, and runtime hash
- empty beacon state
- ProxyAdmin owner relationship

Any mismatch returns `mismatch`. A successful match returns `verified-read-only` and still returns `executionEligible: false`.

## Required next evidence

Before the role boundary can be considered resolved:

1. identify the controller deployment or initialization block from independently verified evidence
2. reconstruct `RoleGranted`, `RoleRevoked`, and `RoleAdminChanged` events through the reviewed block
3. verify log completeness, confirmation depth, and reorg handling
4. derive candidate role holders only from the complete event history
5. confirm each derived holder with `hasRole` at a shared block from both RPC providers
6. classify each current holder as EOA, multisig, proxy, or contract and trace any relevant control boundary
7. document role-admin relationships and the authority required to call `execute` or `executeCall`

Until that work is complete, no operation involving WETH may become execution-eligible.

## Evidence references

- issue #68 audit comment for run `29822600084`
- issue #62 WETH proxy evidence
- repository evidence objects `ROBINHOOD_WETH_PROXY_EVIDENCE` and `ROBINHOOD_WETH_CONTROL_EVIDENCE`
- ERC-1967 proxy storage-slot standard

Nothing in this document authorizes capital deployment or constitutes financial advice.
