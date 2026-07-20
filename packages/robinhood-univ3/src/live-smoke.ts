import { pathToFileURL } from 'node:url'
import { getAddress, zeroAddress, type Address } from 'viem'
import { readVerifiedPoolSnapshot } from './index.js'
import { createRobinhoodPublicClient, createViemReadClient } from './live-client.js'
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_UNISWAP_V3, SUPPORTED_FEE_TIERS } from './registry.js'

const ROBINHOOD_USDG = getAddress('0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168')

type ContractProbe = {
  name: string
  address: Address
  hasCode: boolean
}

const contractTargets: ReadonlyArray<Pick<ContractProbe, 'name' | 'address'>> = [
  { name: 'factory', address: ROBINHOOD_UNISWAP_V3.factory },
  { name: 'wrappedNative', address: ROBINHOOD_UNISWAP_V3.wrappedNative },
  { name: 'usdg', address: ROBINHOOD_USDG },
]

export async function runLiveSmoke(rpcUrl = process.env.ROBINHOOD_RPC_URL): Promise<void> {
  const publicClient = createRobinhoodPublicClient(rpcUrl ? { rpcUrl } : {})
  const chainId = await publicClient.getChainId()
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error(`Unexpected chain ID: ${chainId}`)
  }

  const contracts = await Promise.all(
    contractTargets.map(async ({ name, address }) => {
      const bytecode = await publicClient.getBytecode({ address })
      return {
        name,
        address,
        hasCode: bytecode !== undefined && bytecode !== '0x',
      } satisfies ContractProbe
    }),
  )

  const missingCode = contracts.filter((contract) => !contract.hasCode)
  if (missingCode.length > 0) {
    throw new Error(`Missing contract bytecode: ${missingCode.map((contract) => contract.name).join(', ')}`)
  }

  const readClient = createViemReadClient(publicClient)
  const pools = []
  for (const feeTier of SUPPORTED_FEE_TIERS) {
    const poolAddress = await readClient.getPool(ROBINHOOD_UNISWAP_V3.wrappedNative, ROBINHOOD_USDG, feeTier)
    if (poolAddress === zeroAddress) continue

    const snapshot = await readVerifiedPoolSnapshot({
      client: readClient,
      poolAddress,
      token0: ROBINHOOD_UNISWAP_V3.wrappedNative,
      token1: ROBINHOOD_USDG,
      feeTier,
    })
    pools.push(snapshot)
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'read-only',
        chainId,
        rpcSource: rpcUrl ? 'configured' : 'public-default',
        contracts,
        pair: {
          tokenA: ROBINHOOD_UNISWAP_V3.wrappedNative,
          tokenB: ROBINHOOD_USDG,
        },
        pools,
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
