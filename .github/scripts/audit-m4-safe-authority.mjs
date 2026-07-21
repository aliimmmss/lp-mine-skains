/* global AbortSignal, fetch */
import process from 'node:process'
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  parseAbi,
  zeroAddress,
} from 'viem'

const CHAIN_ID = 4663
const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CONFIGURED_RPC = process.env.CONFIGURED_ROBINHOOD_RPC_URL
const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com/api/v2'

const EXPECTED_SINGLETON = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')
const EXPECTED_PROXY_LENGTH = 171
const EXPECTED_PROXY_HASH = '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c'
const CONFIRMATIONS = 12n
const MODULE_SENTINEL = getAddress('0x0000000000000000000000000000000000000001')
const MODULE_PAGE_SIZE = 50n
const MODULE_MAX_PAGES = 20
const MODULE_MAX_COUNT = 500

const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
const BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
const SINGLETON_SLOT = `0x${'00'.repeat(32)}`

const SAFES = [
  {
    issueNumber: 90,
    label: 'controller-executor-safe',
    address: getAddress('0x6b9F63817F1442e40Bb9c3C2207758934C323FdC'),
  },
  {
    issueNumber: 93,
    label: 'timelock-governance-safe',
    address: getAddress('0x4C0360aFedD31e53718e4343F95E40b692402462'),
  },
]

const SAFE_ABI = parseAbi([
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function nonce() view returns (uint256)',
  'function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)',
  'function VERSION() view returns (string)',
  'function domainSeparator() view returns (bytes32)',
  'function getGuard() view returns (address)',
])

function safeError(error) {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/https?:\/\/\S+/gi, '[endpoint omitted]').slice(0, 500)
}

function rpcClient(url) {
  return createPublicClient({ transport: http(url, { timeout: 20_000, retryCount: 2 }) })
}

function slotAddress(value) {
  if (!value || value === '0x' || /^0x0+$/.test(value)) return null
  const address = getAddress(`0x${value.slice(-40)}`)
  return address === zeroAddress ? null : address
}

function codeEvidence(bytecode) {
  if (!bytecode || bytecode === '0x') {
    return { hasCode: false, byteLength: 0, bytecodeHash: null }
  }
  return {
    hasCode: true,
    byteLength: (bytecode.length - 2) / 2,
    bytecodeHash: keccak256(bytecode),
  }
}

function comparable(value) {
  return { ...value, label: null }
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) return { ok: false, status: response.status, value: null }
    return { ok: true, status: response.status, value: await response.json() }
  } catch (error) {
    return { ok: false, status: null, value: null, error: safeError(error) }
  }
}

function abiArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function sourceText(value) {
  const source = value?.source_code
  if (source === null || source === undefined) return ''
  return typeof source === 'string' ? source : JSON.stringify(source)
}

function exactViewFunction(abi, name, inputs, outputs) {
  return abi.some(
    (entry) =>
      entry?.type === 'function' &&
      entry.name === name &&
      ['view', 'pure'].includes(entry.stateMutability) &&
      JSON.stringify(entry.inputs?.map((input) => input.type) ?? []) === JSON.stringify(inputs) &&
      JSON.stringify(entry.outputs?.map((output) => output.type) ?? []) === JSON.stringify(outputs),
  )
}

function extractStorageSlot(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = text.match(new RegExp(`${escapedName}\\s*=\\s*(0x[0-9a-fA-F]{64})`, 'i'))
  return match ? match[1].toLowerCase() : null
}

