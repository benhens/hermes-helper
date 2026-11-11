// Every class name the page uses, in one table. Each string is copied from Hermes Desktop's own
// source (v0.23.0, apps/desktop/src/...; the file is named above each group), so the page wears
// exactly the classes Hermes's own screens wear and needs no CSS of its own.
// Why one table: Hermes's stylesheet only holds classes its own code uses. A class we invent would
// silently do nothing, so scripts/check-hermes-classes.mjs checks every token here against the built
// Hermes CSS, and tests/plugin-shape.test.mjs fails if page code writes a class string anywhere else.

export const K = {
  // ---- page frame (app/page-search-shell.tsx: Capabilities' page shell, header with tabs) ----
  // A row: the left side (tabs, step list, open step), then Helper's strip or window. relative:
  // Helper over a narrow page (layout.js 'over') is placed inside it.
  root: 'relative flex h-full min-h-0 w-full min-w-0 overflow-hidden',
  left: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  // The header clears Hermes's title-bar band (its window buttons float there), as Capabilities does.
  // No page title: like Capabilities, the sidebar row names the page. loom2: no tabs, so the header holds nothing.
  head: 'flex shrink-0 items-center gap-3 px-6 pb-2 pt-[calc(var(--titlebar-height)+1.5rem)]',
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
  choiceText: 'min-w-0 flex-1',
  choiceLabel: 'block',
  choiceSub: 'block text-xs text-muted-foreground',
  // "Fits your goal" on an answer card: Hermes's member badge (plugins/hermes-bots/group-room-ui.tsx)
  fitTag: 'shrink-0 rounded-sm bg-(--ui-accent)/15 px-1 text-[0.625rem] font-medium text-(--ui-accent)',
  // The step's facts: a plain list, each fact in the chat's text size with its source tag below
  factList: 'space-y-4',
  fact: 'flex min-w-0 flex-col items-start gap-1.5',
  factText: 'text-pretty text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) text-foreground',
  // The two-column comparison (steps 2 and 3): each side with its own source tag
  pairSide: 'flex min-w-0 flex-col items-start gap-1.5',
  // Source tags: app/master-detail.tsx ToolChip, in the normal sans like Capabilities' metadata
  // chips ("Built In", "v1.0.1"); mono in Hermes means code, paths and commands.
  chips: 'flex flex-wrap items-center gap-1.5',
  chipsLabel: 'text-xs text-muted-foreground',
  chip: 'rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 text-[0.65rem] text-(--ui-text-tertiary)',
  // The same tag as a link to its docs page (opened in the person's browser through ctx.os)
  chipLink:
    'wrap-anywhere rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 text-left text-[0.65rem] text-(--ui-text-tertiary) transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  // Video slot: a quiet scaffold line (components/chat/scaffold-row.tsx)
  scaffold: 'flex min-w-0 items-center gap-1.5 text-[length:var(--conversation-tool-font-size)] leading-(--conversation-line-height) text-(--conversation-scaffold-text)',
  scaffoldGlyph: 'grid size-3.5 shrink-0 place-items-center',
  actions: 'flex flex-wrap items-center gap-2',

  // ---- Helper's conversation window: its own classes are the T table below (src/talk.css).
  // From Hermes it wears only these ----
  // The whole line for screen readers while the eye sees it word by word (src/reveal.js): Hermes's
  // own visually-hidden class (components/ui/dialog.tsx and others).
  srOnly: 'sr-only',
  // Composer: plugins/hermes-bots/group-room-ui.tsx RoomComposer (rounded surface, round send
  // button), on one row like Hermes's chat composer.
  composerSurface: 'relative isolate rounded-2xl',
  composerRow: 'flex items-end gap-x-(--composer-control-gap) px-(--composer-surface-pad-x) py-(--composer-surface-pad-y)',
  composerInputCell: 'min-w-0 flex-1',
  // One line that grows as you type, no resize grip: CLARIFY_TEXTAREA_CLASS
  // (components/assistant-ui/clarify/core/shell.tsx) on the room composer's input.
  composerInput:
    'field-sizing-content max-h-40 min-h-0 resize-none !border-transparent !bg-transparent !shadow-none px-1 py-1 text-[length:var(--conversation-text-font-size)] leading-(--dt-line-height) placeholder:text-(--ui-text-tertiary)',
  composerSend: 'shrink-0',

  // ---- Helper's strip: a thin full-height strip at the page's right edge in a narrow window, its
  // label written vertically: components/ui/pane-tab.tsx TAB_VERTICAL and the collapsed kanban
  // column (plugins/kanban/board.tsx), on Helper's fill. It folds Helper away and brings it back ----
  strip:
    'flex h-full w-7 shrink-0 cursor-pointer flex-col items-center gap-2 bg-(--ui-sidebar-surface-background) py-3 text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring',
  // loom-fixes: the strip a hidden Helper leaves: the same strip, holding only the Show Helper button (not itself a button)
  stripHidden: 'flex h-full w-7 shrink-0 flex-col items-center bg-(--ui-sidebar-surface-background) py-3',
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
  cardPasteText: 'wrap-anywhere min-w-0 flex-1 font-mono text-[0.65rem] text-(--ui-text-tertiary)',
  cardList: 'list-decimal space-y-1 pl-4 text-[0.72rem] leading-snug text-(--ui-text-secondary)',
  pageActions: 'flex flex-wrap items-center gap-2 pt-1',

  // ---- Helper's page in Hermes's Settings (src/settings-page.js): Hermes's settings rows (ListRow
  // in app/settings/primitives.tsx), the text box as config-field.tsx draws a JSON value (mono,
  // min-h-28, resize-y) and ListRow's own description tone for every small line ----
  settingsPage: 'flex min-w-0 flex-col gap-2',
  settingsBelow: 'mt-3 flex min-w-0 flex-col gap-2',
  settingsBox: 'min-h-28 resize-y bg-background font-mono text-xs',
  settingsHint: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  settingsText: 'text-[length:var(--conversation-text-font-size)] font-medium text-foreground',
  settingsMessage: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-secondary)',
  settingsAsk: 'flex flex-wrap items-center gap-2',
  settingsButtons: 'flex flex-wrap items-center gap-2',
  settingsFacts: 'flex flex-col gap-1 py-3 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
  // talk v2 look (hhdesign's review of e86b410): the bottom of the page under a thin divider, as Hermes's own
  // settings rows; the Forget question under its row
  settingsRule: 'mt-3 border-t border-(--ui-stroke-tertiary) pt-3',
  settingsForgetAsk: 'flex flex-wrap items-center gap-2 pb-3',
  // the message after Save and the buttons under it, 4 px apart
  settingsSaveGroup: 'flex min-w-0 flex-col items-start gap-1',
  // a line that cannot be read: three rows, 4 px apart; row 2 is the line in a mono chip that wraps anywhere
  // (Hermes's own code chip: --ui-bg-quinary, 2.5 px corners), row 3 the fix in the caption size
  settingsRefused: 'flex min-w-0 flex-col items-start gap-1',
  settingsRefusedLine: 'w-fit max-w-full wrap-anywhere rounded-[2.5px] bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-xs',
  settingsRefusedFix: 'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-secondary)',

  // ---- Helper's conversation window: text to paste inside the bubble (hhdesign's notes-wants.md item 4),
  // Hermes's own small code card (components/chat/compact-markdown.tsx): an edge, readable 12 px mono, Copy at
  // the top right. The setup card's text to paste (cardPaste) stays as it is ----
  bubblePaste: 'flex w-full min-w-0 items-start gap-2 rounded-md border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) py-1.5 pl-2.5 pr-1.5',
  bubblePasteText: 'wrap-anywhere min-w-0 flex-1 font-mono text-xs leading-4.5 text-(--ui-text-secondary)',
  // builder-qs (Lead, 11 Nov 00:55: the text to paste at least 12 px): the older line's too, as the bubble's
  bubblePasteTextOld: 'wrap-anywhere min-w-0 flex-1 font-mono text-xs leading-4.5 text-(--ui-text-secondary)',
  // talk-live-3 (Lead's call, 11 Nov 05:08): text the person is to type inside a line (/usage, "what can I ask you"),
  // in the paste box's code style: its edge, fill, 12 px mono and text colour, as a small inline chip
  typed: 'rounded-[2.5px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-1 font-mono text-xs text-(--ui-text-secondary)',

  // ---- dash-v1: the Dashboard tab's own shapes are the D table below (src/dash.css); from Hermes it wears these ----
  // Hermes's Tabler icons at the sizes Hermes draws them (hhtech-dash-icons.md point 1: 16 px in Settings' rows,
  // 14 px in its sub-rows); 20 px on the tiles (hhdesign's r7 size)
  // dash-v1: Hermes's own monospace type, for a command to paste
  mono: 'font-mono',
  icon14: 'size-3.5',
  icon16: 'size-4',
  icon20: 'size-5'
}

