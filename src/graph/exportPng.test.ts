// ---------------------------------------------------------------------------
// graph/exportPng.test.ts - framing math for the PNG export (M6).
//
// The DOM-facing render path needs a browser; the sizing rules do not.
// These tests pin frameFor so exports stay inside sane bounds: long edge
// capped at PNG_MAX_EDGE, never thinner than PNG_MIN_EDGE, deterministic,
// and guarded against degenerate bounds.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import {
  PNG_MAX_EDGE,
  PNG_MIN_EDGE,
  frameFor,
} from './exportPng'

describe('frameFor', () => {
  it('doubles small graphs at pixelRatio 2, honoring the floor', () => {
    // A single card wants 440x144; both sides clamp up to the floor.
    expect(frameFor(220, 72, 2)).toEqual({ width: PNG_MIN_EDGE, height: PNG_MIN_EDGE })
    // A mid-size graph stays unscaled in width; short side clamps to the floor.
    expect(frameFor(800, 600, 1)).toEqual({ width: 800, height: 640 })
  })

  it('caps the long edge at PNG_MAX_EDGE for huge canvases', () => {
    const frame = frameFor(20000, 4000, 2)
    expect(Math.max(frame.width, frame.height)).toBe(PNG_MAX_EDGE)
    // Height 480 clamps up to the 640 floor.
    expect(frame.width / frame.height).toBeCloseTo(2400 / 640, 5)
  })

  it('never drops below PNG_MIN_EDGE', () => {
    expect(frameFor(1, 1, 0.1).width).toBeGreaterThanOrEqual(PNG_MIN_EDGE)
    expect(frameFor(10, 10, 0.1).height).toBeGreaterThanOrEqual(PNG_MIN_EDGE)
  })

  it('falls back to the minimum square for degenerate bounds', () => {
    expect(frameFor(0, 100, 2)).toEqual({ width: PNG_MIN_EDGE, height: PNG_MIN_EDGE })
    expect(frameFor(-5, 5, 2)).toEqual({ width: PNG_MIN_EDGE, height: PNG_MIN_EDGE })
  })

  it('is deterministic across repeated calls', () => {
    expect(frameFor(800, 600, 2)).toEqual(frameFor(800, 600, 2))
  })

  it('scales down when pixel ratio is below one', () => {
    const full = frameFor(800, 600, 2)
    const half = frameFor(800, 600, 0.5)
    expect(half.width).toBeLessThan(full.width)
    expect(half.height).toBeLessThan(full.height)
  })
})
