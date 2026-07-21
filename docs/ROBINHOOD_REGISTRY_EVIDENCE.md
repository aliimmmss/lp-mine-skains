# Robinhood registry evidence

## Status

The Robinhood Uniswap v3 registry is **read-only verified** as of `2026-07-21T09:06:13.519Z`.

It is **not execution-eligible**. This evidence supports indexing, monitoring, and fail-closed read verification only. It does not authorize wallet connections, token approvals, calldata construction, signing, transaction submission, or capital deployment.

## Verification record

GitHub Actions run `29816884050` compared two independently configured RPC paths:

- the official public Robinhood Chain RPC from the pinned registry
- the configured monitoring RPC, with its endpoint omitted from output

Both sources reported chain ID `4663`, agreed on every bytecode hash below, returned matching WETH/USDG pools from the pinned factory for every supported fee tier, and returned token metadata `WETH/18` and `USDG/6`.

The two sources were near the same chain tip during the audit:

- official public source: block `15442029`
- configured monitoring source: block `15442048`

Evidence comment: <https://github.com/aliimmmss/lp-mine-skains/issues/54#issuecomment-5032123113>

## Pinned bytecode evidence

| Entry | Address | Byte length | Keccak-256 bytecode hash |
| --- | --- | ---: | --- |
| Factory | `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA` | 24535 | `0xec72b1abd1f2faee020cfea9c646bd8994f9fb389054f6e574f103a895091739` |
| Position manager | `0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3` | 24384 | `0x0a493d1af3d0f25fed8efa205244ebee14114267a08647fc38c515c7cd6ead4f` |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | 2202 | `0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 170 | `0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6` |
| WETH/USDG 0.01% | `0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca` | 22142 | `0x3298b5dd4e6f115074c526a55ad05a36fd73a0034ac22ec6cbaab32cc9c1e8d2` |
| WETH/USDG 0.05% | `0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a` | 22142 | `0x74a16c3b1b4ac8903c54a9edad666d4c87512cb78ed0723538acd84d1b56c5b5` |
| WETH/USDG 0.30% | `0xa9188730Fe85Be88ad499D7d52B099e800fB0334` | 22142 | `0x0fc31cfc533a5922261eaa33ff62c43ffd3839dc5204fb6dbbe6effd7bd9d63d` |
| WETH/USDG 1.00% | `0x5f009E071F07e92B6C624e83F52F17bBDa34680D` | 22142 | `0xe20600974a722992eb4622b85b2a77ccac5e4aaa2f781bd93cae4334ca18d686` |

## Factory results

For WETH `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` and USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, both RPC sources returned the pinned pool address and code for each fee tier:

| Fee tier | Tick spacing | Factory result |
| ---: | ---: | --- |
| 100 | 1 | `0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca` |
| 500 | 10 | `0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a` |
| 3000 | 60 | `0xa9188730Fe85Be88ad499D7d52B099e800fB0334` |
| 10000 | 200 | `0x5f009E071F07e92B6C624e83F52F17bBDa34680D` |

## Running the fail-closed smoke check

After installing and building the repository:

```bash
npm run --workspace @lp-mine/robinhood-univ3 smoke:live
```

Set `ROBINHOOD_RPC_URL` to check a configured provider. Without it, the command uses the pinned official public RPC.

The command fails when:

- the chain ID differs from `4663`
- any registered contract or pool has no code
- any bytecode hash or byte length differs from the pinned evidence
- the factory returns a different or zero pool address
- a pool reports an unexpected tick spacing
- a canonical pool snapshot fails its existing immutable-metadata checks

## External explorer inconsistency

During the readiness review, indexed Blockscout page/search results classified some pinned addresses as EOAs. The direct two-source RPC audit found deployed bytecode and matching factory results at those same addresses. Explorer presentation is therefore treated as supporting context rather than execution evidence. Any future disagreement must fail closed and be re-verified from current chain state through multiple sources.

## Remaining execution blockers

No entry in this evidence registry is execution-eligible. Before a write-capable target can become eligible, issue #39 still requires:

- selection and approval of one narrowly scoped first operation
- verified source and ABI provenance
- allowed function selectors and argument policies
- upgradeability, proxy, owner, and admin-control review
- exact approval policy and revocation path
- exact-call simulation and provider-disagreement policy
- human-readable review and cancellation behavior
- receipt reconciliation and incident-disable controls

Bytecode agreement is necessary but not sufficient for execution safety.
