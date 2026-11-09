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
  head: 'flex shrink-0 items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]',
  // Title: plugins/hermes-bots/group-room-ui.tsx RoomHeader <h2>
  title: 'min-w-0 truncate px-1 text-[0.9375rem] font-semibold text-foreground',
  headEnd: 'ml-auto flex shrink-0 items-center gap-0.5',
  body: 'flex min-h-0 flex-1',

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
  rowText: 'min-w-0 flex-1',
  rowTitle: 'block truncate text-[0.78rem] font-medium text-foreground/85',
  rowTitleOff: 'block truncate text-[0.78rem] font-normal text-muted-foreground/60',
  rowSub: 'flex min-w-0 items-center gap-1 text-[0.62rem] text-muted-foreground/50',
  truncate: 'truncate',
  // CapRow's meta chip, used as the step number
  rowNumber: 'shrink-0 rounded bg-(--ui-bg-quinary) px-1 py-px text-[0.6rem] tabular-nums leading-3.5 text-(--ui-text-tertiary)',
  // DetailColumn footer caption (app/master-detail.tsx)
  railFoot: 'shrink-0 px-2 pb-1 pt-3 text-[0.65rem] text-muted-foreground/50',

  // ---- open step (app/master-detail.tsx DetailColumn; app/capabilities/primitives.tsx DetailHeader) ----
  detail: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  detailScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]',
  detailInner: 'mx-auto max-w-2xl space-y-5 px-5 py-4',
  stepTitle: 'min-w-0 text-[0.9375rem] font-semibold tracking-tight',
  // Chat text (plugins/hermes-bots/group-room-ui.tsx RoomMessage body)
  prose: 'mt-1 text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // Settings row title + caption (app/settings/primitives.tsx ListRow)
  pairGrid: 'grid gap-5 sm:grid-cols-2',
  pairTitle: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  caption: 'mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // Settings SectionHeading (app/settings/primitives.tsx)
  question: 'mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium',
  // Choice cards: Hermes's first-run setup chooser (components/ui/chip.tsx, card variant)
  choices: 'grid gap-2 sm:grid-cols-3',
  choice: 'flex min-w-0 items-center gap-2.5 rounded-[6px] px-3 py-2.5 text-left text-[13px] border text-foreground transition-colors',
  choiceOn: 'border-primary bg-primary/15',
  choiceOff: 'border-transparent bg-muted hover:bg-accent/60',
  choiceText: 'min-w-0',
  choiceLabel: 'block',
  choiceSub: 'block text-xs text-muted-foreground',
  // Source tags: app/master-detail.tsx ToolChip
  chips: 'flex flex-wrap items-center gap-1.5',
  chipsLabel: 'text-xs text-muted-foreground',
  chip: 'rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  // Video slot: a quiet scaffold line (components/chat/scaffold-row.tsx)
  scaffold: 'flex min-w-0 items-center gap-1.5 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)',
  scaffoldGlyph: 'grid size-3.5 shrink-0 place-items-center',
  actions: 'flex flex-wrap items-center gap-2',

  // ---- helper panel (a page column, like Hermes's right sidebar; master-detail.tsx DetailPane header) ----
  helper: 'flex min-h-0 shrink-0 flex-col bg-(--ui-sidebar-surface-background)',
  helperRight: 'border-l border-(--ui-stroke-tertiary)',
  helperLeft: 'border-r border-(--ui-stroke-tertiary)',
  helperTop: 'flex h-9 shrink-0 items-center gap-2 px-3',
  helperTopLabel: 'min-w-0 truncate text-xs font-medium text-foreground',
  // RoomHeader's ghost icon buttons (plugins/hermes-bots/group-room-ui.tsx)
  iconTone: 'text-(--ui-text-tertiary)',
  helperBody: 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3 pt-1',
  // Widget bubble in a chat (components/chat/widget-shell.ts WIDGET_SHELL_CLASS)
  bubble: 'rounded-3xl bg-(--ui-widget-surface-background) px-3.5 py-3',
  bubbleText: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  bubbleActions: 'mt-2.5 flex flex-wrap items-center gap-2',
  characterRow: 'flex items-end gap-2 pl-2',
  // Chat log: the user's bubble and an empty log (RoomMessage; components/ui/empty-state.tsx)
  logEmpty: 'min-h-24',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer + ROOM_COMPOSER_INPUT_CLASS
  composerForm: 'px-3 pb-3 pt-1',
  composerSurface: 'relative isolate rounded-2xl',
  composerGrid: "grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-(--composer-control-gap) gap-y-1 px-(--composer-surface-pad-x) py-(--composer-surface-pad-y) [grid-template-areas:'reply_reply_reply''files_files_files''attach_input_send']",
  composerInputCell: 'min-w-0 [grid-area:reply]',
  composerInput: '!border-transparent !bg-transparent !shadow-none min-h-(--composer-input-min-height) px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  composerModel: 'mb-1 min-w-0 truncate px-1 font-mono text-[0.6875rem] text-(--ui-text-tertiary) [grid-area:input]',
  composerSend: 'mb-1 [grid-area:send]',
  composerNote: 'px-3 pb-3 text-center text-[0.65rem] text-muted-foreground/50',

  // ---- hidden helper: one round button at the page edge (components/ui/fan-menu.tsx discs) ----
  peekColumn: 'flex shrink-0 flex-col items-center px-2 pt-2',
  peekButton: 'rounded-full',

  // ---- Your setup ----
  // Bot picker: Capabilities' own profile scope selector (app/capabilities/scope-selector.tsx)
  botPicker: 'flex min-w-0 items-center gap-2',
  botPickerLabel: 'text-[0.7rem] font-medium text-(--ui-text-tertiary)',
  botPickerTrigger: 'text-xs h-7 w-56',
  // Card grid: Connectors' directory grid (app/capabilities/connectors/connectors-directory.tsx Group)
  cardGrid: 'grid gap-3 sm:grid-cols-2',
  cardWide: 'col-span-full',
  // One card: Connectors' row card (app/capabilities/connectors/connector-row-card.tsx), stacked
  card: 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-bg-elevated) p-3',
  cardHead: 'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5',
  cardTitle: 'min-w-0 text-[0.8125rem] font-semibold text-(--ui-text-primary)',
  // The card's state lane: a 5 px dot and the word (CardLane in the same file)
  cardState: 'ml-auto flex items-center gap-1.5 text-[0.6875rem] text-(--ui-text-secondary)',
  dot: 'size-[5px] shrink-0 rounded-full',
  dotWorks: 'bg-(--ui-green)',
  dotFix: 'bg-(--ui-red)',
  dotCant: 'bg-(--ui-yellow)',
  dotNeutral: 'bg-(--ui-text-quaternary)',
  // The card's lines: SecondLine in the same file, without the two-line clamp
  cardText: 'text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  // Model name: the composer's model label tone (plugins/hermes-bots/group-room-ui.tsx)
  cardValue: 'min-w-0 truncate font-mono text-[0.6875rem] text-(--ui-text-secondary)',
  // "Passes when": Connectors' fact line (CardLane)
  cardPasses: 'text-[0.6875rem] text-(--ui-text-tertiary)',
  cardActions: 'mt-1 flex flex-wrap items-center gap-1.5',
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
