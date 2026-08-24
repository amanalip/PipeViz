# PipeViz label, geometry, and toast card test catalog

This document is the durable UX test contract for PipeViz. It records every corpus input, the labels that matter, the geometry views exercised, the floating detail cards checked, and the rules a future pipeline parser should satisfy.

## Source of truth

- `jenkins_pipelines_mock.md` contains 68 independent Jenkinsfile inputs.
- `src/samples/` contains 36 presentation-ready samples, six in each menu category.
- `src/ui/mockCorpusLabels.test.ts` parses every input and checks compact labels.
- `src/layout/mockCorpusLayout.test.ts` computes compact and expanded geometry for every input.
- `src/ui/pipelineMetadata.test.ts` checks pipeline-level metadata badges and full inspector values.
- `src/graph/StageNodeCard.test.ts` checks stage card label grammar and scoped metadata badges.
- `src/ui/detailsSections.test.ts` checks the full stage and container inspector labels.
- `src/graph/toFlow.test.ts` checks rendered node and container accessibility labels.
- `e2e/ux-regressions.spec.ts` opens all 68 inputs in Chromium and checks expanded command fidelity, metadata, SVG markers, and DOM overflow.
- The same browser suite independently loads all 36 bundled samples through search and category navigation, including matrix expansion and diagnostic cases.

The markdown corpus is intentionally imported by the automated tests. Adding a new fenced Jenkinsfile here is not enough. Add it to `jenkins_pipelines_mock.md`, update the expected corpus count, and add its UX purpose to the inventory below.

## Label contract

1. Pipeline-level metadata appears once in the canvas toolbar because it is inherited by stages.
2. Stage cards only show metadata declared at that stage, including agent overrides, environment, tools, options, and input gates.
3. Compact badges show the real agent value when it is short, such as `AGENT · linux`. Docker, Dockerfile, and Kubernetes use recognizable kind labels.
4. Selecting the pipeline metadata summary reveals complete values for agent, environment, tools, options, parameters, triggers, and pipeline post conditions.
5. Selecting a stage reveals complete stage-scoped values plus steps, conditions, input configuration, and stage post conditions.
6. Empty stages say `No steps`. Nested groups describe nested stages. Matrices describe runnable cells. No surface may say `0 steps` for a structural group.
7. Counts use correct singular and plural forms.
8. Compact text may truncate visually, but the complete value must remain available through an inspector, accessible label, or title.
9. Pipeline inheritance and stage overrides must never be presented as though they have the same scope.
10. Warning and error states must retain a useful rendered-stage summary.
11. Adapter-neutral metadata facts use the shared `MetadataFact` contract and remain visible without provider-specific card components.
12. Provider identity is exposed through `PipelineDialect` and appears in the pipeline inspector when supplied.

## Toast card contract

The floating pipeline, stage, and container inspectors are called toast cards in this catalog. They are interactive dialogs, not transient notifications.

1. A stage toast names its full source range, category, and primary work summary in the header.
2. Every step line includes its source line and parser classification (`known`, `unknown`, or `script`) before the captured command.
3. The agent section explicitly says whether the value is a stage override or inherited from the pipeline.
4. Stage-scoped environment, tools, and options say `STAGE` in their headings.
5. Pipeline environment, tools, and options appear as concise pipeline context on stage toasts, with complete values available from the pipeline toast.
6. Input gates retain message, confirmation label, submitter, and other captured directives.
7. Stage and pipeline post conditions retain condition, source line, step classification, and command.
8. A parallel container toast names its branch count. A matrix container toast names runnable cells, axes, exclusions, shared steps, and fail-fast state. A sequential container toast lists nested stages in execution order.
9. Long commands, YAML, labels, and metadata wrap inside the toast. They never widen it beyond the canvas.
10. Toast headers remain visible while long content scrolls. Escape closes the toast, and focus returns to the invoking graph control.
11. Switching between dark and light modes preserves the selected node and its open toast card because theme changes do not alter graph identity.

