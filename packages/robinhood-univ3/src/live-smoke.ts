import { pathToFileURL } from 'node:url'
import { getAddress, zeroAddress, type Address } from 'viem'
import { readVerifiedPoolSnapshot } from './index.js'
import { createRobinhoodPublicClient, createViemReadClient } from './live-client.js'
import { ROBINHOOD_REGISTRY_EVIDENCE, verifyRobinhoodRegistryBytecode } from './registry-evidence.js'
import {
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_TOKENS,
  ROBINHOOD_UNISWAP_V3,
  ROBINHOOD_WETH_USDG_POOLS,
  SUPPORTED_FEE_TIERS,
} from './registry.js'

type ContractProbe = {
  name: string
  address: Address
  hasCode: boolean
  byteLength: number
  expectedBytecodeHash: `0x${string}`
  actualBytecodeHash: `0x${string}` | null
  status: 'verified' | 'unregistered' | 'missing-code' | 'hash-mismatch'
}

export async function runLiveSmoke(rpcUrl = process.env.ROBINHOOD_RPC_URL): Promise<void> {
  const publicClient = createRobinhoodPublicClient(rpcUrl ? { rpcUrl } : {})
  const chainId = await publicClient.getChainId()
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error(`Unexpected chain ID: ${chainId}`)
  }

  const contracts = await Promise.all(
    ROBINHOOD_REGISTRY_EVIDENCE.entries.map(async (entry) => {
      const bytecode = await publicClient.getBytecode({ address: entry.address })
      const verification = verifyRobinhoodRegistryBytecode(entry.address, bytecode)
      return {
        name: entry.name,
        address: entry.address,
        hasCode: bytecode !== undefined && bytecode !== '0x',
        byteLength: verification.actualByteLength ?? 0,
        expectedBytecodeHash: entry.bytecodeHash,
        actualBytecodeHash: verification.actualHash,
        status: verification.status,
      } satisfies ContractProbe
    }),
  )

  const invalidContracts = contracts.filter((contract) => contract.status !== 'verified')
  if (invalidContracts.length > 0) {
    throw new Error(
      `Registry bytecode verification failed: ${invalidContracts
        .map((contract) => `${contract.name}:${contract.status}`)
        .join(', ')}`,
    )
  }

  const readClient = createViemReadClient(publicClient)
  const pools = []
  for (const feeTier of SUPPORTED_FEE_TIERS) {
    const pinnedPool = ROBINHOOD_WETH_USDG_POOLS.find((pool) => pool.feeTier === feeTier)
    if (pinnedPool === undefined) throw new Error(`Missing pinned pool for fee tier ${feeTier}`)

    const poolAddress = getAddress(
      await readClient.getPool(ROBINHOOD_TOKENS.wrappedNative, ROBINHOOD_TOKENS.usdg, feeTier),
    )
    if (poolAddress === zeroAddress || poolAddress !== pinnedPool.poolAddress) {
      throw new Error(
        `Factory pool mismatch for fee tier ${feeTier}: expected ${pinnedPool.poolAddress}, received ${poolAddress}`,
      )
    }

    const snapshot = await readVerifiedPoolSnapshot({
      client: readClient,
      poolAddress,
      token0: ROBINHOOD_TOKENS.wrappedNative,
      token1: ROBINHOOD_TOKENS.usdg,
      feeTier,
    })
    if (snapshot.value.tickSpacing !== pinnedPool.tickSpacing) {
      throw new Error(
        `Pool tick spacing mismatch for fee tier ${feeTier}: expected ${pinnedPool.tickSpacing}, received ${snapshot.value.tickSpacing}`,
      )
    }
    pools.push(snapshot)
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'read-only',
        chainId,
        rpcSource: rpcUrl ? 'configured' : 'public-default',
        registryEvidence: {
          status: ROBINHOOD_REGISTRY_EVIDENCE.status,
          reviewedAt: ROBINHOOD_REGISTRY_EVIDENCE.reviewedAt,
          auditRunId: ROBINHOOD_REGISTRY_EVIDENCE.auditRunId,
          sourceAgreement: ROBINHOOD_REGISTRY_EVIDENCE.sourceAgreement,
          executionEligible: ROBINHOOD_REGISTRY_EVIDENCE.executionEligible,
          executionBlockers: ROBINHOOD_REGISTRY_EVIDENCE.executionBlockers,
        },
        contracts,
        pair: {
          tokenA: ROBINHOOD_UNISWAP_V3.wrappedNative,
          tokenB: ROBINHOOD_TOKENS.usdg,
        },
        pools,
        disclaimer:
          'This smoke check validates read-only registry evidence only. It does not authorize wallet connections, approvals, signing, transaction submission, or capital deployment.',
      },
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    )}\n`,
  )
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  runLiveSmoke().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
