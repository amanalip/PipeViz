// ---------------------------------------------------------------------------
// ui/detailsSections.test.ts - display rules for the details panel (§9).
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'

import type { PostHandler, StageNode, Step } from '../model/types'
import { buildDetailSections, stepLabel } from './detailsSections'

function step(name: string, args?: string): Step {
  return { name, ...(args ? { args } : {}), kind: 'known', line: 1 }
}

function stage(overrides: Partial<StageNode> = {}): StageNode {
  return {
    id: 's0',
    name: 'Build',
    line: 3,
    steps: [],
    ...overrides,
  }
}

describe('stepLabel', () => {
  it('renders a zero-arg step as bare name', () => {
    expect(stepLabel(step('checkout'))).toBe('checkout')
  })

  it('keeps raw argument text verbatim, quotes included', () => {
    expect(stepLabel(step('sh', "'make build'"))).toBe("sh 'make build'")
  })

  it('renders named-argument calls without inventing parens', () => {
    expect(stepLabel(step('mail', "to:'oncall@acme.dev'"))).toBe("mail to:'oncall@acme.dev'")
  })
})

describe('buildDetailSections', () => {
  it('returns nothing for a bare stage - no stub rows (§9)', () => {
    expect(buildDetailSections(stage(), [])).toEqual([])
  })

  it('titles the steps section with the count and bullets each line', () => {
    const sections = buildDetailSections(
      stage({ steps: [step('sh', "'make build'"), step('checkout')] }),
      [],
    )
    expect(sections).toEqual([
      { title: 'STEPS (2)', lines: ["sh 'make build'", 'checkout'], bullet: true },
    ])
  })

  it('passes when conditions through verbatim and unbulleted', () => {
    const sections = buildDetailSections(stage({ when: ["branch 'main'", "tag pattern: 'v*'"] }), [])
    expect(sections).toContainEqual({
      title: 'WHEN',
      lines: ["branch 'main'", "tag pattern: 'v*'"],
      bullet: false,
    })
  })

  it('exposes the agent override as its own section', () => {
    const sections = buildDetailSections(stage({ agent: "docker: 'node:20-bookworm'" }), [])
    expect(sections).toContainEqual({ title: 'AGENT', lines: ["docker: 'node:20-bookworm'"], bullet: false })
  })

  it('shows only handlers scoped to the selected stage', () => {
    const handlers: PostHandler[] = [
      { condition: 'failure', steps: [step('mail', "to:'ops@example.com'")], stage: 'Deploy' },
      { condition: 'success', steps: [step('echo', "'all good'")] },
      { condition: 'unstable', steps: [step('slackSend', "channel:'#ci'")], stage: 'Deploy' },
      { condition: 'always', steps: [], stage: 'Deploy' },
    ]
    const sections = buildDetailSections(stage({ name: 'Deploy' }), handlers)
    expect(sections.map((section) => section.title)).toEqual([
      'POST · failure',
      'POST · unstable',
    ])
    expect(sections[0]).toEqual({
      title: 'POST · failure',
      lines: ["mail to:'ops@example.com'"],
      bullet: true,
    })
  })

  it('orders sections STEPS, WHEN, AGENT, POST regardless of model shape', () => {
    const sections = buildDetailSections(
      stage({
        agent: 'any',
        when: ["branch 'main'"],
        steps: [step('sh')],
        name: 'Ship',
      }),
      [{ condition: 'always', steps: [step('echo')], stage: 'Ship' }],
    )
    expect(sections.map((section) => section.title)).toEqual([
      'STEPS (1)',
      'WHEN',
      'AGENT',
      'POST · always',
    ])
  })
})
