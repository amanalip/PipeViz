// ---------------------------------------------------------------------------
// graph/exportPng.ts - canvas -> downloadable PNG (M6 backlog, plan §10).
//
// The plan flagged SVG-in-foreignObject serialization as fragile; html-to-image
// wraps exactly that technique with the workarounds (font/data-URL inlining,
// Safari size caps) that make it dependable enough to ship. The DOM-facing
// half lives here; the geometry half (`frameFor`) stays a pure function so
// tests can pin the framing math without a browser.
//
// Recipe: measure the laid-out node bounds via React Flow's own utilities,
// ask it for a viewport that frames those bounds inside the target image
// size, then render only the `.react-flow__viewport` element (cards + edges)
// with an override transform - controls, minimap, and captions never leak
// into the export.
// ---------------------------------------------------------------------------

import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng } from 'html-to-image'
import type { Node } from '@xyflow/react'

/** Output image constraints: long edge capped, square-ish padding. */
export const PNG_MAX_EDGE = 2400
export const PNG_MIN_EDGE = 640
/** Breathing room around the graph inside the image (fraction of viewport). */
export const PNG_PADDING = 0.08

/**
 * Pure framing math shared by tests and export: given content bounds and a
 * pixel ratio, pick an image size whose long edge respects the cap while
 * never dropping below the floor. Breathing room around the graph comes
 * from getViewportForBounds' padding, not from inflating these numbers.
 */
export function frameFor(
  width: number,
  height: number,
  pixelRatio: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) {
    return { width: PNG_MIN_EDGE, height: PNG_MIN_EDGE }
  }
  const scale = Math.min(PNG_MAX_EDGE / Math.max(width, height), pixelRatio)
  return {
    width: Math.max(Math.round(width * scale), PNG_MIN_EDGE),
    height: Math.max(Math.round(height * scale), PNG_MIN_EDGE),
  }
}

interface ExportOptions {
  /** Current flow nodes; bounds derive from their measured positions. */
  nodes: readonly Node[]
  /** Viewport element rendered into the image (.react-flow__viewport). */
  viewport: HTMLElement
  /** Page background behind translucent cards, baked into the pixels. */
  backgroundColor: string
  /** Render density multiplier applied on top of the fitted zoom. */
  pixelRatio?: number
}

/** Trigger the browser download for a data URL under the given name. */
function download(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.click()
}

/**
 * Render the live graph to a PNG and download it as `pipeviz.png`. Resolves
 * once the download fires; throws when rendering fails so callers can show
 * honest feedback.
 */
export async function exportCanvasPng({
  nodes,
  viewport,
  backgroundColor,
  pixelRatio = 2,
}: ExportOptions): Promise<void> {
  const bounds = getNodesBounds([...nodes])
  const { width, height } = frameFor(bounds.width, bounds.height, pixelRatio)

  // Ask React Flow for the camera that frames the bounds inside our fixed
  // output box, then bake that camera into an inline style override.
  const viewportBox = getViewportForBounds(bounds, width, height, 0.05, 4, PNG_PADDING)
  const dataUrl = await toPng(viewport, {
    backgroundColor,
    width,
    height,
    // frameFor already applies the requested density to width and height.
    // Pin the rasterizer to one so devicePixelRatio cannot multiply it again.
    pixelRatio: 1,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${viewportBox.x}px, ${viewportBox.y}px) scale(${viewportBox.zoom})`,
    },
  })
  download(dataUrl, `pipeviz-${new Date().toISOString().slice(0, 10)}.png`)
}
