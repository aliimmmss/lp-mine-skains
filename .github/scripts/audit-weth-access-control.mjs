/* global AbortSignal, fetch */
import process from 'node:process'
import { createHash } from 'node:crypto'
import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  parseAbi,
  toBytes,
  toHex,
  zeroAddress,
} from 'viem'

const CHAIN_ID = 4663
const PUBLIC_RPC = 'https://rpc.mainnet.chain.robinhood.com'
const CONFIGURED_RPC = process.env.CONFIGURED_ROBINHOOD_RPC_URL
const CONTROLLER = getAddress('0x2A153c6A1B66DBc930a8d7017230ab0253005C09')
const EXPECTED_DEPLOYMENT_BLOCK = 2n
const EXPECTED_CREATION_TX = '0x05317cd173ba8e973c7e88aeb7f7e56eb22cf05c12552d4283c993dbb1f56b12'
const EXPECTED_PROXY_LENGTH = 2_202
const EXPECTED_PROXY_HASH = '0x5706be52f64875fee65a2cec0d80e47a23d8793cbe85d214b48445e2d05f5353'
const CONFIRMATIONS = 12n
const INITIAL_LOG_RANGE = 500_000n
const BLOCKSCOUT = 'https://robinhoodchain.blockscout.com/api/v2'
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'
const BEACON_SLOT = '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'
const ZERO_ROLE = `0x${'00'.repeat(32)}`

const ROLE_ABI = parseAbi([
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function ADMIN_ROLE() view returns (bytes32)',
  'function EXECUTOR_ROLE() view returns (bytes32)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function hasRole(bytes32 role,address account) view returns (bool)',
])
const EVENT_ABI = parseAbi([
  'event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)',
  'event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)',
  'event RoleAdminChanged(bytes32 indexed role,bytes32 indexed previousAdminRole,bytes32 indexed newAdminRole)',
])
const EVENT_TOPICS = [
  keccak256(toBytes('RoleGranted(bytes32,address,address)')),
  keccak256(toBytes('RoleRevoked(bytes32,address,address)')),
  keccak256(toBytes('RoleAdminChanged(bytes32,bytes32,bytes32)')),
]

function safeError(error) {
  const value = error instanceof Error ? error.message : String(error)
  return value.replace(/https?:\/\/\S+/gi, '[endpoint omitted]').slice(0, 500)
}

