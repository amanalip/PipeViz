// ---------------------------------------------------------------------------
// parser/interpret.test.ts - declarative vocabulary coverage (plan §6.3).
//
// Walks every recognized construct through the public parseJenkinsfile API
// (plus a few exported helpers directly): pipeline sections, agent forms,
// environment/options/parameters/triggers, post handlers, when conditions,
// parallel + failFast placements, matrix axes, nested stages, input, and
// the lenient unknown-construct capture rules.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest'
import { parseJenkinsfile } from './index'
import { collectMatrixAxes } from './interpret'
import { buildBlockTree } from './blockTree'
import { tokenize } from './tokenize'
import { allStages, req } from './testSupport'
import type { PipelineModel, StageNode } from '../model/types'

const parse = (src: string): PipelineModel => parseJenkinsfile(src)

const stageNamed = (model: PipelineModel, name: string): StageNode =>
  req(
    model.rootStages.find((s) => s.name === name),
    `stage '${name}' not found`,
  )

describe('declarative - pipeline sections', () => {
  it('reads agent in every documented form', () => {
    const cases: [string, string][] = [
      ['agent any', 'any'],
      ['agent none', 'none'],
      ["agent { label 'linux' }", "label 'linux'"],
      [
        "agent { docker { image 'node:18' args '-u root' } }",
        "docker { image 'node:18' args '-u root' }",
      ],
      ['agent {\n  kubernetes {\n    cloud "prod"\n  }\n}', 'kubernetes { cloud "prod" }'],
    ]
    for (const [agentSrc, expected] of cases) {
      const model = parse(`pipeline {\n  ${agentSrc}\n  stages {}\n}`)
      expect(model.agent).toBe(expected)
    }
  })

  it('reads environment entries including credentials() values', () => {
    const model = parse(
      [
        'pipeline {',
        '  environment {',
        "    APP = 'x'",
        "    CREDS = credentials('aws-key')",
        '    GREETING = "hello ${NAME}"',
        '  }',
        '  stages {}',
        '}',
      ].join('\n'),
    )
    expect(model.environmentEntries).toEqual([
      { key: 'APP', value: "'x'", line: 3 },
      { key: 'CREDS', value: "credentials('aws-key')", line: 4 },
      { key: 'GREETING', value: '"hello ${NAME}"', line: 5 },
    ])
  })

  it('reads options with and without arguments', () => {
    const model = parse(
      [
        'pipeline {',
        '  options {',
        '    timestamps()',
        '    disableConcurrentBuilds()',
        "    timeout(time: 1, unit: 'HOURS')",
        "    buildDiscarder(logRotator(numToKeepStr: '10'))",
        '  }',
        '  stages {}',
        '}',
      ].join('\n'),
    )
    expect(model.options.map((o) => o.name)).toEqual([
      'timestamps',
      'disableConcurrentBuilds',
      'timeout',
      'buildDiscarder',
    ])
    expect(model.options[2]?.args).toBe("time: 1, unit: 'HOURS'")
    expect(model.options[3]?.args).toBe("logRotator(numToKeepStr: '10')")
  })

  it('reads parameters of common types with an unnamed fallback', () => {
    const model = parse(
      [
        'pipeline {',
        '  parameters {',
        "    string(name: 'TARGET', defaultValue: 'staging')",
        "    booleanParam(name: 'DRY', defaultValue: false)",
        "    choice(name: 'MODE', choices: ['fast', 'full'])",
        '    password(name: \'SECRET\')',
        "    text(defaultValue: 'unnamed one')",
        '  }',
        '  stages {}',
        '}',
      ].join('\n'),
    )
    expect(model.parameters).toEqual([
      { name: 'TARGET', type: 'string', args: "name: 'TARGET', defaultValue: 'staging'", line: 3 },
      { name: 'DRY', type: 'booleanParam', args: "name: 'DRY', defaultValue: false", line: 4 },
      { name: 'MODE', type: 'choice', args: "name: 'MODE', choices: ['fast', 'full']", line: 5 },
      { name: 'SECRET', type: 'password', args: "name: 'SECRET'", line: 6 },
      { name: '(unnamed)', type: 'text', args: "defaultValue: 'unnamed one'", line: 7 },
    ])
  })

  it('reads triggers as raw display strings', () => {
    const model = parse(
      [
        'pipeline {',
        '  triggers {',
        "    cron('H 2 * * *')",
        "    pollSCM('H/5 * * * *')",
        "    upstream(threshold: SUCCESS, upstreamProjects: 'lib/main')",
        '  }',
        '  stages {}',
        '}',
      ].join('\n'),
    )
    expect(model.triggers).toEqual([
      "cron('H 2 * * *')",
      "pollSCM('H/5 * * * *')",
      "upstream(threshold: SUCCESS, upstreamProjects: 'lib/main')",
    ])
  })

  it('warns on unrecognized sections but keeps library silent', () => {
    const model = parse(
      [
        'pipeline {',
        '  library loader: modernSCM',
        '  mysterySection { x }',
        '  stages { stage("a") { steps { echo hi } } }',
        '}',
      ].join('\n'),
    )
    const warnings = model.diagnostics.filter((d) => d.severity === 'warning')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toBe("Unrecognized pipeline section 'mysterySection'")
  })

  it('warns when the pipeline declares no stages', () => {
    const model = parse('pipeline { agent any }')
    expect(model.rootStages).toEqual([])
    expect(model.diagnostics.some((d) => d.message.includes('declares no stages'))).toBe(true)
  })
})

