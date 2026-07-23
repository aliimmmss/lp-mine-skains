// Browser-side mirror of packages/core/src/opportunity.ts and the GeckoTerminal
// normalize in apps/worker/src/geckoterminal.ts. Kept in sync by hand; the
// screen criteria are stable. Used to fetch and rank opportunities live in the
// page so this section is not limited to the site's build cadence.

export const CRITERIA = {
  minMarketCapUsd: 250_000,
  minVolume24hUsd: 1_000_000,
  minAgeHours: 24,
  minVolumeToTvl: 0.5,
}
const DUST_MIN_VOLUME = 50_000
const DUST_MIN_RESERVE = 10_000

export type VolumeTrend = 'rising' | 'steady' | 'fading'

export type Opportunity = {
  name: string
  address: string
  feeTierPercent: number
  ageHours: number
  marketCapUsd: number | null
  reserveUsd: number
  volume24hUsd: number
  volumeToTvl: number
  estDailyFeeReturnPercent: string
  volumeTrend: VolumeTrend
  passesScreen: boolean
  screenNotes: string[]
}

type RawPool = {
  name: string
  address: string
  createdAt: Date
  marketCapUsd: number | null
  reserveUsd: number
  volume24hUsd: number
  volume6hUsd: number
  feeTierPercent: number
}

function toNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseFeeTierPercent(name: string): number | null {
  const match = /(\d+(?:\.\d+)?)%\s*$/.exec(name.trim())
  return match ? Number(match[1]) : null
}

function normalize(attributes: Record<string, unknown>): RawPool | null {
  const name = attributes.name
  const address = attributes.address
  const createdRaw = attributes.pool_created_at
  if (typeof name !== 'string' || typeof address !== 'string' || typeof createdRaw !== 'string') return null
  const feeTierPercent = parseFeeTierPercent(name)
  if (feeTierPercent === null) return null
  const createdAt = new Date(createdRaw)
  if (Number.isNaN(createdAt.getTime())) return null
  const volume = attributes.volume_usd as { h6?: unknown; h24?: unknown } | undefined
  const reserveUsd = toNumber(attributes.reserve_in_usd)
  const volume24hUsd = toNumber(volume?.h24)
  const volume6hUsd = toNumber(volume?.h6)
  if (reserveUsd === null || volume24hUsd === null || volume6hUsd === null) return null
  return {
    name,
    address,
    createdAt,
    marketCapUsd: toNumber(attributes.market_cap_usd),
    reserveUsd,
    volume24hUsd,
    volume6hUsd,
    feeTierPercent,
  }
}

function score(pool: RawPool, now: Date): Opportunity {
  const ageHours = Math.max(0, (now.getTime() - pool.createdAt.getTime()) / 3_600_000)
  const volumeToTvl = pool.reserveUsd > 0 ? pool.volume24hUsd / pool.reserveUsd : 0
  const recentHourly = pool.volume6hUsd / 6
  const dayHourly = pool.volume24hUsd / 24
  const trendRatio = dayHourly > 0 ? recentHourly / dayHourly : 1
  const volumeTrend: VolumeTrend = trendRatio >= 1.2 ? 'rising' : trendRatio <= 0.8 ? 'fading' : 'steady'

  const screenNotes: string[] = []
  if (pool.marketCapUsd === null || pool.marketCapUsd < CRITERIA.minMarketCapUsd) screenNotes.push('market cap below $250K')
  if (pool.volume24hUsd < CRITERIA.minVolume24hUsd) screenNotes.push('24h volume below $1M')
  if (ageHours < CRITERIA.minAgeHours) screenNotes.push('pool is newer than 24h')
  if (volumeToTvl < CRITERIA.minVolumeToTvl) screenNotes.push('volume/TVL activity below 0.5')

  return {
    name: pool.name,
    address: pool.address,
    feeTierPercent: pool.feeTierPercent,
    ageHours,
    marketCapUsd: pool.marketCapUsd,
    reserveUsd: pool.reserveUsd,
    volume24hUsd: pool.volume24hUsd,
    volumeToTvl,
    estDailyFeeReturnPercent: (volumeToTvl * pool.feeTierPercent).toFixed(2),
    volumeTrend,
    passesScreen: screenNotes.length === 0,
    screenNotes,
  }
}

/** Fetch Robinhood pools live from GeckoTerminal and rank them by fee return. */
export async function fetchAndRankOpportunities(pages = 3): Promise<Opportunity[]> {
  const pools: RawPool[] = []
  for (let page = 1; page <= pages; page += 1) {
    const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=${page}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`GeckoTerminal ${response.status}`)
    const payload = (await response.json()) as { data?: { attributes?: Record<string, unknown> }[] }
    const data = payload.data ?? []
    if (data.length === 0) break
    for (const entry of data) {
      if (entry.attributes) {
        const normalized = normalize(entry.attributes)
        if (normalized) pools.push(normalized)
      }
    }
  }
  const now = new Date()
  return pools
    .filter((pool) => pool.volume24hUsd >= DUST_MIN_VOLUME && pool.reserveUsd >= DUST_MIN_RESERVE)
    .map((pool) => score(pool, now))
    .sort((left, right) => Number(right.estDailyFeeReturnPercent) - Number(left.estDailyFeeReturnPercent))
}
