import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { inspectSwapEvidenceCoverage } from './swap-integrity.js'
import { SqliteSwapIndexStore } from './swap-store.js'

const poolAddress = '0x0000000000000000000000000000000000000001'

describe('swap evidence coverage', () => {
  it('reports legacy swap rows without timestamps', () => {
    const store = new SqliteSwapIndexStore(':memory:')
    store.close()

    const path = `/tmp/lp-mine-swap-coverage-${process.pid}-${Date.now()}.sqlite`
    const initialized = new SqliteSwapIndexStore(path)
    initialized.close()
    const database = new DatabaseSync(path)
    try {
      database
        .prepare(
          `
          INSERT INTO swap_events (
            block_number, block_hash, transaction_hash, log_index,
            pool_address, sender, recipient, amount0, amount1,
            sqrt_price_x96, active_liquidity, tick
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          '1',
          `0x${'01'.padStart(64, '0')}`,
          `0x${'02'.padStart(64, '0')}`,
          0,
          poolAddress,
          '0x0000000000000000000000000000000000000002',
          '0x0000000000000000000000000000000000000003',
          '1',
          '-1',
          (1n << 96n).toString(),
          '1',
          0,
        )
    } finally {
      database.close()
    }

    const coverage = inspectSwapEvidenceCoverage(path, poolAddress)
    expect(coverage.totalRows).toBe(1)
    expect(coverage.timestampedRows).toBe(0)
    expect(coverage.missingTimestampRows).toBe(1)
    expect(coverage.latestTimestamp).toBeNull()
  })
})
