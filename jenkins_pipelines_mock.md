# PipeViz Jenkinsfile UX corpus

This corpus contains 60 compact Jenkinsfile variations for parser and interface review. It mixes common production shapes, uncommon but valid structures, work in progress files, and intentionally malformed tails. Each fenced block is one independent input.

## Basic declarative pipelines

### 01. Minimal stage

```groovy
pipeline {
  agent any
  stages { stage('Build') { steps { sh 'make' } } }
}
```

### 02. Several steps

```groovy
pipeline {
  agent any
  stages { stage('Build') { steps { checkout scm; sh 'make'; archiveArtifacts 'dist/**' } } }
}
```

### 03. Empty work in progress stage

```groovy
pipeline {
  agent any
  stages { stage('TODO') { steps { } } }
}
```

### 04. Long stage name

```groovy
pipeline {
  agent any
  stages { stage('Build and validate the customer-facing production application') { steps { sh 'make verify' } } }
}
```

### 05. Unicode stage names

```groovy
pipeline {
  agent any
  stages { stage('Vérifier 日本語') { steps { echo 'ok' } } }
}
```

### 06. Agent none with stage agents

```groovy
pipeline {
  agent none
  stages {
    stage('Linux') { agent { label 'linux' } steps { sh 'uname -a' } }
    stage('Windows') { agent { label 'windows' } steps { bat 'ver' } }
  }
}
```

### 07. Docker agent

```groovy
pipeline {
  agent { docker { image 'node:22-alpine'; args '-u root' } }
  stages { stage('Test') { steps { sh 'npm test' } } }
}
```

### 08. Custom label expression

```groovy
pipeline {
  agent { label 'linux && docker && high-memory' }
  stages { stage('Compile') { steps { sh './gradlew assemble' } } }
}
```

### 09. Environment and credentials

```groovy
pipeline {
  agent any
  environment { REGISTRY = 'registry.example.com'; TOKEN = credentials('registry-token') }
  stages { stage('Publish') { steps { sh 'docker push ${REGISTRY}/app' } } }
}
```

### 10. Tools directive

```groovy
pipeline {
  agent any
  tools { jdk 'temurin-21'; maven 'maven-3.9' }
  stages { stage('Package') { steps { sh 'mvn package' } } }
}
```

## Conditions and controls

### 11. Branch condition

```groovy
pipeline {
  agent any
  stages { stage('Deploy') { when { branch 'main' } steps { sh './deploy.sh' } } }
}
```

### 12. Any-of condition

```groovy
pipeline {
  agent any
  stages {
    stage('Publish') {
      when { anyOf { branch 'main'; buildingTag() } }
      steps { sh './publish.sh' }
    }
  }
}
```

### 13. All-of condition

```groovy
pipeline {
  agent any
  stages {
    stage('Production') {
      when { allOf { branch 'main'; environment name: 'TARGET', value: 'prod' } }
      steps { sh './deploy-prod.sh' }
    }
  }
}
```

### 14. Input gate

```groovy
pipeline {
  agent any
  stages {
    stage('Approve') { input { message 'Deploy now?'; ok 'Deploy' } steps { echo 'approved' } }
  }
}
```

### 15. Stage post handlers

```groovy
pipeline {
  agent any
  stages {
    stage('Test') {
      steps { sh 'make test' }
      post { always { junit 'reports/*.xml' } failure { echo 'tests failed' } }
    }
  }
}
```

### 16. Pipeline post handlers

```groovy
pipeline {
  agent any
  stages { stage('Build') { steps { sh 'make' } } }
  post { success { echo 'success' } cleanup { deleteDir() } }
}
```

### 17. Options

```groovy
pipeline {
  agent any
  options { timestamps(); disableConcurrentBuilds(); timeout(time: 30, unit: 'MINUTES') }
  stages { stage('Build') { steps { sh 'make' } } }
}
```

### 18. Parameters

