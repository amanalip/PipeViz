import { describe, expect, it } from 'vitest'

import { parseJenkinsfile } from '../parser'
import { buildPipelineMetadataSections, pipelineMetadataBadges } from './pipelineMetadata'

const source = `pipeline {
  agent { label 'linux' }
  environment { REGION = 'ca-central-1' }
  tools { jdk 'temurin-21'; maven 'maven-3.9' }
  options { timestamps(); timeout(time: 30, unit: 'MINUTES') }
  parameters { string(name: 'VERSION', defaultValue: 'latest') }
  triggers { cron('H 2 * * *') }
  stages { stage('Build') { steps { sh 'make' } } }
  post { success { echo 'done' } }
}`

describe('pipeline metadata labels', () => {
  it('shows the real inherited agent plus concise counts', () => {
    expect(pipelineMetadataBadges(parseJenkinsfile(source)).map((badge) => badge.label)).toEqual([
      'AGENT · linux',
      'ENV ×1',
      'TOOLS ×2',
      'OPT ×2',
      'PARAM ×1',
      'TRIGGER ×1',
      'POST ×1',
    ])
  })

  it('provides the complete values behind compact badges', () => {
    const sections = buildPipelineMetadataSections(parseJenkinsfile(source))
    expect(sections).toEqual([
      { title: 'AGENT', lines: ["label 'linux'"], bullet: false },
      { title: 'ENVIRONMENT (1)', lines: ["REGION = 'ca-central-1'"], bullet: true },
      { title: 'TOOLS (2)', lines: ["jdk 'temurin-21'", "maven 'maven-3.9'"], bullet: true },
      { title: 'OPTIONS (2)', lines: ['timestamps', "timeout(time: 30, unit: 'MINUTES')"], bullet: true },
      { title: 'PARAMETERS (1)', lines: ["string(name: 'VERSION', defaultValue: 'latest')"], bullet: true },
      { title: 'TRIGGERS (1)', lines: ["cron('H 2 * * *')"], bullet: true },
      { title: 'POST · success', lines: ["line 9 · known · echo 'done'"], bullet: true },
    ])
  })
})
