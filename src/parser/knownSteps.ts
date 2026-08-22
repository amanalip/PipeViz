// ---------------------------------------------------------------------------
// parser/knownSteps.ts - dictionary of common Jenkins step names (plan §5).
//
// Used to classify Step.kind: 'known' gets a recognizable treatment in the
// UI, 'unknown' still renders but without special styling. The set is
// intentionally generous - false positives only cost a badge, while missing
// a real step would. Plugin steps users report can be appended freely.
// ---------------------------------------------------------------------------

const NAMES: readonly string[] = [
  // Shell / script execution
  'sh', 'bat', 'powershell', 'pwsh', 'script', 'eval',
  // SCM
  'checkout', 'git', 'svn', 'hg', 'mercurial', 'pollSCM',
  // Workspace & files
  'dir', 'pwd', 'deleteDir', 'cleanWs', 'cleanWsNotFail', 'fileExists', 'findFiles',
  'readFile', 'writeFile', 'readJSON', 'writeJSON', 'readYaml', 'writeYaml',
  'readManifest', 'unzip', 'zip', 'tar', 'touch', 'copyArtifacts', 'archiveArtifacts',
  'fingerprint', 'stash', 'unstash',
  // Test & quality
  'junit', 'recordIssues', 'discoverGitReferenceBuild', 'publishCoverage',
  'cobertura', 'publishHTML', 'plot', 'checkstyle', 'pmd', 'spotbugs',
  // Build tools
  'mvn', 'maven', 'gradle', 'ant', 'make', 'npm', 'npx', 'yarn', 'pnpm',
  'dotnet', 'cmake', 'go',
  // Docker / containers
  'docker', 'dockerBuild', 'dockerPush', 'withDockerRegistry', 'withDockerContainer',
  'inside', 'image', 'build', // docker.build vs job build resolved contextually
  // Flow control & utility
  'timeout', 'retry', 'waitUntil', 'sleep', 'timestamps', 'ansiColor',
  'withEnv', 'withCredentials', 'usernamePassword', 'string', 'booleanParam',
  'choice', 'file', 'text', 'password', 'sshagent', 'sshCommand', 'sshPublisher',
  'wrap', 'configFile', 'withConfigFile', 'throttle', 'lock', 'milestone',
  'node', 'label', 'ws', 'parallel', 'catchError', 'warnError', 'unstable',
  // Communication
  'echo', 'error', 'emailext', 'mail', 'slackSend', 'hipchatSend', 'office365ConnectorSend',
  'addBadge', 'createSummary', 'setBuildDescription',
  // Jobs / pipelines
  'buildJob', 'triggerRemoteJob', 'pipelineTriggers', 'properties', 'disableConcurrentBuilds',
  // Cloud / deploy-ish
  'kubectl', 'helm', 'ansiblePlaybook', 'ansibleTower', 'terraform', 'cfInvalidate',
  's3Upload', 'azureUpload', 'gcloud', 'deploy',
]

export const KNOWN_STEPS: ReadonlySet<string> = new Set(NAMES)

/** Classify a step name against the dictionary. */
export function isKnownStep(name: string): boolean {
  return KNOWN_STEPS.has(name)
}
