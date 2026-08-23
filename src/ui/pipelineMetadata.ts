import { agentShortLabel } from '../graph/stageBadges'
import type { PipelineModel } from '../model/types'
import type { DetailSection } from './detailsSections'
import { stepDetailLabel } from './detailsSections'

export interface MetadataBadge {
  label: string
  title: string
}

export function pipelineMetadataBadges(model: PipelineModel): MetadataBadge[] {
  const badges: MetadataBadge[] = []
  if (model.agent) {
    badges.push({ label: `AGENT · ${agentShortLabel(model.agent)}`, title: `Pipeline agent: ${model.agent}` })
  }
  if (model.environmentEntries.length) {
    badges.push({ label: `ENV ×${model.environmentEntries.length}`, title: `${model.environmentEntries.length} pipeline environment variables` })
  }
  if (model.tools.length) {
    badges.push({ label: `TOOLS ×${model.tools.length}`, title: `${model.tools.length} pipeline tools` })
  }
  if (model.options.length) {
    badges.push({ label: `OPT ×${model.options.length}`, title: `${model.options.length} pipeline options` })
  }
  if (model.parameters.length) {
    badges.push({ label: `PARAM ×${model.parameters.length}`, title: `${model.parameters.length} pipeline parameters` })
  }
  if (model.triggers.length) {
    badges.push({ label: `TRIGGER ×${model.triggers.length}`, title: `${model.triggers.length} pipeline triggers` })
  }
  const pipelinePost = model.postHandlers.filter((handler) => handler.stageId === undefined && handler.stage === undefined)
  if (pipelinePost.length) {
    badges.push({ label: `POST ×${pipelinePost.length}`, title: `${pipelinePost.length} pipeline post conditions` })
  }
  return badges
}

export function buildPipelineMetadataSections(model: PipelineModel): DetailSection[] {
  const sections: DetailSection[] = []
  if (model.agent) sections.push({ title: 'AGENT', lines: [model.agent], bullet: false })
  if (model.environmentEntries.length) {
    sections.push({
      title: `ENVIRONMENT (${model.environmentEntries.length})`,
      lines: model.environmentEntries.map((entry) => `${entry.key} = ${entry.value}`),
      bullet: true,
    })
  }
  if (model.tools.length) {
    sections.push({
      title: `TOOLS (${model.tools.length})`,
      lines: model.tools.map((tool) => `${tool.type} ${tool.name}`),
      bullet: true,
    })
  }
  if (model.options.length) {
    sections.push({
      title: `OPTIONS (${model.options.length})`,
      lines: model.options.map((option) => option.args ? `${option.name}(${option.args})` : option.name),
      bullet: true,
    })
  }
  if (model.parameters.length) {
    sections.push({
      title: `PARAMETERS (${model.parameters.length})`,
      lines: model.parameters.map((parameter) =>
        parameter.args ? `${parameter.type}(${parameter.args})` : `${parameter.type} · ${parameter.name}`,
      ),
      bullet: true,
    })
  }
  if (model.triggers.length) {
    sections.push({ title: `TRIGGERS (${model.triggers.length})`, lines: [...model.triggers], bullet: true })
  }
  const pipelinePost = model.postHandlers.filter((handler) => handler.stageId === undefined && handler.stage === undefined)
  for (const handler of pipelinePost) {
    sections.push({
      title: `POST · ${handler.condition}`,
      lines: handler.steps.length ? handler.steps.map(stepDetailLabel) : ['No steps'],
      bullet: handler.steps.length > 0,
    })
  }
  return sections
}