describe('declarative - post handlers', () => {
  it('collects every condition at pipeline scope without a stage tag', () => {
    const model = parse(
      [
        'pipeline {',
        '  agent any',
        '  stages { stage("a") { steps { echo hi } } }',
        '  post {',
        "    always { echo 'bye' }",
        "    success { archiveArtifacts 'o/**' }",
        "    failure { mail to: 'ops@example.com' }",
        '    unstable { echo u }',
        '    aborted { echo a }',
        '    cleanup { deleteDir() }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(model.postHandlers.map((h) => h.condition)).toEqual([
      'always',
      'success',
      'failure',
      'unstable',
      'aborted',
      'cleanup',
    ])
    expect(model.postHandlers.every((h) => h.stage === undefined)).toBe(true)
    expect(model.postHandlers[5]?.steps[0]?.name).toBe('deleteDir')
  })

  it('folds stage-level post handlers into the list with a stage tag', () => {
    const model = parse(
      [
        'pipeline {',
        '  agent any',
        '  stages {',
        '    stage("risky") {',
        '      post {',
        '        failure { echo f }',
        '      }',
        '      steps { echo go }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(model.postHandlers).toHaveLength(1)
    expect(model.postHandlers[0]?.stage).toBe('risky')
    expect(model.postHandlers[0]?.condition).toBe('failure')
  })
})

describe('declarative - when conditions', () => {
  const whenCases: [string, string[]][] = [
    ["when { branch 'main' }", ["branch 'main'"]],
    ['when { branch pattern: "PR-.*", comparator: \'REGEXP\' }', ['branch pattern: "PR-.*", comparator: \'REGEXP\'']],
    ['when { tag pattern: "v*" }', ['tag pattern: "v*"']],
    ['when { buildingTag() }', ['buildingTag()']],
    ["when { changelog '^\\[deps\\]' }", ["changelog '^\\[deps\\]'"]],
    [
      "when { environment name: 'DEPLOY_TO', value: 'production' }",
      ["environment name: 'DEPLOY_TO', value: 'production'"],
    ],
    ['when { equals expected: 2, actual: params.N }', ['equals expected: 2, actual: params.N']],
    ['when { allOf { branch "main" } }', ['allOf { … }']],
    ['when { anyOf { tag "v*" } }', ['anyOf { … }']],
    ['when { not { branch "dev" } }', ['not { … }']],
    ['when { expression { return env.X == "y" } }', ['expression { … }']],
  ]

  for (const [whenSrc, expected] of whenCases) {
    it(`captures ${whenSrc.slice(7, 40)}...`, () => {
      const model = parse(
        ['pipeline {', '  agent any', '  stages {', '    stage("w") {', `      ${whenSrc}`, '      steps { echo hi }', '    }', '  }', '}'].join('\n'),
      )
      expect(stageNamed(model, 'w').when).toEqual(expected)
    })
  }

  it('omits the when field entirely when absent', () => {
    const model = parse('pipeline { stages { stage("p") { steps { echo hi } } } }')
    expect(stageNamed(model, 'p').when).toBeUndefined()
  })
})

describe('declarative - parallel groups', () => {
  it('fans out branches with path ids and captures failFast adjacent to parallel', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("t") {',
        '      failFast true',
        '      parallel {',
        '        stage("a") { steps { echo 1 } }',
        '        stage("b") { steps { echo 2 } }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const test = stageNamed(model, 't')
    expect(test.failFast).toBe(true)
    expect(test.steps).toEqual([])
    expect(test.parallelBranches?.map((b) => b.id)).toEqual(['s0/p0', 's0/p1'])
    expect(test.parallelBranches?.map((b) => b.name)).toEqual(['a', 'b'])
  })

  it('accepts failFast inside the parallel group as well', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("t") {',
        '      parallel {',
        '        failFast true',
        '        stage("a") { steps { echo 1 } }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(stageNamed(model, 't').failFast).toBe(true)
    expect(model.diagnostics.filter((d) => d.severity === 'warning')).toEqual([])
  })

  it('warns about non-stage entries in parallel instead of crashing', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("t") {',
        '      parallel {',
        '        echo rogue',
        '        stage("a") { steps { echo 1 } }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(stageNamed(model, 't').parallelBranches).toHaveLength(1)
    const warnings = model.diagnostics.filter((d) => d.message.includes("'parallel'"))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.line).toBe(5)
  })
})

describe('declarative - matrix', () => {
  it('summarizes axis names and ignores excludes silently', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("m") {',
        '      matrix {',
        '        axes {',
        '          axis {',
        "            name 'OS'",
        "            values 'linux', 'windows'",
        '          }',
        '          axis {',
        "            name 'ARCH'",
        "            values 'amd64', 'arm64'",
        '          }',
        '        }',
        '        excludes {',
        '          exclude { axis { name "OS"; values "windows" } }',
        '        }',
        '        stages {',
        '          stage("cell") { steps { echo run } }',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const matrix = stageNamed(model, 'm')
    expect(matrix.matrixAxes).toEqual(['OS', 'ARCH'])
    expect(matrix.parallelBranches).toBeUndefined()
    // Axis-combination expansion is deliberately deferred (plan Q1).
    expect(matrix.sequentialChildren).toBeUndefined()
  })

  it('returns no axes when the axes block is absent', () => {
    const { root } = buildBlockTree(tokenize('matrix { stages {} }').tokens)
    const matrix = root.children.find(
      (c): c is Extract<typeof c, { kind: 'block' }> => c.kind === 'block',
    )
    expect(collectMatrixAxes(req(matrix))).toEqual([])
  })

  it('captures per-axis notValues next to values (Jenkins excludes shorthand)', () => {
    // Jenkins officially supports notValues inside an axis; combinations
    // carrying a refused value are excluded from expansion.
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("m") {',
        '      matrix {',
        '        axes {',
        '          axis {',
        "            name 'OS'",
        "            values 'linux', 'windows'",
        '          }',
        '          axis {',
        "            name 'BROWSER'",
        "            values 'chrome', 'edge'",
        "            notValues 'edge'",
        '          }',
        '        }',
        '        stages {',
        '          stage("cell") { steps { echo run } }',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const matrix = stageNamed(model, 'm')
    expect(matrix.matrixAxisValues).toEqual([
      ['linux', 'windows'],
      ['chrome', 'edge'],
    ])
    expect(matrix.matrixAxisNotValues).toEqual([[], ['edge']])
  })

  it('keeps matrix cell stages as a real chain under relative ids', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("m") {',
        '      matrix {',
        '        axes { axis { name \'OS\'; values \'linux\' } }',
        '        stages {',
        '          stage("Build Cell") { steps { sh \'make\' } }',
        '          stage("Test Cell") { steps { sh \'make test\' } }',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const cells = stageNamed(model, 'm').matrixCellStages ?? []
    expect(cells.map((cell) => [cell.id, cell.name])).toEqual([
      ['c0', 'Build Cell'],
      ['c1', 'Test Cell'],
    ])
    expect((cells[0]?.steps ?? []).map((step) => step.name)).toEqual(['sh'])
    // Flat capture stays in sync for the compact card's CELLS summary.
    expect(stageNamed(model, 'm').matrixCellSteps?.length).toBe(2)
  })
})

describe('declarative - nested sequential stages', () => {
  it('assigns path ids through multiple nesting levels', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("g") {',
        '      stages {',
        '        stage("g1") { steps { echo 1 } }',
        '        stage("g2") {',
        '          stages {',
        '            stage("g2a") { steps { echo 2 } }',
        '          }',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const g = stageNamed(model, 'g')
    expect(g.sequentialChildren?.map((c) => c.id)).toEqual(['s0/sq0', 's0/sq1'])
    const g2 = req(g.sequentialChildren?.find((c) => c.name === 'g2'))
    expect(g2.sequentialChildren?.map((c) => c.id)).toEqual(['s0/sq1/sq0'])
  })

  it('warns when one stage body mixes parallel with nested stages', () => {
    // The layout renders only the container shape; without this warning the
    // nested chain would silently vanish from the graph.
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("both") {',
        '      parallel {',
        '        stage("a") { steps { echo 1 } }',
        '      }',
        '      stages {',
        '        stage("b") { steps { echo 2 } }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const both = stageNamed(model, 'both')
    expect(both.parallelBranches).toHaveLength(1)
    expect(both.sequentialChildren).toHaveLength(1)
    const warning = model.diagnostics.find((d) => d.message.includes('mixes'))
    expect(warning?.severity).toBe('warning')
    expect(warning?.message).toContain("'both'")
    // The warning states the hard-coded precedence instead of claiming a
    // specific structure "wins" (which depends on the matrix toggle).
    expect(warning?.message).toContain('parallel before matrix before nested')
    expect(warning?.line).toBe(3)
  })

  it('warns when nested stages contain non-stage items', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("g") {',
        '      stages {',
        '        echo rogue',
        '        stage("g1") { steps { echo 1 } }',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const warnings = model.diagnostics.filter((d) => d.message.includes("nested 'stages'"))
    expect(warnings).toHaveLength(1)
  })

  it('warns when top-level stages contain non-stage items', () => {
    const model = parse('pipeline { stages { echo rogue; stage("a") { steps { echo 1 } } } }')
    expect(model.diagnostics.filter((d) => d.message.includes("inside 'stages'"))).toHaveLength(1)
  })
})

describe('declarative - stage directives', () => {
  it('marks input stages and captures stage agents', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("gate") {',
        "      input { message 'Proceed?' }",
        "      agent { label 'special' }",
        '      steps { echo go }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const gate = stageNamed(model, 'gate')
    expect(gate.hasInput).toBe(true)
    expect(gate.agent).toBe("label 'special'")
  })

  it('keeps tools/environment/options directives out of step lists', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("b") {',
        "      tools { maven 'm3' }",
        '      environment { FOO = "bar" }',
        '      options { timeout(time: 5) }',
        '      steps { sh mvn }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(stageNamed(model, 'b').steps.map((s) => s.name)).toEqual(['sh'])
  })

  it('keeps unknown plugin directives visible as generic steps', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("u") {',
        "      myPluginThing 'arg'",
        '      steps { echo visible }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const u = stageNamed(model, 'u')
    expect(u.steps[0]).toEqual({ name: 'myPluginThing', args: "'arg'", kind: 'unknown', line: 4 })
    expect(u.steps[1]?.name).toBe('echo')
  })

  it('unfolds braced wrappers inline while preserving order', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("w") {',
        '      steps {',
        "        dir('sub') {",
        "          timeout(time: 30) {",
        '            retry(3) {',
        "              sh 'inner'",
        '            }',
        '          }',
        '        }',
        "        echo 'after'",
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(stageNamed(model, 'w').steps.map((s) => `${s.name}:${s.args ?? ''}`)).toEqual([
      "dir:'sub'",
      'timeout:time: 30',
      'retry:3',
      "sh:'inner'",
      "echo:'after'",
    ])
  })
})

describe('step classification', () => {
  it('keeps slashy-string braces out of the block tree', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        "    stage('A') { steps { echo /}/ } }",
        "    stage('B') { steps { echo 'ok' } }",
        '  }',
        '}',
      ].join('\n'),
    )
    expect(model.rootStages.map((stage) => stage.name)).toEqual(['A', 'B'])
    expect(stageNamed(model, 'A').steps[0]).toMatchObject({ name: 'echo', args: '/}/' })
    expect(model.diagnostics).toEqual([])
  })

  it('classifies known, unknown, and script-shaped statements', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("k") {',
        '      steps {',
        "          sh 'known'",
        '          weirdStep 1',
        '          def total = 1 + 2',
        '          return null',
        '          if (env.X == "y") { echo yes }',
        '          "just a string"',
        '          checkout scmGit',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const steps = stageNamed(model, 'k').steps
    expect(steps[0]).toMatchObject({ name: 'sh', kind: 'known', args: "'known'" })
    expect(steps[1]).toMatchObject({ name: 'weirdStep', kind: 'unknown' })
    expect(steps[2]).toMatchObject({ name: 'def', kind: 'script' })
    expect(steps[3]).toMatchObject({ name: 'return', kind: 'script' })
    expect(steps[4]).toMatchObject({ name: 'if', kind: 'script' })
    // The if's brace unfolds its body inline, so echo lands before the rest.
    expect(steps[5]).toMatchObject({ name: 'echo', args: 'yes', kind: 'known' })
    expect(steps[6]).toMatchObject({ name: 'expression', kind: 'script', args: '"just a string"' })
    expect(steps[7]).toMatchObject({ name: 'checkout', kind: 'known', args: 'scmGit' })
  })

  it('does not treat equality comparison as assignment', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("e") {',
        '      script { x = y == z }',
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    const steps = stageNamed(model, 'e').steps
    expect(steps.some((s) => s.name === 'script')).toBe(true)
  })
})

