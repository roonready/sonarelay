import sharp from 'sharp'
import type { MusicPlaybackSnapshot } from '../../shared/types'
// pHash v1 mirrors audio-scrobbler/api/src/image.ts.
function problem(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode })
}

export const maxArtworkBytes = 5 * 1024 * 1024
export const phashVersion = 1
const sampleSize = 32
const maxPixels = 20_000_000
type Format = 'jpeg' | 'png' | 'webp'

async function decode(bytes: Buffer) {
  if (bytes.length > maxArtworkBytes) problem(413, 'Image is too large')
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: maxPixels })
    const meta = await image.metadata()
    const format = meta.format as Format
    if (!['jpeg', 'png', 'webp'].includes(format) || (meta.pages ?? 1) > 1) {
      problem(415, 'Expected a still JPEG, PNG or WebP image')
    }
    const { width, height } = meta.autoOrient
    if (!width || !height || width > 8192 || height > 8192 || width * height > maxPixels) {
      problem(422, 'Unsupported image dimensions')
    }
    const pixels = await image.autoOrient().flatten({ background: '#ffffff' })
      .resize(sampleSize, sampleSize, { fit: 'fill' }).greyscale().raw().toBuffer()
    return { format, width, height, pixels }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error
    return problem(422, 'Image cannot be decoded')
  }
}

const cosines = Array.from({ length: 8 }, (_, frequency) => Array.from({ length: sampleSize }, (_, i) =>
  Math.cos((2 * i + 1) * frequency * Math.PI / (2 * sampleSize))))

export async function inspectArtwork(bytes: Buffer) {
  const { pixels, ...metadata } = await decode(bytes)
  const coefficients: number[] = []
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      let value = 0
      for (let row = 0; row < sampleSize; row++) {
        for (let column = 0; column < sampleSize; column++) {
          value += pixels[row * sampleSize + column] * cosines[x][column] * cosines[y][row]
        }
      }
      const scale = (x === 0 ? Math.SQRT1_2 : 1) * (y === 0 ? Math.SQRT1_2 : 1)
      coefficients.push(Math.round(value * scale * 1e6) / 1e6)
    }
  }
  const ac = coefficients.slice(1).sort((a, b) => a - b)
  const bits = '0' + coefficients.slice(1).map(value => value > ac[31] ? '1' : '0').join('')
  return { ...metadata, pHashVersion: phashVersion, pHash: BigInt('0b' + bits).toString(16).padStart(16, '0') }
}

export function artworkBytes(value: string | null) {
  if (!value || value.length > Math.ceil(maxArtworkBytes / 3) * 4 + 32) return;
  const data = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)?.[1];
  if (!data || data.length % 4 !== 0) return;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length && bytes.length <= maxArtworkBytes) return bytes;
}

export class ArtworkConfirmation {
  private albumKey?: string
  private lastImage: string | null = null
  private lastConfirmed: string | null = null
  private previousImages: (string | null)[] = []
  private candidate: string | null = null
  private confirmed: string | null = null

  observe(track: MusicPlaybackSnapshot | undefined, image: string | null) {
    if (!track?.playing || !track.title.trim() || !track.artist.trim()) {
      this.candidate = null
      return null
    }
    const album = track.album.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
    const key = JSON.stringify([track.sourceId, album || null, ...(album ? [] : [track.artist, track.title])])
    if (key !== this.albumKey) {
      this.albumKey = key
      this.previousImages = [this.lastImage, this.lastConfirmed]
      this.confirmed = this.candidate = this.lastImage = null
    }
    // GSMTC emits deterministic data URLs, so equality compares the original image bytes.
    if (image) this.lastImage = image
    if (!image || this.previousImages.includes(image)) {
      this.candidate = null
      return null
    }
    if (image === this.candidate) this.lastConfirmed = this.confirmed = image
    this.candidate = image
    return image === this.confirmed ? image : null
  }
}
