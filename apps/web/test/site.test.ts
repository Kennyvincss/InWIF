import { describe, expect, it } from 'vitest'
import { normaliseSiteUrl } from '@/lib/site'

describe('site URL', () => {
  it('accepts values with or without a scheme', () => {
    expect(normaliseSiteUrl('inwif.vercel.app')).toBe('https://inwif.vercel.app')
    expect(normaliseSiteUrl('https://inwif.xyz/')).toBe('https://inwif.xyz')
    expect(normaliseSiteUrl(' http://localhost:3000 ')).toBe('http://localhost:3000')
    expect(normaliseSiteUrl(undefined)).toBe('https://inwif.vercel.app')
    expect(normaliseSiteUrl('not a url')).toBe('https://inwif.vercel.app')
  })
})