function digest(value) {
  return `0x${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
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

function exactFunction(abi, name, inputs, outputs) {
  return abi.some(
    (entry) =>
      entry?.type === 'function' &&
      entry.name === name &&
      entry.stateMutability === 'view' &&
      JSON.stringify(entry.inputs?.map((input) => input.type) ?? []) === JSON.stringify(inputs) &&
      JSON.stringify(entry.outputs?.map((output) => output.type) ?? []) === JSON.stringify(outputs),
  )
}

function compactContractMetadata(value) {
  if (!value || typeof value !== 'object') return null
  const abi = abiArray(value.abi)
  const source = value.source_code
  const serializedSource =
    source === null || source === undefined || source === ''
      ? null
      : typeof source === 'string'
        ? source
        : JSON.stringify(source)
  return {
    name: value.name ?? null,
    isVerified: value.is_verified ?? null,
    isPartiallyVerified: value.is_partially_verified ?? null,
    compilerVersion: value.compiler_version ?? null,
    filePath: value.file_path ?? null,
    proxyType: value.proxy_type ?? null,
    implementations: value.implementations ?? [],
    source:
      serializedSource === null
        ? { present: false, length: 0, sha256: null }
        : { present: true, length: serializedSource.length, sha256: digest(serializedSource) },
    readInterfaces: {
      owner: exactFunction(abi, 'owner', [], ['address']),
      getOwners: exactFunction(abi, 'getOwners', [], ['address[]']),
      getThreshold: exactFunction(abi, 'getThreshold', [], ['uint256']),
    },
    functionNames: [...new Set(abi.filter((entry) => entry?.type === 'function').map((entry) => entry.name))]
      .filter(Boolean)
      .sort(),
  }
}

async function explorerMetadata(address) {
  const [addressResponse, contractResponse] = await Promise.all([
    fetchJson(`${BLOCKSCOUT}/addresses/${address}`),
    fetchJson(`${BLOCKSCOUT}/smart-contracts/${address}`),
  ])
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
    contract: compactContractMetadata(contractResponse.value),
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

async function blockscoutDeployment() {
  const address = await explorerMetadata(CONTROLLER)
  const transactionHash = address.addressSummary?.creationTransactionHash ?? null
  if (!transactionHash) return { status: 'unavailable', transactionHash: null, blockNumber: null, address }
  const transaction = await fetchJson(`${BLOCKSCOUT}/transactions/${transactionHash}`)
  const rawBlock = transaction.value?.block_number ?? transaction.value?.blockNumber ?? null
  return {
    status: transaction.ok && rawBlock !== null ? 'verified' : 'unavailable',
    transactionHash,
    blockNumber: rawBlock === null ? null : BigInt(rawBlock),
    address,
  }
}

async function archiveBoundary(label, url) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  const rpc = rpcClient(url)
  try {
    const [before, at] = await Promise.all([
      rpc.getBytecode({ address: CONTROLLER, blockNumber: EXPECTED_DEPLOYMENT_BLOCK - 1n }),
      rpc.getBytecode({ address: CONTROLLER, blockNumber: EXPECTED_DEPLOYMENT_BLOCK }),
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

async function rawLogs(rpc, fromBlock, toBlock) {
  return rpc.request({
    method: 'eth_getLogs',
    params: [
      {
        address: CONTROLLER,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(toBlock),
        topics: [EVENT_TOPICS],
      },
    ],
  })
}

async function logsAdaptive(rpc, fromBlock, toBlock) {
  try {
    return await rawLogs(rpc, fromBlock, toBlock)
  } catch (error) {
    if (fromBlock === toBlock) throw new Error(`single-block-log-read-failed:${fromBlock}:${safeError(error)}`)
    const middle = (fromBlock + toBlock) / 2n
    const left = await logsAdaptive(rpc, fromBlock, middle)
    const right = await logsAdaptive(rpc, middle + 1n, toBlock)
    return [...left, ...right]
  }
}

function normalizeLog(log) {
  if (log.removed === true) throw new Error(`removed-log:${log.transactionHash}:${log.logIndex}`)
  const decoded = decodeEventLog({ abi: EVENT_ABI, data: log.data, topics: log.topics, strict: true })
  const base = {
    blockNumber: BigInt(log.blockNumber).toString(),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: Number(BigInt(log.transactionIndex)),
    logIndex: Number(BigInt(log.logIndex)),
    eventName: decoded.eventName,
  }
  if (decoded.eventName === 'RoleGranted' || decoded.eventName === 'RoleRevoked') {
    return {
      ...base,
      role: decoded.args.role.toLowerCase(),
      account: getAddress(decoded.args.account),
      sender: getAddress(decoded.args.sender),
    }
  }
  return {
    ...base,
    role: decoded.args.role.toLowerCase(),
    previousAdminRole: decoded.args.previousAdminRole.toLowerCase(),
    newAdminRole: decoded.args.newAdminRole.toLowerCase(),
  }
}

function eventSort(left, right) {
  const block = BigInt(left.blockNumber) - BigInt(right.blockNumber)
  if (block !== 0n) return block < 0n ? -1 : 1
  if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex
  return left.logIndex - right.logIndex
}

async function scanEvents(label, url, startBlock, endBlock) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', events: [], error: 'provider-not-configured' }
  const rpc = rpcClient(url)
  const raw = []
  try {
    for (let from = startBlock; from <= endBlock; from += INITIAL_LOG_RANGE) {
      const to = from + INITIAL_LOG_RANGE - 1n > endBlock ? endBlock : from + INITIAL_LOG_RANGE - 1n
      raw.push(...(await logsAdaptive(rpc, from, to)))
    }
    const byKey = new Map()
    for (const log of raw) {
      const event = normalizeLog(log)
      const key = `${event.transactionHash}:${event.logIndex}`
      const existing = byKey.get(key)
      if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
        throw new Error(`conflicting-duplicate-log:${key}`)
      }
      byKey.set(key, event)
    }
    const events = [...byKey.values()].sort(eventSort)
    return {
      label,
      endpoint: 'omitted',
      status: 'complete',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      rawLogCount: raw.length,
      eventCount: events.length,
      eventDigest: digest(events),
      events,
    }
  } catch (error) {
    return {
      label,
      endpoint: 'omitted',
      status: 'unavailable',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      events: [],
      error: safeError(error),
    }
  }
}

function reconstruct(events, roles) {
  const membership = new Map()
  const roleAdmins = new Map(roles.map((role) => [role, ZERO_ROLE]))
  const candidates = new Map(roles.map((role) => [role, new Set()]))
  const anomalies = []

  function accountMap(role) {
    const current = membership.get(role) ?? new Map()
    membership.set(role, current)
    return current
  }

  for (const event of events) {
    if (!roleAdmins.has(event.role)) roleAdmins.set(event.role, ZERO_ROLE)
    if (!candidates.has(event.role)) candidates.set(event.role, new Set())
    if (event.eventName === 'RoleGranted') {
      candidates.get(event.role).add(event.account)
      const accounts = accountMap(event.role)
      if (accounts.get(event.account) === true) anomalies.push({ code: 'duplicate-grant', event })
      accounts.set(event.account, true)
    } else if (event.eventName === 'RoleRevoked') {
      candidates.get(event.role).add(event.account)
      const accounts = accountMap(event.role)
      if (accounts.get(event.account) !== true) anomalies.push({ code: 'revocation-without-known-grant', event })
      accounts.set(event.account, false)
    } else {
      if (!roleAdmins.has(event.previousAdminRole)) roleAdmins.set(event.previousAdminRole, ZERO_ROLE)
      if (!roleAdmins.has(event.newAdminRole)) roleAdmins.set(event.newAdminRole, ZERO_ROLE)
      const expectedPrevious = roleAdmins.get(event.role) ?? ZERO_ROLE
      if (expectedPrevious !== event.previousAdminRole) {
        anomalies.push({ code: 'role-admin-history-mismatch', expectedPrevious, event })
      }
      roleAdmins.set(event.role, event.newAdminRole)
    }
  }

  return {
    candidates: Object.fromEntries(
      [...candidates.entries()]
        .map(([role, accounts]) => [role, [...accounts].sort()])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    membership: Object.fromEntries(
      [...membership.entries()]
        .map(([role, accounts]) => [
          role,
          Object.fromEntries([...accounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
        ])
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    roleAdmins: Object.fromEntries([...roleAdmins.entries()].sort(([left], [right]) => left.localeCompare(right))),
    anomalies,
  }
}

async function readRoleState(label, url, blockNumber, roleIds, candidates) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable', error: 'provider-not-configured' }
  const rpc = rpcClient(url)
  try {
    const [defaultAdminRole, adminRole, executorRole] = await Promise.all([
      rpc.readContract({ address: CONTROLLER, abi: ROLE_ABI, functionName: 'DEFAULT_ADMIN_ROLE', blockNumber }),
      rpc.readContract({ address: CONTROLLER, abi: ROLE_ABI, functionName: 'ADMIN_ROLE', blockNumber }),
      rpc.readContract({ address: CONTROLLER, abi: ROLE_ABI, functionName: 'EXECUTOR_ROLE', blockNumber }),
    ])
    const constants = {
      DEFAULT_ADMIN_ROLE: defaultAdminRole.toLowerCase(),
      ADMIN_ROLE: adminRole.toLowerCase(),
      EXECUTOR_ROLE: executorRole.toLowerCase(),
    }
    const allRoles = [...new Set([...roleIds, ...Object.values(constants)])].sort()
    const admins = Object.fromEntries(
      await Promise.all(
        allRoles.map(async (role) => [
          role,
          (
            await rpc.readContract({
              address: CONTROLLER,
              abi: ROLE_ABI,
              functionName: 'getRoleAdmin',
              args: [role],
              blockNumber,
            })
          ).toLowerCase(),
        ]),
      ),
    )
    const membershipEntries = []
    for (const role of allRoles) {
      for (const account of candidates[role] ?? []) {
        const active = await rpc.readContract({
          address: CONTROLLER,
          abi: ROLE_ABI,
          functionName: 'hasRole',
          args: [role, account],
          blockNumber,
        })
        membershipEntries.push([`${role}:${account}`, active])
      }
    }
    return {
      label,
      endpoint: 'omitted',
      status: 'verified',
      blockNumber: blockNumber.toString(),
      constants,
      admins,
      membership: Object.fromEntries(membershipEntries.sort(([left], [right]) => left.localeCompare(right))),
    }
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', error: safeError(error) }
  }
}

function comparable(value) {
  return { ...value, label: null }
}

function roleLabel(role, constants) {
  return Object.entries(constants).find(([, value]) => value === role)?.[0] ?? `OBSERVED_${role.slice(2, 10)}`
}

function compareRoleState(reconstruction, state) {
  const mismatches = []
  for (const [role, expectedAdmin] of Object.entries(reconstruction.roleAdmins)) {
    const actualAdmin = state.admins[role]
    if (actualAdmin !== expectedAdmin) {
      mismatches.push({ code: 'role-admin-state-mismatch', role, expected: expectedAdmin, actual: actualAdmin ?? null })
    }
  }
  for (const [role, accounts] of Object.entries(reconstruction.membership)) {
    for (const [account, expected] of Object.entries(accounts)) {
      const actual = state.membership[`${role}:${account}`]
      if (actual !== expected) {
        mismatches.push({ code: 'role-membership-state-mismatch', role, account, expected, actual: actual ?? null })
      }
    }
  }
  return mismatches
}

async function readAuthorityFromProvider(label, url, address, blockNumber, interfaces) {
  if (!url) return { label, endpoint: 'omitted', status: 'unavailable' }
  const rpc = rpcClient(url)
  try {
    const [bytecode, implementationRaw, adminRaw, beaconRaw] = await Promise.all([
      rpc.getBytecode({ address, blockNumber }),
      rpc.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: ADMIN_SLOT, blockNumber }),
      rpc.getStorageAt({ address, slot: BEACON_SLOT, blockNumber }),
    ])
    const result = {
      label,
      endpoint: 'omitted',
      status: 'verified',
      address,
      code: codeEvidence(bytecode),
      slots: {
        implementation: slotAddress(implementationRaw),
        admin: slotAddress(adminRaw),
        beacon: slotAddress(beaconRaw),
      },
      reads: {},
    }
    if (interfaces.owner) {
      const abi = parseAbi(['function owner() view returns (address)'])
      result.reads.owner = getAddress(await rpc.readContract({ address, abi, functionName: 'owner', blockNumber }))
    }
    if (interfaces.getOwners && interfaces.getThreshold) {
      const abi = parseAbi([
        'function getOwners() view returns (address[])',
        'function getThreshold() view returns (uint256)',
      ])
      const [owners, threshold] = await Promise.all([
        rpc.readContract({ address, abi, functionName: 'getOwners', blockNumber }),
        rpc.readContract({ address, abi, functionName: 'getThreshold', blockNumber }),
      ])
      result.reads.owners = owners.map(getAddress)
      result.reads.threshold = threshold.toString()
    }
    return result
  } catch (error) {
    return { label, endpoint: 'omitted', status: 'unavailable', address, error: safeError(error) }
  }
}

async function classifyAuthorityAddress(address, endpoints, blockNumber) {
  const explorer = await explorerMetadata(address)
  const interfaces = explorer.contract?.readInterfaces ?? { owner: false, getOwners: false, getThreshold: false }
  const providers = await Promise.all(
    endpoints.map(({ label, url }) => readAuthorityFromProvider(label, url, address, blockNumber, interfaces)),
  )
  const agreement =
    providers.length === 2 &&
    providers.every((provider) => provider.status === 'verified') &&
    JSON.stringify(comparable(providers[0])) === JSON.stringify(comparable(providers[1]))
  const first = providers.find((provider) => provider.status === 'verified')
  let classification = 'unresolved'
  if (agreement && first) {
    if (!first.code.hasCode) classification = 'eoa'
    else if (first.slots.implementation || first.slots.beacon) classification = 'eip1967-proxy'
    else if (interfaces.getOwners && interfaces.getThreshold && first.reads.owners) {
      classification = 'verified-multisig-interface'
    } else if (interfaces.owner && first.reads.owner) classification = 'verified-ownable-contract'
    else classification = 'contract-unclassified'
  }
  const relatedAuthorities = []
  for (const owner of first?.reads?.owners ?? []) relatedAuthorities.push(owner)
  if (first?.reads?.owner) relatedAuthorities.push(first.reads.owner)
  return {
    address,
    agreement,
    classification,
    providers,
    explorer: {
      addressRequestOk: explorer.addressRequestOk,
      contractRequestOk: explorer.contractRequestOk,
      addressSummary: explorer.addressSummary,
      contract: explorer.contract,
    },
    relatedAuthorities: [...new Set(relatedAuthorities)],
  }
}

const endpoints = [
  { label: 'official-public', url: PUBLIC_RPC },
  { label: 'configured-monitoring', url: CONFIGURED_RPC },
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

const deploymentExplorer = await blockscoutDeployment()
const archiveEvidence = await Promise.all([
  archiveBoundary('official-public', PUBLIC_RPC),
  archiveBoundary('configured-monitoring', CONFIGURED_RPC),
])
const configuredArchive = archiveEvidence.find((entry) => entry.label === 'configured-monitoring')
const publicArchive = archiveEvidence.find((entry) => entry.label === 'official-public')
const deploymentAgreement =
  deploymentExplorer.status === 'verified' &&
  deploymentExplorer.transactionHash?.toLowerCase() === EXPECTED_CREATION_TX &&
  deploymentExplorer.blockNumber === EXPECTED_DEPLOYMENT_BLOCK &&
  configuredArchive?.status === 'archive-verified' &&
  !configuredArchive.before.hasCode &&
  configuredArchive.at.hasCode &&
  configuredArchive.at.byteLength === EXPECTED_PROXY_LENGTH &&
  configuredArchive.at.bytecodeHash === EXPECTED_PROXY_HASH &&
  ['archive-verified', 'non-archive'].includes(publicArchive?.status)

const scans =
  deploymentAgreement && endBlockAgreement
    ? await Promise.all(endpoints.map(({ label, url }) => scanEvents(label, url, EXPECTED_DEPLOYMENT_BLOCK, endBlock)))
    : []
const eventAgreement =
  scans.length === 2 &&
  scans.every((scan) => scan.status === 'complete') &&
  scans[0].eventDigest === scans[1].eventDigest &&
  JSON.stringify(scans[0].events) === JSON.stringify(scans[1].events)
const events = eventAgreement ? scans[0].events : []

const preliminaryRoles = [
  ...new Set(
    events.flatMap((event) =>
      event.eventName === 'RoleAdminChanged' ? [event.role, event.previousAdminRole, event.newAdminRole] : [event.role],
    ),
  ),
].sort()
const preliminaryCandidates = Object.fromEntries(
  preliminaryRoles.map((role) => [
    role,
    [...new Set(events.filter((event) => event.role === role && event.account).map((event) => event.account))].sort(),
  ]),
)
const initialRoleState = eventAgreement
  ? await Promise.all(
      endpoints.map(({ label, url }) => readRoleState(label, url, endBlock, preliminaryRoles, preliminaryCandidates)),
    )
  : []
const roleConstantsAgreement =
  initialRoleState.length === 2 &&
  initialRoleState.every((state) => state.status === 'verified') &&
  JSON.stringify(comparable(initialRoleState[0])) === JSON.stringify(comparable(initialRoleState[1]))
const constants = initialRoleState.find((state) => state.status === 'verified')?.constants ?? {}
const allRoles = [...new Set([...preliminaryRoles, ...Object.values(constants)])].sort()
const reconstruction = reconstruct(events, allRoles)
const roleState = eventAgreement
  ? await Promise.all(
      endpoints.map(({ label, url }) => readRoleState(label, url, endBlock, allRoles, reconstruction.candidates)),
    )
  : []
const roleStateAgreement =
  roleState.length === 2 &&
  roleState.every((state) => state.status === 'verified') &&
  JSON.stringify(comparable(roleState[0])) === JSON.stringify(comparable(roleState[1]))
const authoritativeRoleState = roleState.find((state) => state.status === 'verified')
const stateMismatches = authoritativeRoleState ? compareRoleState(reconstruction, authoritativeRoleState) : []

const currentHolders = []
if (authoritativeRoleState) {
  for (const role of allRoles) {
    for (const account of reconstruction.candidates[role] ?? []) {
      if (authoritativeRoleState.membership[`${role}:${account}`] === true) {
        currentHolders.push({ role, roleLabel: roleLabel(role, constants), account })
      }
    }
  }
}
currentHolders.sort((left, right) => `${left.role}:${left.account}`.localeCompare(`${right.role}:${right.account}`))

const uniqueHolderAddresses = [...new Set(currentHolders.map((holder) => holder.account))]
const holderEvidence = []
for (const address of uniqueHolderAddresses) {
  holderEvidence.push(await classifyAuthorityAddress(address, endpoints, endBlock))
}
const relatedAddresses = [...new Set(holderEvidence.flatMap((holder) => holder.relatedAuthorities))].filter(
  (address) => !uniqueHolderAddresses.includes(address),
)
const relatedAuthorityEvidence = []
for (const address of relatedAddresses.slice(0, 25)) {
  relatedAuthorityEvidence.push(await classifyAuthorityAddress(address, endpoints, endBlock))
}

const holderEvidenceAgreement = holderEvidence.every((holder) => holder.agreement)
const roleMembershipStatus =
  availableTips.length === 2 &&
  endBlockAgreement &&
  deploymentAgreement &&
  eventAgreement &&
  roleConstantsAgreement &&
  roleStateAgreement &&
  reconstruction.anomalies.length === 0 &&
  stateMismatches.length === 0 &&
  holderEvidenceAgreement
    ? 'verified'
    : 'unresolved'
const authorityBoundaries = holderEvidence
  .filter((holder) => ['unresolved', 'eip1967-proxy', 'contract-unclassified'].includes(holder.classification))
  .map((holder) => ({ address: holder.address, classification: holder.classification }))

const result = {
  mode: 'read-only',
  generatedAt: new Date().toISOString(),
  controller: CONTROLLER,
  confirmations: CONFIRMATIONS.toString(),
  tips: tips.map((tip) => ({ ...tip, blockNumber: tip.blockNumber?.toString() ?? null })),
  endBoundary: { blockNumber: endBlock.toString(), agreement: endBlockAgreement, providers: endBlocks },
  deploymentBoundary: {
    agreement: deploymentAgreement,
    expectedBlock: EXPECTED_DEPLOYMENT_BLOCK.toString(),
    explorer: {
      status: deploymentExplorer.status,
      transactionHash: deploymentExplorer.transactionHash,
      blockNumber: deploymentExplorer.blockNumber?.toString() ?? null,
    },
    archiveEvidence,
  },
  eventHistory: {
    agreement: eventAgreement,
    eventCount: events.length,
    digest: eventAgreement ? digest(events) : null,
    scans,
    events,
  },
  roles: {
    constants,
    roleIds: allRoles,
    providerAgreement: roleStateAgreement,
    providers: roleState,
    reconstruction,
    stateMismatches,
    currentHolders,
  },
  holderEvidence,
  relatedAuthorityEvidence,
  holderEvidenceAgreement,
  roleMembershipStatus,
  authorityBoundaries,
  controlStatus:
    roleMembershipStatus === 'verified' && authorityBoundaries.length === 0
      ? 'role-membership-and-holder-boundaries-verified'
      : roleMembershipStatus === 'verified'
        ? 'role-membership-verified-holder-authority-unresolved'
        : 'unresolved',
  executionEligible: false,
  disclaimer:
    'This audit reads historical logs, bytecode, storage, verified metadata, role getters, hasRole, and verified read-only ownership or multisig interfaces only. It does not call execute, executeCall, grantRole, revokeRole, upgrade, approve, encode calldata, connect a wallet, request a signature, submit a transaction, move funds, or recommend capital deployment.',
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
