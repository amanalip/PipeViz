// ---------------------------------------------------------------------------
// samples/index.ts - built-in example Jenkinsfiles (plan §11).
//
// The 36-example catalog doubles as documentation and parser fixtures. The
// picker groups six samples into each of six categories. Recovery examples
// deliberately retain malformed syntax so diagnostics stay exercised.
//
// Note for editors: GString `${...}` sequences are escaped as \${ inside
// these template literals - they must survive verbatim into Groovy source.
// ---------------------------------------------------------------------------

import { ADDITIONAL_SAMPLES } from './catalog'
import type { Sample } from './types'

export type { Sample, SampleCategory } from './types'
export { SAMPLE_CATEGORIES, SAMPLE_CATEGORY_LABELS } from './types'

const SIMPLE_CI = `pipeline {
    agent any

    environment {
        APP_NAME = 'pipeviz-demo'
        BUILD_DIR = "work/\${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build') {
            steps {
                sh 'make build'
            }
        }
        stage('Test') {
            steps {
                sh 'make test'
                junit 'reports/*.xml'
            }
        }
        stage('Deploy') {
            steps {
                sh 'make deploy'
            }
        }
    }

    post {
        always {
            echo 'Pipeline finished'
        }
    }
}
`

const PARALLEL_TESTS = `pipeline {
    agent { label 'linux' }

    stages {
        stage('Build') {
            steps {
                sh 'make all'
            }
        }
        stage('Test') {
            failFast true
            parallel {
                stage('Unit') {
                    steps {
                        sh 'make test-unit'
                    }
                }
                stage('Integration') {
                    steps {
                        sh 'make test-integration'
                    }
                }
                stage('Lint') {
                    steps {
                        npx 'eslint .'
                    }
                }
            }
        }
        stage('Report') {
            steps {
                junit 'out/*.xml'
                publishHTML(target: [reportDir: 'coverage'])
            }
        }
    }
}
`

const MATRIX_BUILD = `pipeline {
    agent none

    stages {
        stage('Deps') {
            steps {
                echo 'Fetching dependencies once for the whole matrix'
            }
        }
        stage('Matrix Build') {
            matrix {
                axes {
                    axis {
                        name 'OS'
                        values 'linux', 'windows'
                    }
                    axis {
                        name 'BROWSER'
                        values 'chrome', 'firefox'
                    }
                }
                excludes {
                    exclude {
                        axis {
                            name 'OS'
                            values 'windows'
                        }
                        axis {
                            name 'BROWSER'
                            values 'firefox'
                        }
                    }
                }
                stages {
                    stage('Cell') {
                        steps {
                            sh 'make ci OS=\${OS} BROWSER=\${BROWSER}'
                        }
                    }
                }
            }
        }
        stage('Bundle') {
            steps {
                archiveArtifacts artifacts: 'dist/**', fingerprint: true
            }
        }
    }
}
`

const CONDITIONAL_DEPLOY = `pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 1, unit: 'HOURS')
    }

    parameters {
        string(name: 'TARGET_ENV', defaultValue: 'staging', description: 'Deployment target')
        choice(name: 'MODE', choices: ['fast', 'full'], description: 'Build depth')
    }

    triggers {
        cron('H 2 * * *')
        upstream(threshold: SUCCESS, upstreamProjects: 'lib/main')
    }

    stages {
        stage('Verify') {
            when {
                anyOf {
                    branch pattern: "PR-.*", comparator: 'REGEXP'
                    environment name: 'SKIP_VERIFY', value: ''
                }
            }
            steps {
                sh 'make verify'
            }
        }
        stage('Approval Gate') {
            input {
                message 'Deploy to production?'
                ok 'Ship it'
            }
            steps {
                echo 'Approved'
            }
        }
        stage('Deploy Production') {
            when {
                allOf {
                    branch 'main'
                    equals expected: 'production', actual: params.TARGET_ENV
                }
            }
            post {
                failure {
                    emailext subject: 'Deploy failed', to: 'ops@example.com'
                }
                unstable {
                    slackSend channel: '#deploys', message: 'Unstable deploy'
                }
            }
            steps {
                sh './deploy.sh --env "\${TARGET_ENV}" --mode "\${MODE}"'
            }
        }
    }

    post {
        success {
            echo 'All good'
        }
    }
}
`

