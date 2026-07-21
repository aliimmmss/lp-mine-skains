from pathlib import Path
import re

path = Path('.github/scripts/audit-weth-access-control.mjs')
content = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global content
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, found {count}')
    content = content.replace(old, new, 1)


replace_once(
    "const EXPECTED_EVENT_DIGEST = '0xd880dde31907ed8351ec66af46cc7f96afffbda565e67501b23f4f4dabdabd06'\n",
    """const EXPECTED_EVENT_DIGEST = '0xd880dde31907ed8351ec66af46cc7f96afffbda565e67501b23f4f4dabdabd06'
const BLOCKSCOUT_MAX_PAGES = 500
const BLOCKSCOUT_MAX_ITEMS = 25_000
const BLOCKSCOUT_MAX_DURATION_MS = 10 * 60 * 1_000
""",
    'Blockscout budgets',
)

blockscout_functions = r'''async function blockscoutTransactionPosition(transactionHash, cache) {
  const cached = cache.get(transactionHash)
  if (cached !== undefined) return cached
  const response = await fetchJson(`${BLOCKSCOUT}/transactions/${transactionHash}`)
  const rawPosition =
    response.value?.position ?? response.value?.transaction_index ?? response.value?.transactionIndex ?? null
  if (!response.ok || rawPosition === null) {
    throw new Error(`blockscout-transaction-position-unavailable:${transactionHash}:${response.status ?? 'network'}`)
  }
  const position = Number(rawPosition)
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new Error(`blockscout-invalid-transaction-position:${transactionHash}:${rawPosition}`)
  }
  cache.set(transactionHash, position)
  return position
}

async function blockHashAt(rpc, blockNumber, cache) {
  const key = blockNumber.toString()
  const cached = cache.get(key)
  if (cached) return cached
  const block = await rpc.getBlock({ blockNumber })
  if (!block.hash) throw new Error(`public-block-hash-unavailable:${key}`)
  cache.set(key, block.hash.toLowerCase())
  return block.hash.toLowerCase()
}

async function scanBlockscoutEvents(startBlock, endBlock) {
  const startedAt = Date.now()
  const baseUrl = `${BLOCKSCOUT}/addresses/${CONTROLLER}/logs`
  const topicSet = new Set(EVENT_TOPICS.map((topic) => topic.toLowerCase()))
  const seenCursors = new Set()
  const transactionPositions = new Map()
  const blockHashes = new Map()
  const publicRpc = rpcClient(PUBLIC_RPC)
  const raw = []
  let url = baseUrl
  let pages = 0
  let totalItems = 0
  let skippedAfterBoundary = 0

  try {
    while (url) {
      if (pages >= BLOCKSCOUT_MAX_PAGES) throw new Error(`blockscout-page-budget-exhausted:${BLOCKSCOUT_MAX_PAGES}`)
      if (totalItems >= BLOCKSCOUT_MAX_ITEMS) {
        throw new Error(`blockscout-item-budget-exhausted:${BLOCKSCOUT_MAX_ITEMS}`)
      }
      if (Date.now() - startedAt > BLOCKSCOUT_MAX_DURATION_MS) {
        throw new Error(`blockscout-duration-budget-exhausted:${BLOCKSCOUT_MAX_DURATION_MS}`)
      }

      const response = await fetchJson(url)
      if (!response.ok || !Array.isArray(response.value?.items)) {
        throw new Error(`blockscout-log-page-unavailable:${response.status ?? 'network'}`)
      }
      pages += 1
      totalItems += response.value.items.length
      if (totalItems > BLOCKSCOUT_MAX_ITEMS) {
        throw new Error(`blockscout-item-budget-exhausted:${BLOCKSCOUT_MAX_ITEMS}`)
      }

      for (const item of response.value.items) {
        const topic0 = item?.topics?.[0]?.toLowerCase?.() ?? null
        if (!topic0 || !topicSet.has(topic0)) continue
        if (!item.transaction_hash || item.index === null || item.index === undefined) {
          throw new Error('blockscout-malformed-relevant-log')
        }
        const blockNumber = BigInt(item.block_number)
        if (blockNumber > endBlock) {
          skippedAfterBoundary += 1
          continue
        }
        if (blockNumber < startBlock) throw new Error(`blockscout-log-before-boundary:${blockNumber}`)
        const addressValue =
          typeof item.address_hash === 'string' ? item.address_hash : item.address_hash?.hash ?? CONTROLLER
        if (getAddress(addressValue) !== CONTROLLER) {
          throw new Error(`blockscout-address-mismatch:${addressValue}`)
        }
        const transactionHash = item.transaction_hash.toLowerCase()
        const transactionIndex = await blockscoutTransactionPosition(transactionHash, transactionPositions)
        const expectedBlockHash = await blockHashAt(publicRpc, blockNumber, blockHashes)
        const blockHash = item.block_hash?.toLowerCase?.() ?? null
        if (!blockHash || blockHash !== expectedBlockHash) {
          throw new Error(`blockscout-block-hash-mismatch:${blockNumber}`)
        }
        raw.push({
          removed: false,
          data: item.data,
          topics: item.topics,
          blockNumber,
          blockHash,
          transactionHash,
          transactionIndex: BigInt(transactionIndex),
          logIndex: BigInt(item.index),
        })
      }

      const next = response.value.next_page_params
      if (!next || Object.keys(next).length === 0) {
        url = null
        continue
      }
      const entries = Object.entries(next).sort(([left], [right]) => left.localeCompare(right))
      const cursor = JSON.stringify(entries)
      if (seenCursors.has(cursor)) throw new Error(`blockscout-repeated-cursor:${cursor}`)
      seenCursors.add(cursor)
      const params = new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))
      url = `${baseUrl}?${params.toString()}`
    }

    const byKey = new Map()
    for (const log of raw) {
      const event = normalizeLog(log)
      const key = `${event.transactionHash}:${event.logIndex}`
      const existing = byKey.get(key)
      if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
        throw new Error(`blockscout-conflicting-duplicate-log:${key}`)
      }
      byKey.set(key, event)
    }
    const events = [...byKey.values()].sort(eventSort)
    return {
      label: 'blockscout',
      endpoint: 'omitted',
      status: 'complete',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      rawLogCount: raw.length,
      eventCount: events.length,
      eventDigest: digest(events),
      requestStats: {
        startedAt,
        requests: pages,
        rateLimitRetries: 0,
        backoffMs: 0,
        splits: 0,
        durationMs: Date.now() - startedAt,
        pages,
        totalItems,
        skippedAfterBoundary,
        transactionMetadataRequests: transactionPositions.size,
        blockHashChecks: blockHashes.size,
      },
      events,
    }
  } catch (error) {
    return {
      label: 'blockscout',
      endpoint: 'omitted',
      status: 'unavailable',
      startBlock: startBlock.toString(),
      endBlock: endBlock.toString(),
      requestStats: {
        startedAt,
        requests: pages,
        rateLimitRetries: 0,
        backoffMs: 0,
        splits: 0,
        durationMs: Date.now() - startedAt,
        pages,
        totalItems,
        skippedAfterBoundary,
        transactionMetadataRequests: transactionPositions.size,
        blockHashChecks: blockHashes.size,
      },
      events: [],
      error: safeError(error),
    }
  }
}

function reconstruct'''
pattern = r'function reconstruct'
content, count = re.subn(pattern, lambda _match: blockscout_functions, content, count=1)
if count != 1:
    raise SystemExit(f'Blockscout functions: expected one match, found {count}')

old_scans = """const scans =
  deploymentAgreement && endBlockAgreement
    ? await Promise.all(endpoints.map(({ label, url }) => scanEvents(label, url, EXPECTED_DEPLOYMENT_BLOCK, endBlock)))
    : []
"""
new_scans = """const scans =
  deploymentAgreement && endBlockAgreement
    ? await Promise.all([
        scanEvents('official-public', PUBLIC_RPC, EXPECTED_DEPLOYMENT_BLOCK, endBlock),
        scanBlockscoutEvents(EXPECTED_DEPLOYMENT_BLOCK, endBlock),
      ])
    : []
"""
replace_once(old_scans, new_scans, 'history sources')

path.write_text(content)