## Geometry contract

Every corpus input is checked in compact mode, fully expanded sequential plus step mode, and fully expanded matrix plus sequential plus step mode.

- Stage cards do not overlap other stage cards.
- Containers may nest, but sibling containers cannot partially overlap.
- A card intersecting a container must be fully contained by it.
- Cards remain inside the computed canvas bounds.
- Parent containers are emitted before their children for React Flow parenting.
- Container headers do not cover their first child card.
- Floating toolbar controls do not cover graph content after fitting.
- Details panels remain inside the canvas viewport and scroll when content is tall.
- Long titles truncate without increasing card dimensions.
- Narrow viewport checks use 390 by 844 pixels. Desktop checks use the current browser viewport, normally at least 1280 pixels wide.
- Vertical sequential edges attach through bottom and top handles. Outer pipeline edges remain horizontal.
- Expanded group headers reserve layout width for the complete structural label, owner name, count, and visible metadata chips. These labels must not depend on ellipsis.
- Expanded step cards reserve space for every wrapped command line and every metadata row. Their DOM `scrollHeight` must not exceed their assigned height.
- Collapsing or expanding a group preserves valid selection and toast state.
- Local expansion fitting occurs only when newly revealed content would be clipped.

## Graph interaction contract

1. Single-click selects a card or group and opens its inspector.
2. Double-click expands or collapses sequential structures. Double-clicking a leaf retains jump-to-source behavior.
3. The visible SVG chevron and selected-node toolbar provide discoverable alternatives to double-click. Disclosure and step-flow marks do not depend on font glyphs.
4. Expand All and Collapse All operate on stable structural and step-card IDs, including visible matrix-lane clones.
5. Graph search matches stage names, step text, conditions, agents, environment values, and structural metadata without deleting unmatched nodes or edges.
6. Focus Path highlights directed predecessors and successors while dimming unrelated sibling lanes.
7. Search, selection, focus, expansion, theme, and viewport state must not accidentally reset one another.
8. Parallel, matrix, and sequential containers have distinct labels, minimap colors, and accessible names.
9. Expanded step cards show complete command text, source line, and classification while contributing their real width and height to layout geometry.

## Editor theme contract

1. Dark and light modes use dedicated editor palettes instead of the quieter chrome text ramp.
2. Base text, comments, gutters, punctuation, keywords, strings, numbers, and function names maintain at least a 4.5:1 contrast ratio against the editor background.
3. The active line is visible without obscuring syntax colors.
4. Selection remains distinct from the active line and keeps selected code readable.
5. The active gutter line is as readable as the code line it identifies.
6. Both themes are checked after loading realistic highlighted Groovy, not only an empty editor.

## Corpus inventory