// dash-v1: every class of the Dashboard tab's sheet (src/dash.css, from hhdesign's design/dash-r7/build.js), in one
// table; each starts with hhd-. tests/dash-css.test.mjs checks that every name here has a rule in the sheet and
// that the sheet has no class nothing uses.
export const D = {
  main: 'hhd-main',
  compact: 'hhd-compact',
  card: 'hhd-card',
  title: 'hhd-title',
  // the top box
  stats: 'hhd-stats',
  tile: 'hhd-tile',
  tileIcon: 'hhd-tile-icon',
  tileWords: 'hhd-tile-words',
  tileNum: 'hhd-tile-num',
  tileLabel: 'hhd-tile-label',
  // loom-fixes: a tile that opens Hermes's own screen, and the plugins tile's name in place of a number
  tileBtn: 'hhd-tile-btn',
  tileName: 'hhd-tile-name',
  wait: 'hhd-wait',
  // Set up
  head: 'hhd-head',
  count: 'hhd-count',
  countN: 'hhd-count-n',
  road: 'hhd-road',
  lines: 'hhd-lines',
  line: 'hhd-line',
  stop: 'hhd-stop',
  dot: 'hhd-dot',
  done: 'hhd-done',
  todo: 'hhd-todo',
  here: 'hhd-here',
  quiet: 'hhd-quiet',
  sel: 'hhd-sel',
  up: 'hhd-up',
  down: 'hhd-down',
  label: 'hhd-label',
  name: 'hhd-name',
  you: 'hhd-you',
  next: 'hhd-next',
  nextWords: 'hhd-next-words',
  nextLine: 'hhd-next-line',
  nextLabel: 'hhd-next-label',
  nextName: 'hhd-next-name',
  nextWhy: 'hhd-next-why',
  allDone: 'hhd-alldone',
  // dash-v2: the small down arrow after "Open"
  openChev: 'hhd-open-chev',
  openWord: 'hhd-open-word',
  steps: 'hhd-steps',
  caret: 'hhd-caret',
  stepsHead: 'hhd-steps-head',
  stepsIcon: 'hhd-steps-icon',
  stepsName: 'hhd-steps-name',
  stepsWhy: 'hhd-steps-why',
  ol: 'hhd-ol',
  li: 'hhd-li',
  route: 'hhd-route',
  term: 'hhd-term',
  termWhen: 'hhd-term-when',
  paste: 'hhd-paste',
  pasteText: 'hhd-paste-text',
  pasteBox: 'hhd-paste-box',
  word: 'hhd-word',
  pasteFor: 'hhd-paste-for',
  quietLine: 'hhd-quietline',
  foot: 'hhd-foot',
  // dash-v2: a source tag (worn with Hermes's chip classes), quieter than the steps
  src: 'hhd-src',
  close: 'hhd-close'
}