describe('declarative - structural integrity', () => {
  it('produces unique ids across the whole model for a deeply grouped sample', () => {
    const model = parse(
      [
        'pipeline {',
        '  stages {',
        '    stage("a") {',
        '      parallel {',
        '        stage("p1") {',
        '          stages { stage("deep") { steps { echo d } } }',
        '        }',
        '        stage("p2") { steps { echo 2 } }',
        '      }',
        '    }',
        '    stage("b") { steps { echo b } }',
        '  }',
        '}',
      ].join('\n'),
    )
    const ids = allStages(model.rootStages).map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('declarative metadata scopes', () => {
  it('captures pipeline tools and detailed stage overrides', () => {
    const model = parse(
      [
        'pipeline {',
        "  agent { label 'linux' }",
        "  tools { jdk 'temurin-21' }",
        '  stages {',
        "    stage('Release') {",
        "      agent { label 'windows' }",
        "      environment { MODE = 'release' }",
        "      tools { gradle 'gradle-8' }",
        "      options { timeout(time: 5, unit: 'MINUTES') }",
        "      input { message 'Release?'; ok 'Ship' }",
        "      steps { echo 'go' }",
        '    }',
        '  }',
        '}',
      ].join('\n'),
    )
    expect(model.agent).toBe("label 'linux'")
    expect(model.tools).toEqual([{ type: 'jdk', name: "'temurin-21'", line: 3 }])
    expect(stageNamed(model, 'Release')).toMatchObject({
      agent: "label 'windows'",
      environmentEntries: [{ key: 'MODE', value: "'release'", line: 7 }],
      tools: [{ type: 'gradle', name: "'gradle-8'", line: 8 }],
      options: [{ name: 'timeout', args: "time: 5, unit: 'MINUTES'", line: 9 }],
      hasInput: true,
      input: ["message 'Release?'", "ok 'Ship'"],
    })
  })
})