| ID | Pipeline variation | Primary label and metadata checks | Geometry emphasis |
|---:|---|---|---|
| 01 | Minimal stage | `AGENT · any`, one step | Single card bounds |
| 02 | Several steps | Correct plural step count | Single card bounds |
| 03 | Empty work in progress stage | `No steps` | Empty card size |
| 04 | Long stage name | Truncation plus full title | Fixed card width |
| 05 | Unicode stage names | Unicode preserved | Fixed card width |
| 06 | Pipeline label with stage agent overrides | Inherited `linux`; stage `windows` and Dockerfile overrides | Three sequential cards |
| 07 | Docker agent | Docker kind plus full image and args in inspector | Single card and toolbar |
| 08 | Custom label expression | Full label expression preserved | Long toolbar chip |
| 09 | Environment and credentials | `ENV ×2`; full assignments in inspector | Toolbar width |
| 10 | Tools directive | `TOOLS ×2`; tool types and names | Toolbar width |
| 11 | Branch condition | `WHEN` and raw branch condition | Single conditional card |
| 12 | Any-of condition | Combinator summary remains honest | Single conditional card |
| 13 | All-of condition | Combinator summary remains honest | Single conditional card |
| 14 | Input gate | `IN`; message, button text, and submitter in inspector | Single gated card |
| 15 | Stage post handlers | Stage-scoped post sections | Inspector height |
| 16 | Pipeline post handlers | `POST ×2`; conditions and steps | Pipeline inspector height |
| 17 | Options | `OPT ×3`; option arguments | Toolbar and inspector width |
| 18 | Parameters | `PARAM ×3`; type and name | Pipeline inspector height |
| 19 | Triggers | `TRIGGER ×2`; raw schedules | Long inspector lines |
| 20 | Retry and timeout wrappers | Wrapper steps remain visible and ordered | Single card |
| 21 | Two parallel branches | `PAR ×2`; branch step labels | Fan-out and fan-in |
| 22 | Three parallel branches | `PAR ×3`; branch labels | Three lanes |
| 23 | Fail-fast parallel | `failFast` visible | Container header spacing |
| 24 | Empty parallel branch | `No steps` for empty branch | Mixed-height lanes |
| 25 | Parallel branch with nested stages | Nested-stage label, not zero steps | Nested container containment |
| 26 | Sequential stage group | `SEQ` and nested count | Sequential container |
| 27 | Two nested group levels | Honest nested counts | Nested container containment |
| 28 | Parallel followed by sequential stage | Both structure labels | Fan-in to sequential chain |
| 29 | Duplicate stage names | Labels remain distinct by stable IDs | Separate cards and edges |
| 30 | Many sequential stages | Stable step labels | Wide horizontal bounds |
| 31 | Single matrix cell | `1 cell`, singular grammar | Compact and expanded |
| 32 | Six matrix cells | `6 cells`; stable shared-step summary | Six expanded lanes |
| 33 | Matrix exclude rule | Surviving cell count | Filtered expanded lanes |
| 34 | Matrix `notValues` | Excluded values visible | Filtered expanded lanes |
| 35 | Matrix cell with several steps | Shared-step count | Expanded card labels |
| 36 | Matrix cell with sequential stages | Nested stage count per cell | Nested expanded containers |
| 37 | Fail-fast matrix | Matrix `failFast` | Container header spacing |
| 38 | Two matrix stages | Independent cell summaries | Consecutive containers |
| 39 | Fully excluded matrix | `No runnable cells` | Compact-only safe bounds |
| 40 | Matrix above expansion limit | `1000+ cells`; expansion unavailable | Bounded compact layout |
| 41 | Minimal scripted pipeline | Warning plus stages shown | Single scripted card |
| 42 | Scripted sequential stages | Stage and step counts | Sequential cards |
| 43 | Scripted nested stage calls | Nested-stage labels | Nested containment |
| 44 | Shared library scripted pipeline | Custom calls remain visible | Sequential cards |
| 45 | Scripted try and finally | Recovered stages remain ordered | Wide horizontal bounds |
| 46 | Scripted wrappers | Wrapper and inner-step labels | Single card |
| 47 | Scripted parallel map | Honest partial scripted representation | Recovered card bounds |
| 48 | Docker scripted workflow | Node agent metadata on stages | Sequential cards |
| 49 | Windows PowerShell | Windows label and step kind | Single card |
| 50 | Reports and artifacts | Correct plural step count | Single card |
| 51 | Multiline shell script | Complete args in inspector, compact card stable | Fixed card dimensions |
| 52 | Braces and comments inside strings | No false structure labels | Sequential cards |
| 53 | Compact semicolon formatting | Correct stage and step separation | Sequential cards |
| 54 | Unknown custom steps | Unknown steps stay visible | Single card |
| 55 | Very long step arguments | Full text in the inspector and expanded card | Wrapped card and inspector overflow |
| 56 | Kubernetes YAML agent | Kubernetes kind plus full YAML in inspector | Toolbar and inspector overflow |
| 57 | Stage without a steps block | `No steps` | Empty card size |
| 58 | Matrix axis without values | `No runnable cells`; `(no values)` details | Compact safe bounds |
| 59 | Missing closing braces | Partial graph and diagnostic labels | Ghost and parsed surfaces |
| 60 | Unexpected closing brace | Diagnostic plus recovered graph | Recovered card bounds |
| 61 | Three-level sequential group | Honest count at every level | Recursive sequential containment |
| 62 | Sequential group containing parallel work | `SEQ`, `PAR ×3`, fail-fast and input metadata | Mixed vertical and fan-out routing |
| 63 | Parallel branches with sequential groups | Independent nested counts per branch | Sequential containers inside parallel lanes |
| 64 | Matrix cell with multi-stage chain | Cell and nested-stage summaries | Matrix lanes with vertical internal flow |
| 65 | Sequential group with agent overrides | Inherited and overridden agents stay scoped | Metadata-heavy group headers |
| 66 | Sequential group with input and post metadata | Input and post details on the parent group | Tall toast and ordered children |
| 67 | Duplicate names across nested scopes | Stable IDs preserve distinct selections | Separate group membership and edges |
| 68 | Scripted deeply nested stage calls | Scripted metadata and nested counts | Recursive scripted containment |