// Joins class names, skipping empty ones. Only K and T values go in.
export function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// Helper's conversation window is the one part with a style sheet of our own (src/talk.css, from
// hhdesign's design/talk-r3/talk.css): its answers need hover, pressed and keyboard-ring looks
// that Hermes's classes do not have for these shapes. Every class of that sheet, in one table;
// each starts with hh-. tests/talk-css.test.mjs checks that every name here has a rule in the
// sheet and that the sheet has no rule nothing uses.
export const T = {
  win: 'hh-win',
  winTight: 'hh-narrow',
  winSmall: 'hh-small',
  // over a narrow page instead of beside it
  winOver: 'hh-over',
  // the conversation so far: Helper's older lines as small bubbles, the person's messages
  conv: 'hh-conv',
  convIn: 'hh-conv-in',
  old: 'hh-old',
  oldLink: 'hh-old-link',
  me: 'hh-me',
  // Helper's newest sentence
  bubble: 'hh-bubble',
  line: 'hh-line',
  inBubble: 'hh-in',
  inBubbleColumn: 'hh-col',
  button: 'hh-btn',
  // in place of a button: where to find a screen that no button can open
  where: 'hh-where',
  dots: 'hh-dots',
  dotOn: 'hh-on',
  dotsWait: 'hh-dots-run',
  dotsStill: 'hh-still',
  // under the bubble: the piece between bubble and character, the character, the answers to pick
  under: 'hh-under',
  linkCell: 'hh-linkcell',
  tail: 'hh-tail-short',
  tailFill: 'hh-tail-fill',
  tailEdge: 'hh-tail-edge',
  charSpace: 'hh-charspace',
  character: 'hh-char',
  answers: 'hh-answers',
  answer: 'hh-answer',
  // the things to pick inside the message box (talk-r5), growing and shrinking
  picks: 'hh-picks',
  // the faint lines: what was kept, what is used; the first-time line on a line of its own
  note: 'hh-note',
  noteFirst: 'hh-note-first',
  // talk v2 fixes: the words of a faint line that is no longer true (forgotten), struck through
  gone: 'hh-gone',
  link: 'hh-link',
  // the list of what Helper keeps (A1)
  rows: 'hh-rows',
  // the box "From the Hermes docs" (S1, S2): the docs' own words, not Helper's voice
  docs: 'hh-docs',
  docsHead: 'hh-docs-head',
  docsWords: 'hh-docs-words',
  docsWhere: 'hh-docs-where',
  // loom-fixes: the strip at the top of Helper's window (Hide Helper, Clear chat) and its question
  bar: 'hh-bar',
  root: 'hh-root',
  barAsk: 'hh-bar-ask',
  // the numbered clicks to add an optional skill, and the faint line after them
  steps: 'hh-steps',
  after: 'hh-after',
  // "More" among the things to pick: quieter than an answer (talk v2 look)
  more: 'hh-more',
  // held room: there, not seen yet
  wait: 'hh-wait',
  skip: 'hh-link hh-skip',
  grip: 'hh-grip',
  gripPill: 'hh-grip-pill',
  // normal-chat: the model's reply, drawn from its markdown (src/talk-view.js Markdown); smaller in an older line
  md: 'hh-md',
  mdOld: 'hh-md-old'
}

// Every codicon the plugin names (sidebar row and page). scripts/check-hermes-classes.mjs checks
// they exist in the codicon font Hermes ships; a test checks the code names no others.
// dash-v1: and the Dashboard's (src/dash.js DASH_ICONS, design/dash-r7/notes.md's table), each Hermes's own.
export const ICONS = ['compass', 'chevron-left', 'chevron-right', 'chevron-down', 'arrow-right', 'arrow-up', 'hubot', 'zap', 'extensions', 'cloud-download', 'robot', 'edit', 'comment', 'symbol-misc', 'watch', 'close', 'check', 'clear-all', 'layout-sidebar-right-off', 'layout-sidebar-right']
// dash-v1: the Tabler icons the Dashboard takes from Hermes through the SDK's `icons` (hhtech-dash-icons.md point 1)
export const TABLER_ICONS = ['Box', 'Brain', 'Lock']
// Hermes's look has one primary button per screen (hhdesign fix 6); every other button of
// ours is secondary or ghost. tests/page-render.test.mjs counts them per screen.