```groovy
pipeline {
  agent any
  parameters {
    string(name: 'VERSION', defaultValue: 'latest')
    choice(name: 'ENV', choices: ['dev', 'stage', 'prod'])
    booleanParam(name: 'DRY_RUN', defaultValue: true)
  }
  stages { stage('Run') { steps { echo "${params.VERSION}" } } }
}
```

### 19. Triggers

```groovy
pipeline {
  agent any
  triggers { cron('H 2 * * *'); pollSCM('H/15 * * * *') }
  stages { stage('Nightly') { steps { sh './nightly.sh' } } }
}
```

### 20. Retry and timeout wrappers

```groovy
pipeline {
  agent any
  stages {
    stage('Flaky integration') { steps { timeout(time: 10, unit: 'MINUTES') { retry(2) { sh 'make integration' } } } }
  }
}
```

## Parallel and nested stages

### 21. Two parallel branches

```groovy
pipeline {
  agent any
  stages {
    stage('Test') { parallel {
      stage('Unit') { steps { sh 'make unit' } }
      stage('Lint') { steps { sh 'make lint' } }
    } }
  }
}
```

### 22. Three parallel branches

```groovy
pipeline {
  agent any
  stages {
    stage('Cross platform') { parallel {
      stage('Linux') { steps { sh './test' } }
      stage('Windows') { steps { bat 'test.cmd' } }
      stage('macOS') { steps { sh './test' } }
    } }
  }
}
```

### 23. Fail-fast parallel

```groovy
pipeline {
  agent any
  stages {
    stage('Quality') { failFast true; parallel {
      stage('Unit') { steps { sh 'make unit' } }
      stage('Security') { steps { sh 'make security' } }
    } }
  }
}
```

### 24. Parallel branch with no steps

```groovy
pipeline {
  agent any
  stages {
    stage('Checks') { parallel {
      stage('Ready') { steps { echo 'ready' } }
      stage('Placeholder') { steps { } }
    } }
  }
}
```

### 25. Parallel branch with nested stages

```groovy
pipeline {
  agent none
  stages {
    stage('Platforms') { parallel {
      stage('Linux flow') { stages {
        stage('Build Linux') { steps { sh 'make' } }
        stage('Test Linux') { steps { sh 'make test' } }
      } }
      stage('Windows') { steps { bat 'build.cmd' } }
    } }
  }
}
```

### 26. Sequential stage group

```groovy
pipeline {
  agent any
  stages {
    stage('Quality') { stages {
      stage('Lint') { steps { sh 'npm run lint' } }
      stage('Test') { steps { sh 'npm test' } }
    } }
  }
}
```

### 27. Two nested group levels

```groovy
pipeline {
  agent any
  stages {
    stage('Release') { stages {
      stage('Verify') { stages {
        stage('API') { steps { sh 'make api-test' } }
        stage('UI') { steps { sh 'make ui-test' } }
      } }
      stage('Publish') { steps { sh 'make publish' } }
    } }
  }
}
```

### 28. Parallel followed by sequential stage

```groovy
pipeline {
  agent any
  stages {
    stage('Tests') { parallel {
      stage('Unit') { steps { sh 'make unit' } }
      stage('Integration') { steps { sh 'make integration' } }
    } }
    stage('Report') { steps { junit 'reports/*.xml' } }
  }
}
```

### 29. Duplicate stage names

```groovy
pipeline {
  agent any
  stages {
    stage('Test') { steps { sh 'make unit' } }
    stage('Test') { steps { sh 'make integration' } }
  }
}
```

### 30. Many sequential stages

```groovy
pipeline {
  agent any
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Install') { steps { sh 'npm ci' } }
    stage('Lint') { steps { sh 'npm run lint' } }
    stage('Unit') { steps { sh 'npm test' } }
    stage('Build') { steps { sh 'npm run build' } }
    stage('Package') { steps { sh 'tar czf app.tgz dist' } }
    stage('Publish') { steps { archiveArtifacts 'app.tgz' } }
  }
}
```

## Matrix pipelines

### 31. Single matrix cell