async function explorerMetadata(address) {
  const [addressResponse, contractResponse] = await Promise.all([
    fetchJson(`${BLOCKSCOUT}/addresses/${address}`),
    fetchJson(`${BLOCKSCOUT}/smart-contracts/${address}`),
  ])
  const abi = abiArray(contractResponse.value?.abi)
  const text = sourceText(contractResponse.value)
  return {
    addressRequestOk: addressResponse.ok,
    contractRequestOk: contractResponse.ok,
    addressSummary: addressResponse.value
      ? {
          isContract: addressResponse.value.is_contract ?? null,
          isVerified: addressResponse.value.is_verified ?? null,
          name: addressResponse.value.name ?? null,
          implementationName: addressResponse.value.implementation_name ?? null,
          creationTransactionHash:
            addressResponse.value.creation_tx_hash ??
            addressResponse.value.creation_transaction_hash ??
            addressResponse.value.creation_transaction?.hash ??
            null,
        }
      : null,
    contract: contractResponse.value
      ? {
          name: contractResponse.value.name ?? null,
          isVerified: contractResponse.value.is_verified ?? null,
          filePath: contractResponse.value.file_path ?? null,
          proxyType: contractResponse.value.proxy_type ?? null,
          implementations: contractResponse.value.implementations ?? [],
          sourceLength: text.length,
          sourceSlots: {
            guard: extractStorageSlot(text, 'GUARD_STORAGE_SLOT'),
            fallbackHandler: extractStorageSlot(text, 'FALLBACK_HANDLER_STORAGE_SLOT'),
          },
          readInterfaces: {
            owners: exactViewFunction(abi, 'getOwners', [], ['address[]']),
            threshold: exactViewFunction(abi, 'getThreshold', [], ['uint256']),
            nonce: exactViewFunction(abi, 'nonce', [], ['uint256']),
            modules: exactViewFunction(abi, 'getModulesPaginated', ['address', 'uint256'], ['address[]', 'address']),
            version: exactViewFunction(abi, 'VERSION', [], ['string']),
            domainSeparator: exactViewFunction(abi, 'domainSeparator', [], ['bytes32']),
            guard: exactViewFunction(abi, 'getGuard', [], ['address']),
          },
          functionNames: [...new Set(abi.filter((entry) => entry?.type === 'function').map((entry) => entry.name))]
            .filter(Boolean)
            .sort(),
        }
      : null,
  }
}

async function latest(label, url) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  try {
    const rpc = rpcClient(url)
    const [chainId, blockNumber] = await Promise.all([rpc.getChainId(), rpc.getBlockNumber()])
    return {
      label,
      endpoint: 'omitted',
      status: chainId === CHAIN_ID ? 'available' : 'wrong-chain',
      chainId,
      blockNumber,
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: safeError(error) }
  }
}

async function deploymentBoundary(safe) {
  const metadata = await explorerMetadata(safe.address)
  const transactionHash = metadata.addressSummary?.creationTransactionHash ?? null
  if (!transactionHash) {
    return { status: 'unavailable', blockNumber: null, transactionHash: null, metadata }
  }
  const transaction = await fetchJson(`${BLOCKSCOUT}/transactions/${transactionHash}`)
  const rawBlock = transaction.value?.block_number ?? transaction.value?.blockNumber ?? null
  return {
    status: transaction.ok && rawBlock !== null ? 'verified' : 'unavailable',
    blockNumber: rawBlock === null ? null : BigInt(rawBlock),
    transactionHash,
    metadata,
  }
}

async function archiveBoundary(label, url, safe, deploymentBlock) {
  if (!url || deploymentBlock === null) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-or-deployment-unavailable' }
  }
  const rpc = rpcClient(url)
  try {
    const [before, at] = await Promise.all([
      rpc.getBytecode({ address: safe.address, blockNumber: deploymentBlock - 1n }),
      rpc.getBytecode({ address: safe.address, blockNumber: deploymentBlock }),
    ])
    return {
      label,
      endpoint: 'omitted',
      status: 'archive-verified',
      before: codeEvidence(before),
      at: codeEvidence(at),
    }
  } catch (error) {
    const message = safeError(error)
    return {
      label,
      endpoint: 'omitted',
      status: /missing trie node|historical state|archive/i.test(message) ? 'non-archive' : 'unavailable',
      error: message,
    }
  }
}

