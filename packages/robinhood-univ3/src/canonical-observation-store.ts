import { getAddress, type Address } from 'viem'
import type { PoolSnapshot } from './index.js'
import {
  type PoolObservationQuery,
  SqlitePoolObservationStore as RawSqlitePoolObservationStore,
} from './observation-store.js'
import { assertCanonicalPoolSnapshot, type CanonicalPool } from './pool-integrity.js'
import { ROBINHOOD_WETH_USDG_POOLS } from './registry.js'

export class SqlitePoolObservationStore {
  readonly #store: RawSqlitePoolObservationStore

  constructor(path: string) {
    this.#store = new RawSqlitePoolObservationStore(path)
  }

  saveSnapshots(snapshots: readonly PoolSnapshot[]): number {
    for (const snapshot of snapshots) validateSnapshotWhenCanonical(snapshot)
    return this.#store.saveSnapshots(snapshots)
  }

  listObservations(poolAddress: Address, query: PoolObservationQuery = {}): readonly PoolSnapshot[] {
    return validateSnapshots(this.#store.listObservations(poolAddress, query), canonicalPoolForAddress(poolAddress))
  }

  firstObservationAtOrAfter(poolAddress: Address, observedAt: Date, to?: Date): PoolSnapshot | null {
    return validateOptional(
      this.#store.firstObservationAtOrAfter(poolAddress, observedAt, to),
      canonicalPoolForAddress(poolAddress),
    )
  }

  lastObservationAtOrBefore(poolAddress: Address, observedAt: Date): PoolSnapshot | null {
    return validateOptional(
      this.#store.lastObservationAtOrBefore(poolAddress, observedAt),
      canonicalPoolForAddress(poolAddress),
    )
  }

  predecessorObservation(poolAddress: Address, observedAt: Date): PoolSnapshot | null {
    return validateOptional(this.#store.predecessorObservation(poolAddress, observedAt), canonicalPoolForAddress(poolAddress))
  }

  countObservations(poolAddress?: Address): number {
    return this.#store.countObservations(poolAddress)
  }

  close(): void {
    this.#store.close()
  }
}

function canonicalPoolForAddress(poolAddress: Address): CanonicalPool | null {
  const normalized = getAddress(poolAddress)
  return ROBINHOOD_WETH_USDG_POOLS.find((candidate) => candidate.poolAddress === normalized) ?? null
}

function validateSnapshotWhenCanonical(snapshot: PoolSnapshot): PoolSnapshot {
  const expected = canonicalPoolForAddress(snapshot.value.poolAddress)
  if (expected) assertCanonicalPoolSnapshot(snapshot, expected)
  return snapshot
}

function validateSnapshots(snapshots: readonly PoolSnapshot[], expected: CanonicalPool | null): readonly PoolSnapshot[] {
  if (expected) for (const snapshot of snapshots) assertCanonicalPoolSnapshot(snapshot, expected)
  return snapshots
}

function validateOptional(snapshot: PoolSnapshot | null, expected: CanonicalPool | null): PoolSnapshot | null {
  if (snapshot && expected) assertCanonicalPoolSnapshot(snapshot, expected)
  return snapshot
}
