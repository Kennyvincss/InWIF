import { describe, expect, it } from 'vitest'
import { denominateSeries } from '../src/market'

describe('denominateSeries', () => {
  it('divides each value by the asset price at or before that time', () => {
    const values = [
      { t: 100, close: 1000 },
      { t: 200, close: 1200 },
      { t: 300, close: 900 },
    ]
    const wif = [
      { t: 100, close: 0.001 },
      { t: 250, close: 0.002 },
    ]
    expect(denominateSeries(values, wif)).toEqual([
      { t: 100, close: 1_000_000 },
      { t: 200, close: 1_200_000 },
      { t: 300, close: 450_000 },
    ])
  })

  it('drops points before the first known price and ignores zero prices', () => {
    const out = denominateSeries(
      [
        { t: 50, close: 10 },
        { t: 150, close: 20 },
      ],
      [
        { t: 100, close: 0 },
        { t: 120, close: 2 },
      ],
    )
    expect(out).toEqual([{ t: 150, close: 10 }])
  })

  it('handles unsorted input and empty prices', () => {
    expect(denominateSeries([{ t: 2, close: 4 }, { t: 1, close: 2 }], [{ t: 1, close: 2 }])).toEqual([
      { t: 1, close: 1 },
      { t: 2, close: 2 },
    ])
    expect(denominateSeries([{ t: 1, close: 1 }], [])).toEqual([])
  })
})