async function readModules(rpc, safeAddress, blockNumber) {
  const modules = []
  const seenStarts = new Set()
  const seenModules = new Set()
  let start = MODULE_SENTINEL
  let pages = 0

  while (true) {
    if (pages >= MODULE_MAX_PAGES) throw new Error(`module-page-budget-exhausted:${MODULE_MAX_PAGES}`)
    const startKey = start.toLowerCase()
    if (seenStarts.has(startKey)) throw new Error(`module-pagination-cycle:${start}`)
    seenStarts.add(startKey)

    const [page, next] = await rpc.readContract({
      address: safeAddress,
      abi: SAFE_ABI,
      functionName: 'getModulesPaginated',
      args: [start, MODULE_PAGE_SIZE],
      blockNumber,
    })
    pages += 1
    for (const module of page.map((address) => getAddress(address))) {
      if (module === MODULE_SENTINEL || module === zeroAddress) throw new Error(`invalid-module:${module}`)
      const key = module.toLowerCase()
      if (seenModules.has(key)) throw new Error(`duplicate-module:${module}`)
      seenModules.add(key)
      modules.push(module)
      if (modules.length > MODULE_MAX_COUNT) throw new Error(`module-count-budget-exhausted:${MODULE_MAX_COUNT}`)
    }

    const normalizedNext = getAddress(next)
    if (normalizedNext === MODULE_SENTINEL) {
      return { status: 'complete', pages, modules, next: normalizedNext }
    }
    start = normalizedNext
  }
}

async function readSafeState(label, url, safe, blockNumber, implementationMetadata) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  const rpc = rpcClient(url)
  const interfaces = implementationMetadata.contract?.readInterfaces ?? {}
  const guardSlot = implementationMetadata.contract?.sourceSlots?.guard ?? null
  const fallbackSlot = implementationMetadata.contract?.sourceSlots?.fallbackHandler ?? null

  try {
    if (!interfaces.owners || !interfaces.threshold || !interfaces.nonce || !interfaces.modules) {
      throw new Error('required-safe-read-interface-missing')
    }
    if (!guardSlot || !fallbackSlot) throw new Error('safe-authority-storage-slot-unresolved')

    const [bytecode, singletonRaw, guardRaw, fallbackRaw, ownersRaw, threshold, nonce, modules] = await Promise.all([
      rpc.getBytecode({ address: safe.address, blockNumber }),
      rpc.getStorageAt({ address: safe.address, slot: SINGLETON_SLOT, blockNumber }),
      rpc.getStorageAt({ address: safe.address, slot: guardSlot, blockNumber }),
      rpc.getStorageAt({ address: safe.address, slot: fallbackSlot, blockNumber }),
      rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'getOwners', blockNumber }),
      rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'getThreshold', blockNumber }),
      rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'nonce', blockNumber }),
      readModules(rpc, safe.address, blockNumber),
    ])

    const owners = ownersRaw.map((address) => getAddress(address))
    const version = interfaces.version
      ? await rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'VERSION', blockNumber })
      : null
    const domainSeparator = interfaces.domainSeparator
      ? await rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'domainSeparator', blockNumber })
      : null
    const guardFromFunction = interfaces.guard
      ? getAddress(await rpc.readContract({ address: safe.address, abi: SAFE_ABI, functionName: 'getGuard', blockNumber }))
      : null
    const guard = slotAddress(guardRaw)
    if (guardFromFunction && guardFromFunction !== (guard ?? zeroAddress)) {
      throw new Error(`guard-function-storage-mismatch:${guardFromFunction}:${guard ?? zeroAddress}`)
    }

    return {
      label,
      endpoint: 'omitted',
      status: 'verified',
      blockNumber: blockNumber.toString(),
      code: codeEvidence(bytecode),
      singleton: slotAddress(singletonRaw),
      owners,
      threshold: threshold.toString(),
      nonce: nonce.toString(),
      modules,
      guard,
      fallbackHandler: slotAddress(fallbackRaw),
      version,
      domainSeparator,
      interfaces,
      sourceSlots: { guard: guardSlot, fallbackHandler: fallbackSlot },
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: safeError(error) }
  }
}

