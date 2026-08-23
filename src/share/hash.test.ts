// ---------------------------------------------------------------------------
// share/hash.test.ts - round trips and hostile inputs for the URL codec.
//
// Pins the base64url alphabet (URL-safe, padding stripped), UTF-8 safety
// (emoji and CJK must survive), the `p=` prefix contract, and the
// never-throw decode rule for malformed payloads.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import {
  HASH_PREFIX,
  decodeSource,
  encodeSource,
  isShareHash,
  pageUrlWithHash,
  readHashSource,
  sourceToHash,
} from './hash'

const SAMPLE_TEXT = `pipeline {
    agent any
}`

describe('encodeSource / decodeSource', () => {
  it('round-trips ASCII source with newlines and quotes', () => {
    expect(decodeSource(encodeSource(SAMPLE_TEXT))).toBe(SAMPLE_TEXT)
  })

  it('round-trips unicode: emoji and CJK survive', () => {
    const text = 'echo "🚀 ship it" # 中文注释'
    expect(decodeSource(encodeSource(text))).toBe(text)
  })

  it('produces URL-safe base64 without padding', () => {
    const encoded = encodeSource('a+/=?\n~')
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('encodes empty text to an empty payload', () => {
    expect(encodeSource('')).toBe('')
    expect(decodeSource('')).toBe('')
  })
})

describe('sourceToHash / readHashSource', () => {
  it('prefixes payloads with #p=', () => {
    const hash = sourceToHash(SAMPLE_TEXT)
    expect(hash.startsWith(`#${HASH_PREFIX}`)).toBe(true)
    expect(readHashSource(hash)).toBe(SAMPLE_TEXT)
  })

  it('maps empty source to an empty hash and back', () => {
    expect(sourceToHash('')).toBe('')
    expect(readHashSource('')).toBe(null) // no key at all: nothing shared
    expect(readHashSource(`#${HASH_PREFIX}`)).toBe('') // explicit empty share
  })

  it('ignores foreign hash keys', () => {
    expect(readHashSource('#section=2')).toBe(null)
    expect(readHashSource('#pQQ==')).toBe(null)
  })

  it('returns null instead of throwing on malformed payloads', () => {
    expect(readHashSource('#p=!!!not-base64!!!')).toBe(null)
    expect(readHashSource('#p=8J')).toBe(null) // truncated utf-8 sequence
    expect(readHashSource('#p=////')).toBe(null)
  })
})

describe('isShareHash', () => {
  it('sees the share key even when its payload is corrupt', () => {
    // This is how a broken link is told apart from "no link at all".
    expect(isShareHash('#p=!!!not-base64!!!')).toBe(true)
    expect(isShareHash(`#${HASH_PREFIX}`)).toBe(true)
  })

  it('rejects foreign keys and empty hashes', () => {
    expect(isShareHash('')).toBe(false)
    expect(isShareHash('#section=2')).toBe(false)
  })
})

describe('pageUrlWithHash', () => {
  it('keeps deployment subpaths in copied share links', () => {
    // Regression: resolving the hash against the origin alone used to drop
    // GitHub Pages' /PipeViz/ prefix, producing dead links.
    expect(
      pageUrlWithHash('https://user.github.io', '/PipeViz/', '', '#p=abc'),
    ).toBe('https://user.github.io/PipeViz/#p=abc')
  })

  it('preserves an existing search string and the bare page when empty', () => {
    expect(
      pageUrlWithHash('https://x.io', '/PipeViz/', '?utm=test', '#p=abc'),
    ).toBe('https://x.io/PipeViz/?utm=test#p=abc')
    expect(pageUrlWithHash('https://x.io', '/', '', '')).toBe('https://x.io/')
  })
})