```groovy
pipeline {
  agent none
  stages { stage('Matrix') { matrix {
    axes { axis { name 'OS'; values 'linux' } }
    stages { stage('Test') { steps { sh 'make test' } } }
  } } }
}
```

### 32. Six matrix cells

```groovy
pipeline {
  agent none
  stages { stage('Matrix') { matrix {
    axes {
      axis { name 'OS'; values 'ubuntu', 'windows' }
      axis { name 'NODE'; values '18', '20', '22' }
    }
    stages { stage('Test') { steps { echo "${OS} ${NODE}" } } }
  } } }
}
```

### 33. Matrix exclude rule

```groovy
pipeline {
  agent none
  stages { stage('Browsers') { matrix {
    axes {
      axis { name 'OS'; values 'linux', 'windows' }
      axis { name 'BROWSER'; values 'chrome', 'firefox' }
    }
    excludes { exclude {
      axis { name 'OS'; values 'windows' }
      axis { name 'BROWSER'; values 'firefox' }
    } }
    stages { stage('Test') { steps { sh './browser-test' } } }
  } } }
}
```

### 34. Matrix notValues

```groovy
pipeline {
  agent none
  stages { stage('Supported JDKs') { matrix {
    axes { axis { name 'JDK'; values '17', '21', '23'; notValues '23' } }
    stages { stage('Test') { steps { sh './gradlew test' } } }
  } } }
}
```

### 35. Matrix cell with several steps

```groovy
pipeline {
  agent none
  stages { stage('Matrix') { matrix {
    axes { axis { name 'PYTHON'; values '3.11', '3.12', '3.13' } }
    stages { stage('Test') { steps { sh 'pip install -e .'; sh 'pytest'; junit 'reports.xml' } } }
  } } }
}
```

### 36. Matrix cell with sequential stages

```groovy
pipeline {
  agent none
  stages { stage('Matrix release') { matrix {
    axes { axis { name 'REGION'; values 'ca', 'us' } }
    stages {
      stage('Build') { steps { sh 'make' } }
      stage('Deploy') { steps { sh './deploy.sh' } }
    }
  } } }
}
```

### 37. Fail-fast matrix

```groovy
pipeline {
  agent none
  stages { stage('Matrix') { failFast true; matrix {
    axes { axis { name 'ARCH'; values 'amd64', 'arm64' } }
    stages { stage('Test') { steps { sh 'make test' } } }
  } } }
}
```

### 38. Two matrix stages

```groovy
pipeline {
  agent none
  stages {
    stage('Build matrix') { matrix {
      axes { axis { name 'OS'; values 'linux', 'windows' } }
      stages { stage('Build') { steps { sh 'make' } } }
    } }
    stage('Deploy matrix') { matrix {
      axes { axis { name 'REGION'; values 'ca', 'us', 'eu' } }
      stages { stage('Deploy') { steps { sh './deploy.sh' } } }
    } }
  }
}
```

### 39. Fully excluded matrix

```groovy
pipeline {
  agent none
  stages { stage('Unavailable') { matrix {
    axes { axis { name 'OS'; values 'linux' } }
    excludes { exclude { axis { name 'OS'; values 'linux' } } }
    stages { stage('Test') { steps { sh 'make test' } } }
  } } }
}
```

### 40. Matrix above expansion limit

```groovy
pipeline {
  agent none
  stages { stage('Large matrix') { matrix {
    axes {
      axis { name 'A'; values '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33' }
      axis { name 'B'; values '01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33' }
    }
    stages { stage('Cell') { steps { echo 'work' } } }
  } } }
}
```

## Scripted pipelines

### 41. Minimal scripted pipeline

```groovy
node {
  stage('Build') { sh 'make' }
}
```

### 42. Scripted sequential stages

```groovy
node('linux') {
  stage('Checkout') { checkout scm }
  stage('Build') { sh 'make' }
  stage('Test') { sh 'make test' }
}
```

### 43. Scripted nested stage calls