async function readAddressEvidence(label, url, address, blockNumber) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', address }
  const rpc = rpcClient(url)
  try {
    const [bytecode, implementationRaw, adminRaw, beaconRaw, singletonRaw] = await Promise.all([
      rpc.getBytecode({ address, blockNumber }),
      rpc.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: BEACON_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: SINGLETON_SLOT, blockNumber }),
    ])
    return {
      label,
      endpoint: 'omitted',
      status: 'verified',
      address,
      code: codeEvidence(bytecode),
      slots: {
        implementation: slotAddress(implementationRaw),
        admin: slotAddress(adminRaw),
        beacon: slotAddress(beaconRaw),
        singleton: slotAddress(singletonRaw),
      },
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', address, error: safeError(error) }
  }
}

async function classifyAddress(address, endpoints, blockNumber) {
  const explorer = await explorerMetadata(address)
  const providers = await Promise.all(
    endpoints.map(({ label, url }) => readAddressEvidence(label, url, address, blockNumber)),
  )
  const agreement =
    providers.length === 2 &&
    providers.every((provider) => provider.status === 'verified') &&
    JSON.stringify(comparable(providers[0])) === JSON.stringify(comparable(providers[1]))
  const first = providers.find((provider) => provider.status === 'verified')
  let classification = 'unresolved'
  if (agreement && first) {
    if (!first.code.hasCode) classification = 'eoa'
    else if (explorer.contract?.proxyType === 'master_copy') classification = 'safe-proxy'
    else if (first.slots.implementation || first.slots.beacon) classification = 'eip1967-proxy'
    else classification = 'contract-unclassified'
  }
  return { address, agreement, classification, providers, explorer }
}

function validateSafeState(state) {
  const reasons = []
  const ownerKeys = state.owners.map((owner) => owner.toLowerCase())
  if (new Set(ownerKeys).size !== ownerKeys.length) reasons.push('duplicate-owners')
  if (state.owners.some((owner) => owner === zeroAddress || owner === MODULE_SENTINEL)) {
    reasons.push('invalid-owner-sentinel')
  }
  const threshold = BigInt(state.threshold)
  if (threshold < 1n || threshold > BigInt(state.owners.length)) reasons.push('invalid-threshold')
  if (state.modules.status !== 'complete') reasons.push('incomplete-modules')
  if (state.singleton !== EXPECTED_SINGLETON) reasons.push('unexpected-singleton')
  if (state.code.byteLength !== EXPECTED_PROXY_LENGTH || state.code.bytecodeHash !== EXPECTED_PROXY_HASH) {
    reasons.push('unexpected-proxy-runtime')
  }
  return { valid: reasons.length === 0, reasons }
}

const endpoints = [
  { label: 'official-public', url: PUBLIC_RPC },
  { label: 'configured-alchemy', url: CONFIGURED_RPC },
]

const tips = await Promise.all(endpoints.map(({ label, url }) => latest(label, url)))
const availableTips = tips.filter((tip) => tip.status === 'available')
const minimumTip = availableTips.reduce(
  (minimum, tip) => (tip.blockNumber < minimum ? tip.blockNumber : minimum),
  availableTips[0]?.blockNumber ?? 0n,
)
const endBlock = minimumTip > CONFIRMATIONS ? minimumTip - CONFIRMATIONS : 0n
const endBlocks =
  availableTips.length === 2 && endBlock > 0n
    ? await Promise.all(
        endpoints.map(async ({ label, url }) => {
          const block = await rpcClient(url).getBlock({ blockNumber: endBlock })
          return { label, blockNumber: endBlock.toString(), hash: block.hash, timestamp: block.timestamp.toString() }
        }),
      )
    : []
const endBlockAgreement =
  endBlocks.length === 2 && endBlocks[0].hash === endBlocks[1].hash && endBlocks[0].timestamp === endBlocks[1].timestamp

const implementationMetadata = await explorerMetadata(EXPECTED_SINGLETON)
const implementationEvidence = await classifyAddress(EXPECTED_SINGLETON, endpoints, endBlock)
const implementationAgreement =
  implementationEvidence.agreement &&
  implementationEvidence.providers.every((provider) => provider.code.hasCode) &&
  implementationMetadata.contract?.name === 'SafeL2'

