// Stand-in for @hermes/plugin-sdk (see react.mjs). Every name the plugin imports must exist here,
// or importing the plugin fails, which is itself a check. The test sets globalThis.__hhHost.
const live = () => globalThis.__hhHost

export const host = {
  request: (method, params, timeout) => live().request(method, params, timeout),
  state: { model: { get: () => live().model() } }
}
export const useValue = atom => atom.get()

export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const PRIMARY_ICON_BTN = 'sdk-primary-icon-btn'
export const composerInputBacking = 'sdk-composer-backing'
export const composerSurfaceRing = 'sdk-composer-ring'

export const Button = 'sdk:Button'
export const Codicon = 'sdk:Codicon'
export const EmptyState = 'sdk:EmptyState'
export const GlyphSpinner = 'sdk:GlyphSpinner'
export const RowButton = 'sdk:RowButton'
export const SegmentedControl = 'sdk:SegmentedControl'
export const Switch = 'sdk:Switch'
export const Textarea = 'sdk:Textarea'
export const Tip = 'sdk:Tip'
