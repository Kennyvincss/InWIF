'use client'
/**
 * QR decoding for WalletConnect links. Uses the browser's native BarcodeDetector
 * when it supports QR codes (fast, hardware-accelerated), otherwise jsQR.
 * Everything happens on-device; images and camera frames are never uploaded.
 */

/**
 * Pull a WalletConnect pairing URI out of scanned/pasted text. Accepts a bare
 * `wc:` URI or a link that carries one in a `uri` query parameter (common in
 * dApp deep links), e.g. https://example.app/wc?uri=wc%3A…
 */
export function extractWcUri(text: string): string | null {
  const t = text.trim()
  if (/^wc:[0-9a-f]{64}@2\?/i.test(t)) return t
  try {
    const u = new URL(t)
    const inner = u.searchParams.get('uri')
    if (inner && /^wc:[0-9a-f]{64}@2\?/i.test(inner)) return inner
  } catch {
    /* not a URL */
  }
  return null
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }

let native: Detector | null | undefined
async function nativeDetector(): Promise<Detector | null> {
  if (native !== undefined) return native
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector
  try {
    native = BD && (await BD.getSupportedFormats?.())?.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null
  } catch {
    native = null
  }
  return native
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null

/** Decode one QR code from a video frame, image or bitmap. Returns null if none is found. */
export async function decodeQr(src: HTMLVideoElement | ImageBitmap | HTMLImageElement): Promise<string | null> {
  const det = await nativeDetector()
  if (det) {
    try {
      const r = await det.detect(src)
      if (r[0]?.rawValue) return r[0].rawValue
      return null
    } catch {
      /* fall through to jsQR */
    }
  }
  if (!scratch) return null
  const w = src instanceof HTMLVideoElement ? src.videoWidth : src.width
  const h = src instanceof HTMLVideoElement ? src.videoHeight : src.height
  if (!w || !h) return null
  // Downscale large frames: faster, and QR codes stay decodable.
  const scale = Math.min(1, 800 / Math.max(w, h))
  scratch.width = Math.round(w * scale)
  scratch.height = Math.round(h * scale)
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(src, 0, 0, scratch.width, scratch.height)
  const img = ctx.getImageData(0, 0, scratch.width, scratch.height)
  // Loaded on first use so the decoder is not part of every wallet page.
  const { default: jsQR } = await import('jsqr')
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

/** Decode a QR code from an image file (e.g. a screenshot of a dApp's QR dialog). */
export async function decodeQrFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file)
  try {
    return await decodeQr(bmp)
  } finally {
    bmp.close()
  }
}
