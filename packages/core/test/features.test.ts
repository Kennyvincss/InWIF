import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import {
  DEFAULT_TOKENS,
  WIF_ADDRESS,
  buildPaymentLink,
  cleanNote,
  concentration,
  detectCopycat,
  parsePaymentRequest,
  parsePoolStats,
  parsePoolTrades,
  parseTokenHolders,
  tradeFlow,
  verdictOf,
} from '../src'

const tokens = DEFAULT_TOKENS.robinhood
const ctx = { tokens, nativeSymbol: 'ETH' }
const ME = '0x1111111111111111111111111111111111111111'

describe('payment requests', () => {
  it('round-trips a $WIF request through a link', () => {
    const link = buildPaymentLink('https://inwif.app', { to: ME, symbol: 'WIF', amount: '5000', note: 'Pizza 🍕' })
    const u = new URL(link)
    expect(u.pathname).toBe('/pay')
    const p = parsePaymentRequest(Object.fromEntries(u.searchParams), ctx)
    expect(p.ok && p.request).toEqual({ to: getAddress(ME), asset: WIF_ADDRESS, symbol: 'WIF', decimals: 18, amount: '5000', note: 'Pizza 🍕' })
  })
  it('accepts ETH and amount-less requests', () => {
    const p = parsePaymentRequest({ to: ME, token: 'eth' }, ctx)
    expect(p.ok && p.request.asset).toBe('native')
    expect(p.ok && p.request.amount).toBeUndefined()
  })
  it('rejects bad recipients, unknown tokens and bad amounts', () => {
    expect(parsePaymentRequest({ to: '0x123', token: 'WIF' }, ctx).ok).toBe(false)
    expect(parsePaymentRequest({ to: '0x0000000000000000000000000000000000000000', token: 'WIF' }, ctx).ok).toBe(false)
    expect(parsePaymentRequest({ to: ME, token: 'SCAM' }, ctx).ok).toBe(false)
    expect(parsePaymentRequest({ to: ME, token: '0x9999999999999999999999999999999999999999' }, ctx).ok).toBe(false)
    for (const amount of ['-1', '0', '1e5', 'abc', '1.0000001', '0x10'])
      expect(parsePaymentRequest({ to: ME, token: 'USDG', amount }, ctx).ok, amount).toBe(false)
  })
  it('cleans notes: no control or bidi characters, max 80 chars', () => {
    expect(cleanNote('  hi‮there\u0000 ')).toBe('hithere')
    expect(cleanNote('x'.repeat(200))?.length).toBe(80)
    expect(cleanNote('   ')).toBeUndefined()
  })
})

describe('token safety check (pure parts)', () => {
  const t = (address: string, name: string, symbol: string) => ({ address: getAddress(address), name, symbol })
  it('flags copycats of known tokens but not the real one', () => {
    expect(detectCopycat(t('0x2222222222222222222222222222222222222222', 'World is Flat', 'W.I.F'), tokens)?.symbol).toBe('WIF')
    expect(detectCopycat(t('0x2222222222222222222222222222222222222222', 'Totally New', 'wif'), tokens)?.symbol).toBe('WIF')
    expect(detectCopycat(t(WIF_ADDRESS, 'World is Flat', 'WIF'), tokens)).toBeNull()
    expect(detectCopycat(t('0x2222222222222222222222222222222222222222', 'Pepe', 'PEPE'), tokens)).toBeNull()
  })
  it('computes holder concentration, ignoring burn addresses', () => {
    const h = [
      { address: getAddress('0x000000000000000000000000000000000000dEaD'), isContract: false, value: 500n },
      { address: getAddress('0x3333333333333333333333333333333333333333'), isContract: true, value: 300n },
      { address: getAddress('0x4444444444444444444444444444444444444444'), isContract: false, value: 100n },
    ]
    expect(concentration(h, 1000n)).toEqual({ top1Pct: 30, top10Pct: 40, top1IsContract: true })
    expect(concentration([], 1000n).top1Pct).toBeNull()
  })
  it('verdict is the worst finding', () => {
    const i = (level: 'ok' | 'warn' | 'danger' | 'info') => ({ id: level, level, title: '', detail: '' })
    expect(verdictOf([i('ok'), i('info')])).toBe('low')
    expect(verdictOf([i('ok'), i('warn')])).toBe('medium')
    expect(verdictOf([i('warn'), i('danger')])).toBe('high')
  })
  it('parses explorer holders and drops malformed rows', () => {
    const out = parseTokenHolders({
      items: [
        { address: { hash: '0x4444444444444444444444444444444444444444', is_contract: false }, value: '10' },
        { address: { hash: 'not-an-address' }, value: '99' },
        { address: { hash: '0x3333333333333333333333333333333333333333', is_contract: true }, value: '20' },
        { address: { hash: '0x5555555555555555555555555555555555555555' }, value: '1.5' },
      ],
    })
    expect(out.map((h) => [h.value, h.isContract])).toEqual([
      [20n, true],
      [10n, false],
    ])
  })
})

describe('live market parsing', () => {
  const trades = parsePoolTrades({
    data: [
      { attributes: { kind: 'buy', block_timestamp: '2026-11-05T23:03:32Z', block_number: 2, tx_hash: '0xa', tx_from_address: '0x1', from_token_amount: '0.0146', to_token_amount: '23713.9', volume_in_usd: '32.6' } },
      { attributes: { kind: 'sell', block_timestamp: '2026-11-05T23:02:58Z', block_number: 1, tx_hash: '0xb', tx_from_address: '0x2', from_token_amount: '27013', to_token_amount: '0.0166', volume_in_usd: '37.1' } },
      { attributes: { kind: 'weird', block_timestamp: '2026-11-05T23:00:00Z', from_token_amount: '1', to_token_amount: '1', volume_in_usd: '1' } },
    ],
  })
  it('maps buys and sells to base (token) and quote (ETH) amounts, newest first', () => {
    expect(trades).toHaveLength(2)
    expect(trades[0]).toMatchObject({ kind: 'buy', baseAmount: 23713.9, quoteAmount: 0.0146, volumeUsd: 32.6, txHash: '0xa' })
    expect(trades[1]).toMatchObject({ kind: 'sell', baseAmount: 27013, quoteAmount: 0.0166 })
  })
  it('computes buy/sell flow for a time window', () => {
    const f = tradeFlow(trades, 0)
    expect(f.buys).toBe(1)
    expect(f.sells).toBe(1)
    expect(f.buyShare).toBeCloseTo(32.6 / 69.7, 6)
    expect(tradeFlow(trades, Date.parse('2026-11-06T00:00:00Z')).buyShare).toBeNull()
  })
  it('parses pool stats windows', () => {
    const s = parsePoolStats({
      data: {
        attributes: {
          name: 'WIF / WETH',
          base_token_price_usd: '0.00139',
          reserve_in_usd: '102580',
          transactions: { h24: { buys: 1080, sells: 1027, buyers: 58, sellers: 21 } },
          volume_usd: { h24: '120491.06' },
          price_change_percentage: { h24: '3.9' },
        },
      },
    })
    expect(s?.priceUsd).toBe(0.00139)
    expect(s?.windows.h24).toEqual({ buys: 1080, sells: 1027, buyers: 58, sellers: 21, volumeUsd: 120491.06, priceChangePct: 3.9 })
    expect(s?.windows.m5.buys).toBe(0)
  })
})