```groovy
node {
  stage('Release') {
    stage('Package') { sh 'make package' }
    stage('Publish') { sh 'make publish' }
  }
}
```

### 44. Shared library scripted pipeline

```groovy
@Library('company-ci@main') _
node('linux') {
  stage('Build') { companyBuild target: 'app' }
  stage('Scan') { companySecurityScan() }
}
```

### 45. Scripted try and finally

```groovy
node {
  try {
    stage('Test') { sh 'make test' }
  } finally {
    stage('Cleanup') { deleteDir() }
  }
}
```

### 46. Scripted wrappers

```groovy
node {
  stage('Deploy') {
    withCredentials([string(credentialsId: 'token', variable: 'TOKEN')]) {
      timeout(time: 5, unit: 'MINUTES') { sh './deploy.sh' }
    }
  }
}
```

### 47. Scripted parallel map

```groovy
node {
  stage('Parallel') {
    parallel linux: { sh './test-linux' }, windows: { bat 'test-windows.cmd' }
  }
}
```

### 48. Docker scripted workflow

```groovy
node {
  stage('Image') {
    def image = docker.build("app:${env.BUILD_NUMBER}")
    image.inside { sh 'npm test' }
  }
}
```

## Real-world step and formatting variations

### 49. Windows PowerShell

```groovy
pipeline {
  agent { label 'windows' }
  stages { stage('Build') { steps { powershell 'Invoke-Build'; bat 'package.cmd' } } }
}
```

### 50. Reports and artifacts

```groovy
pipeline {
  agent any
  stages { stage('Reports') { steps {
    junit testResults: 'reports/*.xml', allowEmptyResults: true
    archiveArtifacts artifacts: 'dist/**', fingerprint: true
    publishHTML target: [reportDir: 'coverage', reportFiles: 'index.html']
  } } }
}
```

### 51. Multiline shell script

```groovy
pipeline {
  agent any
  stages { stage('Smoke') { steps { sh '''
set -euo pipefail
curl -fsS https://example.test/health
echo "healthy"
''' } } }
}
```

### 52. Braces and comments inside strings

```groovy
pipeline {
  agent any
  stages { stage('Generate') { steps {
    echo 'literal { brace } and // text'
    sh 'printf "%s" "/* not a comment */"'
  } } }
}
```

### 53. Compact semicolon formatting

```groovy
pipeline { agent any; stages { stage('A') { steps { echo 'a'; echo 'b' } }; stage('B') { steps { echo 'c' } } } }
```

### 54. Unknown custom steps

```groovy
pipeline {
  agent any
  stages { stage('Company workflow') { steps {
    acquireEphemeralEnvironment team: 'payments'
    runComplianceGate policy: 'pci'
    releaseEnvironment()
  } } }
}
```

### 55. Very long step arguments

```groovy
pipeline {
  agent any
  stages { stage('Deploy') { steps {
    sh './deploy.sh --environment production --region north-america-northeast-1 --strategy blue-green --wait-for-health-checks --timeout 900'
  } } }
}
```

### 56. Kubernetes YAML agent

```groovy
pipeline {
  agent { kubernetes { yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: builder
    image: node:22
''' } }
  stages { stage('Build') { steps { container('builder') { sh 'npm ci && npm test' } } } }
}
```

## Recovery and diagnostic variations

### 57. Stage without a steps block

```groovy
pipeline {
  agent any
  stages { stage('Reserved for later') { echo 'outside steps' } }
}
```

### 58. Matrix axis without values

```groovy
pipeline {
  agent none
  stages { stage('Incomplete matrix') { matrix {
    axes { axis { name 'OS' } }
    stages { stage('Test') { steps { echo 'test' } } }
  } } }
}
```

### 59. Missing closing braces

```groovy
pipeline {
  agent any
  stages {
    stage('Build') { steps { sh 'make' } }
    stage('Broken') { steps { sh 'make test'
}
```

### 60. Unexpected closing brace

```groovy
pipeline {
  agent any
  stages { stage('Build') { steps { sh 'make' } } }
}
}
```
