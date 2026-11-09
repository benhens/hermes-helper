// Every class name the page uses, in one table. Each string is copied from Hermes Desktop's own
// source (v0.23.0, apps/desktop/src/...; the file is named above each group), so the page wears
// exactly the classes Hermes's own screens wear and needs no CSS of its own.
// Why one table: Hermes's stylesheet only holds classes its own code uses. A class we invent would
// silently do nothing, so scripts/check-hermes-classes.mjs checks every token here against the built
// Hermes CSS, and tests/plugin-shape.test.mjs fails if page code writes a class string anywhere else.

export const K = {
  // ---- page frame (app/page-search-shell.tsx: Capabilities' page shell, header with tabs) ----
  root: 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden',
  // The header clears Hermes's title-bar band (its window buttons float there), as Capabilities does.
  // No page title: like Capabilities, the sidebar row names the page and the header holds the tabs.
  head: 'flex shrink-0 items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]',
  // Page tabs: Capabilities' text tabs (components/ui/tab-dropdown.tsx ResponsiveTabs row,
  // components/ui/text-tab.tsx TextTab). The colour is split off so the open tab doesn't carry two.
  tabs: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
  textTab:
    'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  textTabIdle: 'text-(--ui-text-tertiary)',
  textTabOn: 'text-foreground',
  textTabLabel: 'underline-offset-4 decoration-current/25 group-hover/text-tab:underline',
  textTabLabelOn: 'underline-offset-4 decoration-current/25 underline',
  headEnd: 'ml-auto flex shrink-0 items-center gap-0.5',
  // relative: the helper opened over a narrow page (layout.js 'over') is placed inside it.
  body: 'relative flex min-h-0 flex-1',

  // ---- step list (app/master-detail.tsx ListColumn + CapRow; app/overlays/panel.tsx) ----
  rail: 'flex min-h-0 shrink-0 flex-col p-2',
  railScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  sectionLabel: 'text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground/50',
  sectionLabelPad: 'px-2 pb-1.5 pt-1',
  sectionLabelGap: 'px-2 pb-1.5 pt-4',
  rowList: 'flex flex-col gap-0.5',
  row: 'group/row row-hover flex h-11 w-full shrink-0 items-center rounded-md hover:text-foreground',
  rowActive: 'bg-(--ui-row-active-background) text-foreground',
  rowIdle: 'text-(--ui-text-secondary)',
  rowButton: 'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md pl-2 pr-1.5 text-left',
  // Narrow window: the step list shows its numbers only, centred in the row
  rowButtonNumbers: 'flex h-full min-w-0 flex-1 cursor-pointer items-center justify-center rounded-md',
  rowText: 'min-w-0 flex-1',
  rowTitle: 'block truncate text-[0.78rem] font-medium text-foreground/85',
  rowTitleOff: 'block truncate text-[0.78rem] font-normal text-muted-foreground/60',
  rowSub: 'flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50',
  truncate: 'truncate',
  // Step number: a plain numeral, no key-cap box (hhdesign nice-to-have 8; Settings nav rows have
  // no boxed numbers). The open step's numeral is in the main text colour.
  rowNumber: 'w-3 shrink-0 text-center text-[0.75rem] tabular-nums text-(--ui-text-tertiary)',
  rowNumberOn: 'w-3 shrink-0 text-center text-[0.75rem] tabular-nums text-foreground',
  // DetailColumn footer caption (app/master-detail.tsx)
  railFoot: 'shrink-0 px-2 pb-1 pt-3 text-[0.65rem] text-muted-foreground/50',

  // ---- open step (app/master-detail.tsx DetailColumn; app/capabilities/primitives.tsx DetailHeader) ----
  detail: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  detailScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  // One fixed left text edge (hhdesign nice-to-have 7): left-aligned with fixed padding, never
  // re-centred when the helper opens, hides or closes; the same 24 px edge as the header's tabs.
  detailInner: 'max-w-2xl space-y-5 px-6 py-4',
  // Your setup is a card grid, so it takes the wider of Hermes's reading widths
  detailInnerWide: 'max-w-3xl space-y-5 px-6 py-4',
  stepTitle: 'min-w-0 text-[0.9375rem] font-semibold tracking-tight',
  // Chat text (plugins/hermes-bots/group-room-ui.tsx RoomMessage body)
  prose: 'mt-1 text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // Settings row title + caption (app/settings/primitives.tsx ListRow). One column; layout.js adds
  // the two columns when the open step is wide enough (the window's sm: breakpoint can't see the
  // step list and helper beside it).
  pairGrid: 'grid gap-5',
  twoColumns: 'grid-cols-2',
  threeColumns: 'grid-cols-3',
  pairTitle: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  caption: 'mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // Settings SectionHeading (app/settings/primitives.tsx)
  question: 'mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
  // Choice cards: Hermes's first-run setup chooser (components/ui/chip.tsx, card variant)
  choices: 'grid gap-2',
  choice: 'flex min-w-0 items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-left text-[13px] border text-foreground transition-colors',
  choiceOn: 'border-primary bg-primary/15',
  choiceOff: 'border-transparent bg-muted hover:bg-accent/60',
  choiceText: 'min-w-0',
  choiceLabel: 'block',
  choiceSub: 'block text-xs text-muted-foreground',
  // Source tags: app/master-detail.tsx ToolChip, in the normal sans like Capabilities' metadata
  // chips ("Built In", "v1.0.1"); mono in Hermes means code, paths and commands.
  chips: 'flex flex-wrap items-center gap-1.5',
  chipsLabel: 'text-xs text-muted-foreground',
  chip: 'rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)',
  // Video slot: a quiet scaffold line (components/chat/scaffold-row.tsx)
  scaffold: 'flex min-w-0 items-center gap-1.5 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)',
  scaffoldGlyph: 'grid size-3.5 shrink-0 place-items-center',
  actions: 'flex flex-wrap items-center gap-2',

  // ---- helper panel (a page column, like Hermes's right sidebar; master-detail.tsx DetailPane header) ----
  // No line on its edge: Hermes's own sidebar has none, only the step from its fill to the page's
  // (hhdesign fix 5; the Nous theme tints --ui-stroke-tertiary with its accent, so a line read as one).
  helper: 'flex min-h-0 shrink-0 flex-col bg-(--ui-sidebar-surface-background)',
  // Opened from the strip while the window is too narrow for a column: it lies over the page, on
  // its side, at full height (layout.js 'over').
  helperOver: 'absolute inset-y-0 z-20 shadow-lg',
  helperOverRight: 'right-0',
  helperOverLeft: 'left-0',
  helperTop: 'flex h-9 shrink-0 items-center gap-2 px-3',
  helperTopLabel: 'min-w-0 truncate text-xs font-medium text-foreground',
  // RoomHeader's ghost icon buttons (plugins/hermes-bots/group-room-ui.tsx)
  iconTone: 'text-(--ui-text-tertiary)',
  helperBody: 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3 pt-1',
  // Bubble and character sit just above the message box, as the newest chat content does in
  // Hermes; the space opens above them (hhdesign fix 3). mt-auto, not justify-end, so a tall
  // bubble can still be scrolled to its top.
  helperNewest: 'mt-auto flex flex-col gap-3',
  // Widget bubble in a chat (components/chat/widget-shell.ts WIDGET_SHELL_CLASS)
  bubble: 'rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3',
  bubbleText: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  bubbleActions: 'mt-2.5 flex flex-wrap items-center gap-2',
  characterRow: 'flex items-end gap-2 pl-2',
  // Chat log: the user's bubble and an empty log (RoomMessage; components/ui/empty-state.tsx)
  logEmpty: 'min-h-24',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer, on one row like Hermes's chat
  // composer: the box, then the model name, then send (hhdesign fix 2).
  composerForm: 'px-3 pb-3 pt-1',
  composerSurface: 'relative isolate rounded-2xl',
  composerRow: 'flex items-end gap-x-(--composer-control-gap) px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)',
  composerInputCell: 'min-w-0 flex-1',
  // One line that grows as you type, no resize grip: CLARIFY_TEXTAREA_CLASS
  // (components/assistant-ui/clarify/core/shell.tsx) on the room composer's input.
  composerInput:
    'field-sizing-content max-h-40 min-h-0 resize-none !border-transparent !bg-transparent !shadow-none px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  // The model name as Hermes's composer model button shows it: normal letters, text-xs, tertiary
  // (app/chat/composer/model-pill.tsx PILL), without the button, chevron or picker.
  composerModel: 'flex h-(--composer-control-size) min-w-0 shrink items-center px-1 text-xs font-normal text-(--ui-text-tertiary)',
  composerSend: 'shrink-0',
  composerNote: 'px-3 pb-3 text-center text-[0.65rem] text-muted-foreground/50',

  // ---- hidden helper: a thin full-height strip at the page edge, its label written vertically
  // (hhdesign fix 4): components/ui/pane-tab.tsx TAB_VERTICAL and the collapsed kanban column
  // (plugins/kanban/board.tsx), on the open helper's fill ----
  strip:
    'flex h-full w-7 shrink-0 cursor-pointer flex-col items-center gap-2 bg-(--ui-sidebar-surface-background) py-3 text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  stripLabel: 'text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary) [writing-mode:vertical-rl]',

  // ---- Your setup ----
  // Bot picker: Capabilities' own profile scope selector (app/capabilities/scope-selector.tsx)
  botPicker: 'flex min-w-0 items-center gap-2',
  botPickerLabel: 'text-[0.7rem] font-medium text-(--ui-text-tertiary)',
  botPickerTrigger: 'text-xs h-7 w-56',
  // Card grid: Connectors' directory grid (app/capabilities/connectors/connectors-directory.tsx Group).
  // One column; layout.js adds the second when the column is wide enough (not the window's sm:).
  cardGrid: 'grid gap-3',
  cardWide: 'col-span-full',
  // One card: Connectors' row card (app/capabilities/connectors/connector-row-card.tsx), stacked
  card: 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-elevated) p-3',
  // Title on the left (it wraps), state on the right, so the state sits in the same place on every card
  cardHead: 'flex min-w-0 items-start gap-2',
  cardTitle: 'min-w-0 flex-1 text-[0.8125rem] font-semibold text-(--ui-text-primary)',
  // The card's state lane: a 5 px dot and the word (CardLane in the same file)
  cardState: 'flex shrink-0 items-center gap-1.5 text-[0.6875rem] text-(--ui-text-secondary)',
  dot: 'size-[5px] shrink-0 rounded-full',
  dotWorks: 'bg-(--ui-green)',
  dotFix: 'bg-(--ui-red)',
  dotCant: 'bg-(--ui-yellow)',
  dotNeutral: 'bg-(--ui-text-quaternary)',
  // The card's lines: SecondLine in the same file, without the two-line clamp
  cardText: 'text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  // Model name or count: the composer model label's tone, in normal letters (not mono: Hermes keeps
  // mono for code, paths and commands)
  cardValue: 'min-w-0 truncate text-[0.6875rem] text-(--ui-text-secondary)',
  // "Passes when": Connectors' fact line (CardLane)
  cardPasses: 'text-[0.6875rem] text-(--ui-text-tertiary)',
  cardActions: 'mt-1 flex flex-wrap items-center gap-1.5',
  cardStack: 'flex min-w-0 flex-col gap-1',
  // Text to paste: the source-tag chip's surface (app/master-detail.tsx ToolChip), as a block
  cardPaste: 'flex min-w-0 items-center gap-1.5 rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5',
  cardPasteText: 'min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  cardList: 'list-decimal space-y-1 pl-4 text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  pageActions: 'flex flex-wrap items-center gap-2 pt-1'
}

// Joins class names, skipping empty ones. Only K values go in.
export function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
export const ICONS = ['compass', 'arrow-swap', 'chevron-left', 'chevron-right', 'close', 'arrow-up', 'play-circle', 'location', 'info']
// Hermes's look has one primary button per screen (hhdesign fix 6); every other button of
// ours is secondary or ghost. tests/page-render.test.mjs counts them per screen.
