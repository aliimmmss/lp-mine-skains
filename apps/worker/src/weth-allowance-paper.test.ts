import { describe, expect, it } from 'vitest'
import { buildWethAllowancePaperReport, readWethAllowancePaperCommandConfig } from './weth-allowance-paper.js'

describe('WETH allowance paper command', () => {
  it('reads explicit owner and bounded freshness settings', () => {
    const config = readWethAllowancePaperCommandConfig({
      PAPER_OWNER_ADDRESS: ' 0x640BF0B6b8706f35195d6491cbE347c01b967393 ',
      ROBINHOOD_RPC_URL: ' https://configured.invalid ',
      PAPER_CONFIRMATIONS: '18',
      PAPER_MAX_EVIDENCE_AGE_SECONDS: '600',
    })

    expect(config).toEqual({
      owner: '0x640BF0B6b8706f35195d6491cbE347c01b967393',
      configuredRpcUrl: 'https://configured.invalid',
      confirmations: 18,
      maximumAgeSeconds: 600,
    })
  })

  it('uses conservative defaults', () => {
    expect(readWethAllowancePaperCommandConfig({})).toEqual({
      owner: '',
      configuredRpcUrl: null,
      confirmations: 12,
      maximumAgeSeconds: 900,
    })
  })

  it('rejects invalid positive-integer settings', () => {
    expect(() => readWethAllowancePaperCommandConfig({ PAPER_CONFIRMATIONS: '0' })).toThrow(
      'PAPER_CONFIRMATIONS must be a positive integer',
    )
    expect(() => readWethAllowancePaperCommandConfig({ PAPER_MAX_EVIDENCE_AGE_SECONDS: '1.5' })).toThrow(
      'PAPER_MAX_EVIDENCE_AGE_SECONDS must be a positive integer',
    )
  })

  it('fails closed without a checksummed owner and configured provider', async () => {
    const report = await buildWethAllowancePaperReport(
      {
        owner: '0x640bf0b6b8706f35195d6491cbe347c01b967393',
        configuredRpcUrl: null,
        confirmations: 12,
        maximumAgeSeconds: 900,
      },
      new Date('2026-07-21T17:45:00.000Z'),
    )

    expect(report.decision).toBe('blocked')
    expect(report.executionEligible).toBe(false)
    expect(report.evidence.allowance.status).toBe('unavailable')
    expect(report.checks.find((item) => item.code === 'owner-address')?.status).toBe('pass')
    expect(report.checks.find((item) => item.code === 'allowance-available')?.status).toBe('fail')
  })
})
