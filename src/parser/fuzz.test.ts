// ---------------------------------------------------------------------------
// parser/fuzz.test.ts - the never-throw contract under adversarial input
// (plan §6.5, §12).
//
// 1000 seeded-random inputs per run: pure printable-ASCII noise, grammar-
// heavy character soup (braces/quotes/backslashes/interpolation), and
// structured mutations of the real corpus samples. Every parse must return
// a well-formed PipelineModel without throwing; a deterministic subset is
// re-parsed to confirm identical output.
//
// The generator is an LCG with a fixed seed so failures reproduce exactly.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { parseJenkinsfile } from './index'
import { SAMPLES } from '../samples'
import type { Diagnostic, StageNode } from '../model/types'

/** Deterministic linear congruential generator (Numerical Recipes constants). */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const pick = <T>(rand: () => number, list: readonly T[]): T =>
  list[Math.floor(rand() * list.length)] as T

/** Characters chosen to stress every tokenizer branch at once. */
const GRAMMAR_CHARS =
  "{}()[]'\"\\ \n\t\r;:,=.$/*@#&|<>!?+-_abcdeghilmnoprstuvxDEFPS"

const NOISE_CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i))

function randomString(rand: () => number, alphabet: readonly string[], maxLen: number): string {
  const len = Math.floor(rand() * maxLen)
  let out = ''
  for (let i = 0; i < len; i += 1) out += pick(rand, alphabet)
  return out
}

function mutateSource(rand: () => number, source: string): string {
  if (source.length === 0) return source
  switch (Math.floor(rand() * 5)) {
    case 0: {
      // Delete a random slice.
      const a = Math.floor(rand() * source.length)
      const b = Math.floor(rand() * source.length)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      return source.slice(0, lo) + source.slice(hi)
    }
    case 1: {
      // Inject grammar-heavy garbage at a random point.
      const at = Math.floor(rand() * source.length)
      return (
        source.slice(0, at) + randomString(rand, GRAMMAR_CHARS.split(''), 40) + source.slice(at)
      )
    }
    case 2: {
      // Duplicate a slice (stress brace imbalance both ways).
      const a = Math.floor(rand() * source.length)
      const b = Math.min(source.length, a + 1 + Math.floor(rand() * 30))
      return source.slice(0, b) + source.slice(a, b) + source.slice(b)
    }
    case 3:
      // Truncate.
      return source.slice(0, Math.floor(rand() * source.length))
    default: {
      // Swap two slices.
      const mid = Math.floor(rand() * source.length)
      return source.slice(mid) + '\n' + source.slice(0, mid)
    }
  }
}

interface FuzzInput {
  label: string
  text: string
}

function buildInputs(): { inputs: FuzzInput[]; deterministicEvery: number } {
  const rand = makeRandom(0x5017e5)
  const inputs: FuzzInput[] = []

  // 350: printable-ASCII noise across the full byte range 32..126.
  for (let i = 0; i < 350; i += 1) {
    inputs.push({ label: `noise-${i}`, text: randomString(rand, NOISE_CHARS, 400) })
  }

  // 350: grammar-heavy soup biased to braces, quotes, interpolation.
  for (let i = 0; i < 350; i += 1) {
    inputs.push({ label: `grammar-${i}`, text: randomString(rand, GRAMMAR_CHARS.split(''), 600) })
  }

  // 250: mutations of real samples, plus pathological fixed cases.
  for (let i = 0; i < 250; i += 1) {
    const sample = pick(rand, SAMPLES)
    inputs.push({ label: `${sample.id}-mut-${i}`, text: mutateSource(rand, sample.source) })
  }

  const pathological = [
    '',
    ' ',
    '\n',
    '{',
    '}',
    '{{{{',
    '}}}}',
    '"',
    "'",
    "'''",
    '"""',
    '${',
    '${}',
    '${{}}',
    '/*',
    '*/',
    '@',
    '\\',
    '\u0000',
    '\ufeffpipeline {}',
    '😀 stage 😀',
    `pipeline { stages { stage('x') { steps { ${'dir('.repeat(120)}d${')'.repeat(120)} } } } }`,
    `stage('deep') { ${'{ '.repeat(200)}} `.trimEnd(),
  ]
  pathological.forEach((text, i) => inputs.push({ label: `patho-${i}`, text }))

  return { inputs, deterministicEvery: 25 }
}

function checkContract(text: string): ReturnType<typeof parseJenkinsfile> {
  const model = parseJenkinsfile(text)

  expect(model.kind === 'declarative' || model.kind === 'scripted').toBe(true)
  expect(Array.isArray(model.environmentEntries)).toBe(true)
  expect(Array.isArray(model.parameters)).toBe(true)
  expect(Array.isArray(model.triggers)).toBe(true)
  expect(Array.isArray(model.options)).toBe(true)
  expect(Array.isArray(model.postHandlers)).toBe(true)
  expect(Array.isArray(model.rootStages)).toBe(true)
  expect(Array.isArray(model.diagnostics)).toBe(true)

  const checkDiagnostics = (diags: readonly Diagnostic[]): void => {
    for (const diag of diags) {
      expect(['error', 'warning']).toContain(diag.severity)
      expect(typeof diag.message).toBe('string')
      expect(diag.message.length).toBeGreaterThan(0)
      expect(Number.isInteger(diag.line)).toBe(true)
      expect(diag.line).toBeGreaterThanOrEqual(1)
    }
  }
  checkDiagnostics(model.diagnostics)

  const seenIds = new Set<string>()
  const visit = (stages: readonly StageNode[]): void => {
    for (const stage of stages) {
      expect(typeof stage.id).toBe('string')
      expect(seenIds.has(stage.id)).toBe(false)
      seenIds.add(stage.id)
      expect(typeof stage.name).toBe('string')
      expect(Number.isInteger(stage.line)).toBe(true)
      expect(stage.line).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(stage.steps)).toBe(true)
      visit(stage.parallelBranches ?? [])
      visit(stage.sequentialChildren ?? [])
    }
  }
  visit(model.rootStages)

  return model
}

describe('fuzz - never throws, always yields a valid model', () => {
  const { inputs, deterministicEvery } = buildInputs()

  it(`survives ${inputs.length} seeded-random inputs`, () => {
    for (const input of inputs) {
      expect(() => parseJenkinsfile(input.text)).not.toThrow()
      checkContract(input.text)
    }
  })

  it(`re-parses every ${deterministicEvery}th input identically`, () => {
    inputs.forEach((input, index) => {
      if (index % deterministicEvery !== 0) return
      expect(JSON.stringify(parseJenkinsfile(input.text))).toBe(
        JSON.stringify(checkContract(input.text)),
      )
    })
  })
})
