import { describe, expect, it } from 'vitest'
import { extractWcUri } from '@/lib/qr'

const URI = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}&expiryTimestamp=1793869215`

describe('extractWcUri', () => {
  it('accepts a bare WalletConnect v2 URI', () => {
    expect(extractWcUri(`  ${URI} `)).toBe(URI)
  })
  it('extracts the URI from a deep link', () => {
    expect(extractWcUri(`https://inwif.vercel.app/app/connect?uri=${encodeURIComponent(URI)}`)).toBe(URI)
  })
  it('rejects other QR contents', () => {
    expect(extractWcUri('https://example.com')).toBeNull()
    expect(extractWcUri('ethereum:0x70997970C51812dc3A010C7d01b50e0d17dc79C8@4663')).toBeNull()
    expect(extractWcUri('wc:1234@1?bridge=x')).toBeNull() // v1 links are not supported
  })
})
