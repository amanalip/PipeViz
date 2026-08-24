export const SAMPLE_CATEGORIES = [
  'core',
  'controls',
  'agents',
  'orchestration',
  'delivery',
  'real-world',
] as const

export type SampleCategory = (typeof SAMPLE_CATEGORIES)[number]

export const SAMPLE_CATEGORY_LABELS: Record<SampleCategory, string> = {
  core: 'Core Patterns',
  controls: 'Configuration and Controls',
  agents: 'Agents and Platforms',
  orchestration: 'Advanced Orchestration',
  delivery: 'Delivery and Operations',
  'real-world': 'Real World and Recovery',
}

export interface Sample {
  /** Stable identifier used by tests and the sample picker. */
  id: string
  name: string
  description: string
  category: SampleCategory
  source: string
}
