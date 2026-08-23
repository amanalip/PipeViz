Yes. PipeViz can expand well beyond Jenkins, but AWS, Azure, GCP, and Terraform represent different kinds of graphs. I would support them through separate adapters feeding one normalized graph model.

## Best expansion targets

| Priority | Platform or format | Reliability | Best visualization |
|---:|---|---|---|
| 1 | GitHub Actions | Excellent | Workflows, jobs, steps, matrices, `needs` |
| 2 | GitLab CI/CD | Excellent | Stages, jobs, `needs`, parallel matrices |
| 3 | Azure DevOps Pipelines | Excellent | Stages, jobs, steps, dependencies, agents |
| 4 | CircleCI | Excellent | Workflows, jobs, steps, `requires` |
| 5 | Bitbucket Pipelines | Excellent | Steps, stages, parallel groups, deployments |
| 6 | Google Cloud Build | Excellent | Build steps and `waitFor` dependencies |
| 7 | AWS CodePipeline | Excellent when given JSON/API output | Stages, actions, artifacts, approvals |
| 8 | AWS Step Functions | Excellent | States, choices, retries, parallel and map branches |
| 9 | Google Cloud Workflows | Excellent | Steps, switches, loops, calls, parallel branches |
| 10 | Azure Logic Apps | Excellent | Triggers, actions, conditions, loops |
| 11 | Argo Workflows | Excellent | DAG tasks, steps, templates, artifacts |
| 12 | Tekton Pipelines | Excellent | Tasks, `runAfter`, results, workspaces |
| 13 | Drone CI / Woodpecker CI | Very good | Pipelines, steps, dependencies, services |
| 14 | Buildkite | Very good | Steps, groups, dependencies, agents |
| 15 | Travis CI | Good | Stages, jobs, matrices, conditions |
| 16 | Harness Pipelines | Very good | Stages, execution strategies and steps |

These are reliable because their declarative formats expose graph relationships directly. For example, GitHub Actions has jobs and `needs`, GitLab has stages and `needs`, and Azure Pipelines exposes stages, jobs, steps, dependencies, conditions, and matrix strategies. [GitHub Actions documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-jobs), [GitLab CI/CD syntax](https://docs.gitlab.com/ci/yaml/), [Azure Pipelines jobs](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/phases?view=azure-devops)

CircleCI is similarly graph-friendly because workflows contain jobs and `requires` dependencies. [CircleCI configuration reference](https://circleci.com/docs/reference/configuration-reference/)

## Infrastructure-as-code targets

These should be supported, but in an “Infrastructure graph” mode instead of pretending they are CI pipelines.

| Priority | Format | Reliability | Important relationships |
|---:|---|---|---|
| 1 | Terraform | Excellent from plan JSON or `terraform graph` | Resources, modules, providers, dependencies |
| 2 | OpenTofu | Excellent | Same general model as Terraform |
| 3 | AWS CloudFormation | Excellent | Resources, references, `DependsOn`, nested stacks |
| 4 | AWS SAM | Excellent after transformation | Functions, APIs, queues, permissions |
| 5 | Azure Bicep | Excellent after compilation | Resources, modules, scopes, dependencies |
| 6 | Azure ARM templates | Excellent | Resources and explicit or implicit dependencies |
| 7 | Kubernetes YAML | Good | Workloads, services, ingress, config and storage |
| 8 | Helm | Excellent after `helm template` | Rendered Kubernetes resource topology |
| 9 | Kustomize | Excellent after rendering | Rendered Kubernetes resource topology |
| 10 | Pulumi | Good from preview/export output | Resources, providers and dependencies |
| 11 | AWS CDK / CDKTF | Good after synthesis | Synthesized CloudFormation or Terraform graph |

Terraform is particularly suitable if PipeViz consumes `terraform graph` or plan JSON. Reimplementing complete HCL evaluation in the browser would be considerably less reliable. Terraform already creates an explicit dependency graph internally. [Terraform dependency graph](https://developer.hashicorp.com/terraform/internals/graph)

## Cloud-specific bundles

For clear product navigation, I would present cloud support like this:

- AWS

  - CodePipeline
  - CodeBuild
  - Step Functions
  - CloudFormation
  - SAM
  - CDK after synthesis

- Azure

  - Azure DevOps Pipelines
  - Logic Apps
  - Bicep
  - ARM templates
  - GitHub Actions targeting Azure

- Google Cloud

  - Cloud Build
  - Google Workflows
  - Cloud Deploy
  - Kubernetes and GKE configurations

AWS CodePipeline is a particularly clean match because it explicitly models stages containing serial or parallel actions. [AWS CodePipeline structure](https://docs.aws.amazon.com/codepipeline/latest/userguide/reference-pipeline-structure.html) Google Cloud Build likewise exposes dependencies through step IDs and `waitFor`. [Cloud Build step ordering](https://docs.cloud.google.com/build/docs/configuring-builds/configure-build-step-order)

For workflow visualization, AWS Step Functions is perhaps the strongest fit of all. Its declarative language explicitly represents tasks, choices, parallel branches, maps, retries, failures, and transitions. [AWS Step Functions language](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-amazon-states-language.html) Azure Logic Apps also exposes a structured JSON definition containing triggers and actions. [Azure Logic Apps schema](https://learn.microsoft.com/en-us/azure/logic-apps/workflow-definition-language-schema)

## Formats requiring runtime information

These can be supported later, but static source parsing alone will never be completely dependable:

- Jenkins Scripted Pipeline
- Apache Airflow Python DAGs
- Dagster
- Prefect
- Pulumi source programs
- AWS CDK source programs
- TeamCity Kotlin DSL
- Dynamically generated Buildkite pipelines
- CI configurations with remote templates or includes

For these, PipeViz should import a serialized graph from the platform, CLI, or API whenever possible.

## Recommended product roadmap

1. GitHub Actions
2. GitLab CI/CD
3. Azure DevOps Pipelines
4. CircleCI
5. Bitbucket Pipelines
6. Google Cloud Build
7. AWS CodePipeline
8. AWS Step Functions
9. Terraform and OpenTofu infrastructure mode
10. CloudFormation, Bicep and rendered Kubernetes mode
11. Argo Workflows and Tekton
12. Runtime adapters for Airflow, Pulumi, CDK and dynamic Jenkins

The central architecture should be:

```text
Source format
    ↓
Platform adapter
    ↓
Normalized PipeViz graph
    ↓
CI pipeline, workflow, or infrastructure presentation
```

The normalized model should preserve nodes, groups, dependency edges, conditional edges, artifacts, triggers, agents or runners, environments, permissions, retries, timeouts, matrices, modules, resources, source locations, and parser diagnostics.

That would make PipeViz a general pipeline and infrastructure visualizer, while keeping each format accurate instead of forcing every platform into Jenkins terminology.