const safeResults = []
for (const safe of SAFES) {
  const deployment = await deploymentBoundary(safe)
  const archiveEvidence = await Promise.all(
    endpoints.map(({ label, url }) => archiveBoundary(label, url, safe, deployment.blockNumber)),
  )
  const configuredArchive = archiveEvidence.find((entry) => entry.label === 'configured-alchemy')
  const publicArchive = archiveEvidence.find((entry) => entry.label === 'official-public')
  const deploymentAgreement =
    deployment.status === 'verified' &&
    configuredArchive?.status === 'archive-verified' &&
    !configuredArchive.before.hasCode &&
    configuredArchive.at.hasCode &&
    configuredArchive.at.byteLength === EXPECTED_PROXY_LENGTH &&
    configuredArchive.at.bytecodeHash === EXPECTED_PROXY_HASH &&
    ['archive-verified', 'non-archive'].includes(publicArchive?.status)

  const providers =
    endBlockAgreement && implementationAgreement
      ? await Promise.all(
          endpoints.map(({ label, url }) => readSafeState(label, url, safe, endBlock, implementationMetadata)),
        )
      : []
  const providerAgreement =
    providers.length === 2 &&
    providers.every((provider) => provider.status === 'verified') &&
    JSON.stringify(comparable(providers[0])) === JSON.stringify(comparable(providers[1]))
  const state = providers.find((provider) => provider.status === 'verified') ?? null
  const validation = state ? validateSafeState(state) : { valid: false, reasons: ['state-unavailable'] }

  const relatedAddresses = state
    ? [
        ...state.owners,
        ...state.modules.modules,
        ...(state.guard ? [state.guard] : []),
        ...(state.fallbackHandler ? [state.fallbackHandler] : []),
      ]
    : []
  const relatedEvidence = []
  for (const address of [...new Set(relatedAddresses)]) {
    relatedEvidence.push(await classifyAddress(address, endpoints, endBlock))
  }
  const relatedAgreement = relatedEvidence.every((entry) => entry.agreement)
  const authorityBoundaries = relatedEvidence
    .filter((entry) => entry.classification !== 'eoa')
    .map((entry) => ({
      address: entry.address,
      classification: entry.classification,
      roles: {
        owner: state?.owners.includes(entry.address) ?? false,
        module: state?.modules.modules.includes(entry.address) ?? false,
        guard: state?.guard === entry.address,
        fallbackHandler: state?.fallbackHandler === entry.address,
      },
    }))

  const verified =
    availableTips.length === 2 &&
    endBlockAgreement &&
    implementationAgreement &&
    deploymentAgreement &&
    providerAgreement &&
    validation.valid &&
    relatedAgreement

  safeResults.push({
    issueNumber: safe.issueNumber,
    label: safe.label,
    address: safe.address,
    deploymentBoundary: {
      agreement: deploymentAgreement,
      blockNumber: deployment.blockNumber?.toString() ?? null,
      transactionHash: deployment.transactionHash,
      explorer: deployment.metadata,
      archiveEvidence,
    },
    providerAgreement,
    providers,
    state,
    validation,
    relatedEvidence,
    relatedAgreement,
    authorityBoundaries,
    status: verified ? 'verified' : 'unresolved',
    controlStatus:
      verified && authorityBoundaries.length === 0
        ? 'safe-controls-verified'
        : verified
          ? 'safe-controls-verified-authority-boundaries-recorded'
          : 'unresolved',
  })
}

const result = {
  mode: 'read-only',
  generatedAt: new Date().toISOString(),
  confirmations: CONFIRMATIONS.toString(),
  tips: tips.map((tip) => ({ ...tip, blockNumber: tip.blockNumber?.toString() ?? null })),
  endBoundary: { blockNumber: endBlock.toString(), agreement: endBlockAgreement, providers: endBlocks },
  expectedSingleton: EXPECTED_SINGLETON,
  implementationMetadata,
  implementationEvidence,
  implementationAgreement,
  safes: safeResults,
  executionEligible: false,
  disclaimer:
    'This audit reads Safe owners, threshold, nonce, modules, guard, fallback handler, version, domain separator, bytecode, storage, and verified metadata only. It does not call getTransactionHash, encode or simulate a Safe transaction, connect a wallet, request signatures, submit transactions, move funds, or recommend capital deployment.',
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
