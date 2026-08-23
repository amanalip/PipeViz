// ---------------------------------------------------------------------------
// share/hash.ts - pipeline source <-> URL hash codec (M6).
//
// The whole Jenkinsfile rides in the location hash as base64url-encoded
// UTF-8 under a `p=` key, so a pasted pipeline becomes a shareable link
// without any server storage. Dependency-free on purpose: TextEncoder plus
// btoa/atob cover everything modern browsers need.
//
// Decoding is defensive by contract: any malformed payload (bad base64,
// broken UTF-8, wrong prefix) yields null and the app reports it instead
// of throwing - a corrupt shared link must never crash the boot.
// ---------------------------------------------------------------------------

/**
 * Hash key marking encoded pipeline source. v1 links carry `pv1=` so future
 * codecs (compression, encryption, chunking) can ship under their own key
 * without breaking every link ever copied; legacy `p=` payloads still
 * decode.
 */
export const HASH_VERSION_PREFIX = 'pv1='

/** Pre-versioning share key, kept decoding forever (M6 shipped it). */
export const HASH_LEGACY_PREFIX = 'p='

/** UTF-8 bytes -> base64url (no padding, +/ swapped for -_). */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url -> bytes; throws on characters outside the alphabet. */
function base64UrlToBytes(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(normalized + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Encode source text for the hash. Empty input encodes to ''. */
export function encodeSource(text: string): string {
  if (text.length === 0) return ''
  return bytesToBase64Url(new TextEncoder().encode(text))
}

/**
 * Decode hash payload back to text. Returns null for anything malformed;
 * an empty payload decodes to '' (a deliberate empty share).
 */
export function decodeSource(encoded: string): string | null {
  if (encoded.length === 0) return ''
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(encoded))
  } catch {
    return null
  }
}

/** The full hash string for a source ('' when the editor is empty).
 * New links always carry the versioned key. */
export function sourceToHash(text: string): string {
  return text.length === 0 ? '' : `#${HASH_VERSION_PREFIX}${encodeSource(text)}`
}

/**
 * Absolute URL carrying a share hash. Assembled from location parts rather
 * than resolving the hash against the origin (new URL would do that), so a
 * deployment subpath like GitHub Pages' `/PipeViz/` survives into copied
 * links. An empty hash yields the bare page URL.
 */
export function pageUrlWithHash(origin: string, pathname: string, search: string, hash: string): string {
  return `${origin}${pathname}${search}${hash}`
}

/**
 * Extract shared source from a location hash. Null means "nothing (or
 * nothing valid) shared"; '' means an explicit empty share. Both the
 * versioned `pv1=` key and the legacy `p=` key decode.
 */
export function readHashSource(hash: string): string | null {
  if (hash.startsWith(`#${HASH_VERSION_PREFIX}`)) {
    return decodeSource(hash.slice(1 + HASH_VERSION_PREFIX.length))
  }
  if (hash.startsWith(`#${HASH_LEGACY_PREFIX}`)) {
    return decodeSource(hash.slice(1 + HASH_LEGACY_PREFIX.length))
  }
  return null
}

/**
 * True when a location hash carries a share payload key at all - valid or
 * not, current or legacy. Callers combine this with readHashSource() to
 * tell "no share" apart from "share arrived but its payload is corrupt",
 * so a broken link can be reported instead of silently booting empty.
 */
export function isShareHash(hash: string): boolean {
  return (
    hash.startsWith(`#${HASH_VERSION_PREFIX}`) || hash.startsWith(`#${HASH_LEGACY_PREFIX}`)
  )
}