## Live browser label audit

Use the Playwright CLI against a local production preview or development server.

For each of the 68 inputs:

1. Replace the editor contents with the fenced source.
2. Wait for the debounce and rendered graph.
3. Record visible stage card labels, container header labels, pipeline metadata badges, diagnostics summary, and footer summary.
4. Assert that the graph is not blank when parsed stages exist.
5. Reject empty labels, `0 steps`, `1 steps`, `1 cells`, hidden pipeline agents, and zero-count metadata badges.
6. Open the pipeline metadata inspector when global metadata exists and verify every compact badge has complete backing content.
7. Open representative stage and container inspectors and verify scoped metadata and full values.
8. For matrix inputs, toggle expansion when available and repeat label checks.
9. For nested-stage inputs, exercise card chevrons, double-click, selected-node toolbars, Expand All, and Collapse All.
10. Expand every visible step card and compare each rendered command with the parser's exact `name + args` value.
11. Verify every command has a source-line and parser-kind row, an SVG flow marker, and no clipped final row.
12. Reject expanded cards or lists whose DOM `scrollHeight` exceeds `clientHeight`.
10. Search for a stage and metadata value, then verify matching emphasis without graph disconnection.
11. Select one parallel lane, enable Focus Path, and verify sibling lanes dim while the incoming and outgoing path remains emphasized.
12. Expand representative one-step, multi-step, long-command, scripted, and matrix-cell cards. Verify every command, source line, and classification is readable on the graph.

## Live browser geometry audit

For every compact, sequential-and-step-expanded, and matrix-plus-sequential-and-step-expanded view, obtain the rendered rectangles for stage nodes, group containers, container headers, toolbar controls, and the canvas viewport.

Check:

- pairwise stage card intersections;
- partial container intersections;
- card clipping against a containing group;
- card intersections with container headers;
- graph content under the floating toolbar;
- rendered elements outside canvas bounds;
- details panel bounds and overflow behavior;
- toast header collisions with the canvas toolbar;
- toast source-range, step-line, and parser-kind labels;
- long-title truncation and full-value availability.
- exact expanded command text, SVG disclosure marks, and card/list DOM overflow.

Repeat representative basics, parallel groups, nested groups, matrices, long labels, metadata-heavy inputs, and malformed inputs at 390 by 844 pixels.

## Adding another pipeline language

When PipeViz gains another pipeline format, create a separate corpus file and reuse these semantic categories rather than copying Jenkins syntax assumptions. The parser may use a different model adapter, but the visible contract remains:

- inherited metadata has one pipeline-level home;
- local overrides appear on the affected node;
- compact labels are honest and inspectable;
- structural groups never masquerade as empty work;
- every supported expansion mode passes the same rectangle invariants.
- every adapter maps provider-specific facts into `PipelineDialect` and `MetadataFact` before reaching shared React Flow components.

Add the new corpus import to label and layout regression tests, document each case in this file, and include representative live browser checks before release.
