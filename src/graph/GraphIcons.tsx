interface DisclosureIconProps {
  expanded: boolean
}

/** Stable SVG disclosure mark that does not depend on platform glyph fonts. */
export function DisclosureIcon({ expanded }: DisclosureIconProps) {
  return (
    <svg className="disclosure-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={expanded ? 'M4 10 8 6l4 4' : 'm4 6 4 4 4-4'} />
    </svg>
  )
}

/** Small command-flow marker used for every expanded step row. */
export function StepFlowIcon() {
  return (
    <svg className="step-flow-icon" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h8M7 4l3 3-3 3" />
    </svg>
  )
}
