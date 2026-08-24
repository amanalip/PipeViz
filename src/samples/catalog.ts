import type { Sample } from './types'

/** Additional presentation-ready examples grouped by the sample picker. */
export const ADDITIONAL_SAMPLES: readonly Sample[] = [
  {
    id: 'multibranch-validation',
    name: 'Multibranch Validation',
    description: 'Pull request validation followed by a main-branch publishing stage',
    category: 'core',
    source: `pipeline {
    agent any
    stages {
        stage('Validate Pull Request') {
            when { changeRequest() }
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
        }
        stage('Publish Main') {
            when { branch 'main' }
            steps {
                sh 'npm publish'
            }
        }
    }
}
`,
  },
  {
    id: 'parameters-environment',
    name: 'Parameters and Environment',
    description: 'Typed parameters and pipeline environment values used by two stages',
    category: 'controls',
    source: `pipeline {
    agent any
    parameters {
        choice(name: 'TARGET', choices: ['staging', 'production'], description: 'Deployment target')
        booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run verification')
        string(name: 'VERSION', defaultValue: 'latest', description: 'Artifact version')
    }
    environment {
        APP_NAME = 'storefront'
        RELEASE = "\${params.VERSION}"
    }
    stages {
        stage('Configure') {
            steps { echo "Preparing \${APP_NAME}:\${RELEASE}" }
        }
        stage('Deploy') {
            steps { sh './deploy.sh --target \${TARGET}' }
        }
    }
}
`,
  },
  {
    id: 'tools-build-options',
    name: 'Tools and Build Options',
    description: 'Pinned JDK and Maven tools with timestamps and build retention',
    category: 'controls',
    source: `pipeline {
    agent any
    tools {
        jdk 'temurin-21'
        maven 'maven-3.9'
    }
    options {
        timestamps()
        ansiColor('xterm')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()
    }
    stages {
        stage('Compile') {
            steps { sh 'mvn -B clean compile' }
        }
        stage('Package') {
            steps { sh 'mvn -B package -DskipTests' }
        }
    }
}
`,
  },
  {
    id: 'timeout-retry',
    name: 'Timeout and Retry',
    description: 'Resilient network work with pipeline timeout and stage retry controls',
    category: 'controls',
    source: `pipeline {
    agent any
    options { timeout(time: 45, unit: 'MINUTES') }
    stages {
        stage('Fetch Dependencies') {
            options { retry(3) }
            steps { sh './fetch-dependencies.sh' }
        }
        stage('Integration Test') {
            options { timeout(time: 12, unit: 'MINUTES') }
            steps { sh './integration-test.sh' }
        }
    }
}
`,
  },
  {
    id: 'input-approval',
    name: 'Input Approval Gate',
    description: 'Human approval between staging verification and production deployment',
    category: 'controls',
    source: `pipeline {
    agent any
    stages {
        stage('Deploy Staging') {
            steps { sh './deploy.sh staging' }
        }
        stage('Production Approval') {
            input {
                message 'Promote the verified release to production?'
                ok 'Promote'
                submitter 'release-managers'
            }
            steps { echo 'Release approved' }
        }
        stage('Deploy Production') {
            steps { sh './deploy.sh production' }
        }
    }
}
`,
  },
  {
    id: 'scheduled-triggers',
    name: 'Scheduled and SCM Triggers',
    description: 'Nightly, polling, and upstream triggers feeding a maintenance pipeline',
    category: 'controls',
    source: `pipeline {
    agent any
    triggers {
        cron('H 2 * * 1-5')
        pollSCM('H/15 * * * *')
        upstream(upstreamProjects: 'platform/main', threshold: SUCCESS)
    }
    stages {
        stage('Refresh') {
            steps { sh './refresh-fixtures.sh' }
        }
        stage('Nightly Verification') {
            steps { sh './verify-all.sh' }
        }
    }
}
`,
  },
  {
    id: 'post-conditions',
    name: 'Post Conditions',
    description: 'Stage and pipeline post handlers for reports, cleanup, and status',
    category: 'controls',
    source: `pipeline {
    agent any
    stages {
        stage('Test') {
            steps { sh 'make test' }
            post {
                always { junit 'reports/*.xml' }
                unsuccessful { archiveArtifacts artifacts: 'logs/**', allowEmptyArchive: true }
            }
        }
    }
    post {
        success { echo 'Pipeline succeeded' }
        failure { echo 'Pipeline failed' }
        cleanup { deleteDir() }
    }
}
`,
  },
  {
    id: 'docker-agent',
    name: 'Docker Agent',
    description: 'Node build isolated in a pinned container image',
    category: 'agents',
    source: `pipeline {
    agent {
        docker {
            image 'node:22-alpine'
            args '-u root:root'
            reuseNode true
        }
    }
    stages {
        stage('Install') { steps { sh 'npm ci' } }
        stage('Test') { steps { sh 'npm test' } }
        stage('Bundle') { steps { sh 'npm run build' } }
    }
}
`,
  },
  {
    id: 'dockerfile-agent',
    name: 'Dockerfile Agent',
    description: 'Repository Dockerfile with custom directory and build arguments',
    category: 'agents',
    source: `pipeline {
    agent {
        dockerfile {
            filename 'ci.Dockerfile'
            dir 'build/docker'
            additionalBuildArgs '--build-arg NODE_VERSION=22'
        }
    }
    stages {
        stage('Compile') { steps { sh 'make compile' } }
        stage('Verify Image') { steps { sh 'make verify-image' } }
    }
}
`,
  },
  {
    id: 'kubernetes-pod-agent',
    name: 'Kubernetes Pod Agent',
    description: 'Kubernetes pod template with separate build and Docker containers',
    category: 'agents',
    source: `pipeline {
    agent {
        kubernetes {
            defaultContainer 'builder'
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: builder
      image: node:22
    - name: docker
      image: docker:27-cli
'''
        }
    }
    stages {
        stage('Build') { steps { sh 'npm ci && npm run build' } }
        stage('Image') { steps { container('docker') { sh 'docker build -t app .' } } }
    }
}
`,
  },
  {
    id: 'windows-powershell',
    name: 'Windows PowerShell',
    description: 'Windows-labelled stages using PowerShell and batch commands',
    category: 'agents',
    source: `pipeline {
    agent { label 'windows && x64' }
    stages {
        stage('Restore') {
            steps { powershell 'dotnet restore App.sln' }
        }
        stage('Build') {
            steps { bat 'dotnet build App.sln --configuration Release' }
        }
        stage('Test') {
            steps { powershell 'dotnet test App.sln --no-build' }
        }
    }
}
`,
  },
  {
    id: 'mixed-agent-overrides',
    name: 'Mixed Agent Overrides',
    description: 'Linux, Windows, and container stages under an agent-free pipeline',
    category: 'agents',
    source: `pipeline {
    agent none
    stages {
        stage('Linux Build') {
            agent { label 'linux' }
            steps { sh 'make linux' }
        }
        stage('Windows Build') {
            agent { label 'windows' }
            steps { bat 'build-windows.cmd' }
        }
        stage('Container Test') {
            agent { docker { image 'python:3.13' } }
            steps { sh 'pytest -q' }
        }
    }
}
`,
  },
  {
    id: 'no-global-agent',
    name: 'No Global Agent',
    description: 'Explicit per-stage allocation avoids holding an idle executor',
    category: 'agents',
    source: `pipeline {
    agent none
    stages {
        stage('Prepare') {
            agent { label 'utility' }
            steps { stash name: 'source', includes: '**/*' }
        }
        stage('Build') {
            agent { label 'high-memory' }
            steps {
                unstash 'source'
                sh 'make release'
            }
        }
    }
}
`,
  },
  {
    id: 'matrix-exclusions',
    name: 'Matrix With Exclusions',
    description: 'Three axes with unsupported combinations removed explicitly',
    category: 'orchestration',
    source: `pipeline {
    agent none
    stages {
        stage('Compatibility') {
            matrix {
                axes {
                    axis { name 'OS'; values 'linux', 'windows' }
                    axis { name 'JDK'; values '17', '21' }
                    axis { name 'DATABASE'; values 'postgres', 'mysql' }
                }
                excludes {
                    exclude {
                        axis { name 'OS'; values 'windows' }
                        axis { name 'DATABASE'; values 'mysql' }
                    }
                }
                stages {
                    stage('Test') { steps { sh './test-compatibility.sh' } }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'matrix-nested-stages',
    name: 'Matrix With Nested Stages',
    description: 'Every platform combination executes prepare, test, and package stages',
    category: 'orchestration',
    source: `pipeline {
    agent none
    stages {
        stage('Release Matrix') {
            matrix {
                axes {
                    axis { name 'OS'; values 'linux', 'windows' }
                    axis { name 'ARCH'; values 'amd64', 'arm64' }
                }
                stages {
                    stage('Prepare') { steps { echo "Preparing \${OS}/\${ARCH}" } }
                    stage('Test') { steps { sh './test-platform.sh' } }
                    stage('Package') { steps { sh './package-platform.sh' } }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'parallel-sequential-branches',
    name: 'Parallel Sequential Branches',
    description: 'Independent frontend, backend, and mobile lanes with ordered internal work',
    category: 'orchestration',
    source: `pipeline {
    agent none
    stages {
        stage('Product Build') {
            parallel {
                stage('Frontend') {
                    stages {
                        stage('Lint UI') { steps { sh 'npm run lint' } }
                        stage('Bundle UI') { steps { sh 'npm run build' } }
                    }
                }
                stage('Backend') {
                    stages {
                        stage('Test API') { steps { sh 'go test ./...' } }
                        stage('Build API') { steps { sh 'go build ./cmd/api' } }
                    }
                }
                stage('Mobile') {
                    stages {
                        stage('Test App') { steps { sh './gradlew test' } }
                        stage('Bundle App') { steps { sh './gradlew bundleRelease' } }
                    }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'parallel-platforms',
    name: 'Parallel Platform Builds',
    description: 'Fan-out to Linux, macOS, and Windows with platform-specific commands',
    category: 'orchestration',
    source: `pipeline {
    agent none
    stages {
        stage('Build Platforms') {
            failFast false
            parallel {
                stage('Linux') {
                    agent { label 'linux' }
                    steps { sh './build.sh linux' }
                }
                stage('macOS') {
                    agent { label 'macos' }
                    steps { sh './build.sh macos' }
                }
                stage('Windows') {
                    agent { label 'windows' }
                    steps { bat 'build.cmd windows' }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'deep-mixed-topology',
    name: 'Deep Mixed Topology',
    description: 'Sequential release phases containing a parallel verification fan-out',
    category: 'orchestration',
    source: `pipeline {
    agent any
    stages {
        stage('Release') {
            stages {
                stage('Prepare') { steps { sh './prepare-release.sh' } }
                stage('Verification') {
                    parallel {
                        stage('Security') { steps { sh './scan-security.sh' } }
                        stage('Performance') { steps { sh './test-performance.sh' } }
                        stage('Compatibility') { steps { sh './test-compatibility.sh' } }
                    }
                }
                stage('Sign') { steps { sh './sign-artifacts.sh' } }
            }
        }
        stage('Publish') { steps { sh './publish-release.sh' } }
    }
}
`,
  },
  {
    id: 'reports-artifacts',
    name: 'Reports and Artifacts',
    description: 'JUnit, HTML reports, coverage, archives, and fingerprinting',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Test') {
            steps { sh './run-tests.sh' }
        }
        stage('Publish Results') {
            steps {
                junit testResults: 'reports/**/*.xml', allowEmptyResults: true
                publishHTML target: [reportDir: 'coverage', reportFiles: 'index.html']
                archiveArtifacts artifacts: 'dist/**', fingerprint: true
            }
        }
    }
}
`,
  },
  {
    id: 'quality-gates',
    name: 'Quality Gates and Coverage',
    description: 'Static analysis, coverage publication, and a quality-gate decision',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Analyze') {
            steps {
                sh './gradlew sonar'
                recordIssues tools: [checkStyle(pattern: 'reports/checkstyle.xml')]
            }
        }
        stage('Coverage') {
            steps { publishCoverage adapters: [jacocoAdapter('build/reports/jacoco.xml')] }
        }
        stage('Quality Gate') {
            steps { waitForQualityGate abortPipeline: true }
        }
    }
}
`,
  },
  {
    id: 'environment-promotion',
    name: 'Environment Promotion',
    description: 'Build once, then promote through development, staging, and production',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Build Release') {
            steps {
                sh './build-release.sh'
                stash name: 'release', includes: 'dist/**'
            }
        }
        stage('Development') { steps { sh './deploy.sh development' } }
        stage('Staging') { steps { sh './deploy.sh staging' } }
        stage('Production') {
            input { message 'Promote staging release?'; ok 'Deploy' }
            steps { sh './deploy.sh production' }
        }
    }
}
`,
  },
  {
    id: 'multi-region-deployment',
    name: 'Multi-Region Deployment',
    description: 'Parallel regional rollouts followed by one global verification stage',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Deploy Regions') {
            failFast true
            parallel {
                stage('US East') { steps { sh './deploy-region.sh us-east-1' } }
                stage('EU West') { steps { sh './deploy-region.sh eu-west-1' } }
                stage('Asia Pacific') { steps { sh './deploy-region.sh ap-southeast-1' } }
            }
        }
        stage('Global Smoke Test') {
            steps { sh './smoke-test-global.sh' }
        }
    }
}
`,
  },
  {
    id: 'rollback-cleanup',
    name: 'Rollback and Cleanup',
    description: 'Deployment with failure rollback and unconditional workspace cleanup',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Snapshot') { steps { sh './snapshot-current.sh' } }
        stage('Deploy') {
            steps { sh './deploy-release.sh' }
            post {
                failure {
                    sh './rollback.sh'
                    archiveArtifacts artifacts: 'rollback-logs/**', allowEmptyArchive: true
                }
            }
        }
        stage('Verify') { steps { sh './smoke-test.sh' } }
    }
    post { cleanup { deleteDir() } }
}
`,
  },
  {
    id: 'notifications-incidents',
    name: 'Notifications and Incidents',
    description: 'Success, unstable, and failure notifications routed to different systems',
    category: 'delivery',
    source: `pipeline {
    agent any
    stages {
        stage('Release') { steps { sh './release.sh' } }
    }
    post {
        success {
            slackSend channel: '#releases', message: 'Release completed'
        }
        unstable {
            emailext to: 'qa@example.com', subject: 'Unstable release'
        }
        failure {
            pagerDuty trigger: true, description: 'Production release failed'
        }
    }
}
`,
  },
  {
    id: 'shared-library-plugins',
    name: 'Shared Library and Plugins',
    description: 'Custom shared-library functions and plugin steps remain visible',
    category: 'real-world',
    source: `@Library('delivery-platform@v3') _

pipeline {
    agent any
    stages {
        stage('Bootstrap') {
            steps { platformBootstrap service: 'checkout-api' }
        }
        stage('Policy Check') {
            steps {
                securityPolicy profile: 'production'
                dependencyAudit failOnHigh: true
            }
        }
        stage('Release') {
            steps { platformDeploy environment: 'production' }
        }
    }
}
`,
  },
  {
    id: 'credentials-secure-deploy',
    name: 'Credentials and Secure Deploy',
    description: 'Runtime credentials, SSH material, and scoped secure deployment work',
    category: 'real-world',
    source: `pipeline {
    agent any
    environment {
        REGISTRY_AUTH = credentials('registry-service-account')
    }
    stages {
        stage('Publish Image') {
            steps {
                withCredentials([string(credentialsId: 'registry-token', variable: 'TOKEN')]) {
                    sh './publish-image.sh'
                }
            }
        }
        stage('Secure Deploy') {
            steps {
                sshagent(credentials: ['production-deployer']) {
                    sh './deploy-over-ssh.sh'
                }
            }
        }
    }
}
`,
  },
  {
    id: 'monorepo-selective-builds',
    name: 'Monorepo Selective Builds',
    description: 'Change-based service selection with parallel application builds',
    category: 'real-world',
    source: `pipeline {
    agent any
    stages {
        stage('Detect Changes') {
            steps { sh './scripts/detect-changed-services.sh' }
        }
        stage('Build Applications') {
            parallel {
                stage('Web') {
                    when { changeset 'apps/web/**' }
                    steps { sh 'npm --workspace apps/web run build' }
                }
                stage('API') {
                    when { changeset 'services/api/**' }
                    steps { sh 'go test ./services/api/...' }
                }
                stage('Worker') {
                    when { changeset 'services/worker/**' }
                    steps { sh 'pytest services/worker' }
                }
            }
        }
    }
}
`,
  },
  {
    id: 'docker-release-workflow',
    name: 'Docker Release Workflow',
    description: 'Build, scan, sign, and publish a versioned container image',
    category: 'real-world',
    source: `pipeline {
    agent { label 'docker && linux' }
    environment {
        IMAGE = 'registry.example.com/storefront'
        TAG = "\${BUILD_NUMBER}"
    }
    stages {
        stage('Build Image') { steps { sh 'docker build -t \${IMAGE}:\${TAG} .' } }
        stage('Scan Image') { steps { sh 'trivy image --exit-code 1 \${IMAGE}:\${TAG}' } }
        stage('Sign Image') { steps { sh 'cosign sign \${IMAGE}:\${TAG}' } }
        stage('Publish Image') { steps { sh 'docker push \${IMAGE}:\${TAG}' } }
    }
}
`,
  },
  {
    id: 'partial-syntax-recovery',
    name: 'Partial Syntax Recovery',
    description: 'A damaged middle stage still leaves useful work before and after it',
    category: 'real-world',
    source: `pipeline {
    agent any
    stages {
        stage('Recovered Build') {
            steps { sh 'make build' }
        }
        stage('Damaged Test') {
            steps {
                sh 'make test'
                echo 'missing braces below'
        stage('Recovered Report') {
            steps {
                junit 'reports/*.xml'
                archiveArtifacts artifacts: 'logs/**', allowEmptyArchive: true
            }
        }
    }
}
`,
  },
]