const SEQUENTIAL_GROUPS = `pipeline {
    agent { docker { image 'node:18' args '-u root' } }

    stages {
        stage('Preparation') {
            steps {
                git url: 'https://example.com/app.git', branch: 'main'
            }
        }
        stage('Quality Suite') {
            when { not { changelog '.*\\[skip ci\\].*' } }
            stages {
                stage('Static Analysis') {
                    steps {
                        npx 'tsc --noEmit'
                    }
                }
                stage('Deep Checks') {
                    stages {
                        stage('Types') {
                            steps {
                                npx 'tsprune'
                            }
                        }
                        stage('Dead Code') {
                            steps {
                                npx 'knip'
                            }
                        }
                    }
                }
            }
        }
        stage('Package') {
            steps {
                dir('dist') {
                    stash name: 'bundle', includes: '*.js'
                }
            }
        }
    }
}
`

const SCRIPTED_CLASSIC = `@Library('shared-utils@main') _

node('built-in') {
    def workspace = pwd()
    def version = null

    stage('Prepare') {
        checkout scm
        version = sh(script: 'git describe --tags', returnStdout: true).trim()
    }

    try {
        stage('Compile') {
            withEnv(["VERSION=\${version}"]) {
                sh 'make compile'
            }
        }

        stage('Containerize') {
            stage('Image') {
                docker.build("app:\${version}")
            }
            stage('Push') {
                sh 'docker push'
            }
        }
    } catch (err) {
        echo "Failed: \${err}"
        throw err
    } finally {
        stage('Cleanup') {
            deleteDir()
        }
    }
}
`

const MESSY_REALWORLD = `// legacy Jenkinsfile, do not reformat
   pipeline {
      agent { label 'docker && linux' } /* pinned fleet */

      environment {
          REGISTRY = 'registry.example.com'
          TAG = "build-\${BUILD_NUMBER}"
      // credentials resolved at runtime
          DOCKER_AUTH = credentials('docker-auth')
      }

      stages {

         stage('Checkout') {
            steps { git branch: 'develop', url: 'https://example.com/monorepo.git'; echo 'checked out' }
         }

         stage('Smoke Test') {
             steps {
                 sh '''
#!/bin/bash
set -euo pipefail
echo "smoke testing tag=\${TAG} against registry=\${REGISTRY}"
curl -fsS "https://\${REGISTRY}/health" | grep -q ok || { echo unhealthy; exit 1; }
'''
             }
         }

      /* The next stage is missing its closing brace on purpose:
         brace recovery keeps the graph alive and reports the defect. */
         stage('Broken Tail') {
             steps {
                 bat 'echo windows path'
                  archiveArtifacts artifacts: 'logs/**/*.log', allowEmptyArchive: true

         stage('Never Reached') {
             steps {
                 echo 'unreachable'
             }
         }
    }
}
`

export const SAMPLES: readonly Sample[] = [
  {
    id: 'simple-ci',
    name: 'Simple CI',
    description: 'Four sequential stages with environment entries and an always handler',
    category: 'core',
    source: SIMPLE_CI,
  },
  {
    id: 'parallel-tests',
    name: 'Parallel Tests',
    description: 'Three fail-fast lanes converging into a reporting stage',
    category: 'core',
    source: PARALLEL_TESTS,
  },
  {
    id: 'matrix-build',
    name: 'Matrix Build',
    description: 'Two-axis matrix with excludes and a per-cell nested stage',
    category: 'orchestration',
    source: MATRIX_BUILD,
  },
  {
    id: 'conditional-deploy',
    name: 'Conditional Deploy',
    description: 'Parameters, triggers, when combinators, approval gate, and stage post handlers',
    category: 'core',
    source: CONDITIONAL_DEPLOY,
  },
  {
    id: 'sequential-groups',
    name: 'Sequential Groups',
    description: 'Nested stages two levels deep inside a docker agent pipeline',
    category: 'core',
    source: SEQUENTIAL_GROUPS,
  },
  {
    id: 'scripted-classic',
    name: 'Scripted Classic',
    description: 'Node-based scripted pipeline with shared library import and nested stages',
    category: 'core',
    source: SCRIPTED_CLASSIC,
  },
  {
    id: 'messy-realworld',
    name: 'Messy Real World',
    description: 'Odd indentation, comments mid-block, long scripts, and one unbalanced brace',
    category: 'real-world',
    source: MESSY_REALWORLD,
  },
  ...ADDITIONAL_SAMPLES,
]

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((sample) => sample.id === id)
}
