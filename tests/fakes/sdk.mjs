// Stand-in for @hermes/plugin-sdk (see react.mjs). Every name the plugin imports must exist here,
// or importing the plugin fails, which is itself a check. The test sets globalThis.__hhHost:
//   { request(method, params, timeout), gateway?, profile?, model?, skills?(p), toolsets?(p), profiles?() }
const live = () => globalThis.__hhHost
const atom = read => ({ get: read })

export const host = {
  request: (method, params, timeout) => live().request(method, params, timeout),
  // host.navigate opens one of Hermes's own screens; the test reads where the page asked to go.
  // h.navigateThrows makes it throw, as a door that is missing would.
  navigate: to => {
    const h = live()
    if (h.navigateThrows) throw new Error('host.navigate threw')
    ;(h.navigated ||= []).push(to)
  },
  state: {
    // host.state.model exists in Hermes; the page must not read it (tests check modelRead stays unset).
    model: atom(() => {
      live().modelRead = true
      return live().model ?? ''
    }),
    gateway: atom(() => live().gateway ?? 'open'),
    profile: atom(() => live().profile ?? 'default')
  },
  skills: { list: profile => call('skills', profile) },
  toolsets: { list: profile => call('toolsets', profile) },
  profiles: { list: () => call('profiles') },
  // dash-v1: host.status() (in the SDK docs) and host.listPersistedSessions (in the SDK, not in its docs): each is a
  // function only when the test gives a fake for it, so a Hermes without them can be stood in for too.
  get status() {
    return typeof live().status === 'function' ? () => call('status') : undefined
  },
  get listPersistedSessions() {
    return typeof live().listPersisted === 'function' ? (route, options) => call('listPersisted', { route, ...options }) : undefined
  },
  // host.newChat opens a new chat in Hermes; the test reads that it was asked for
  newChat: profile => {
    ;(live().newChats ||= []).push(profile === undefined ? null : profile)
  }
}

function call(name, arg) {
  const h = live()
  ;(h.sdkCalls ||= []).push({ name, arg })
  if (h.throwNow === name) throw new Error(`host.${name} threw`) // a host door that throws instead of rejecting
  if (typeof h[name] !== 'function') return Promise.reject(new Error(`no fake for host.${name}`))
  return Promise.resolve().then(() => h[name](arg))
}

export const useValue = a => a.get()

export const ROUTES_AREA = 'routes'
export const SIDEBAR_NAV_AREA = 'sidebar.nav'
export const PRIMARY_ICON_BTN = 'sdk-primary-icon-btn'
export const composerInputBacking = 'sdk-composer-backing'
export const composerSurfaceRing = 'sdk-composer-ring'

export const Button = 'sdk:Button'
export const Codicon = 'sdk:Codicon'
export const CopyButton = 'sdk:CopyButton'
export const EmptyState = 'sdk:EmptyState'
export const GlyphSpinner = 'sdk:GlyphSpinner'
export const RowButton = 'sdk:RowButton'
export const SegmentedControl = 'sdk:SegmentedControl'
export const Select = 'sdk:Select'
export const SelectContent = 'sdk:SelectContent'
export const SelectItem = 'sdk:SelectItem'
export const SelectTrigger = 'sdk:SelectTrigger'
export const SelectValue = 'sdk:SelectValue'
export const Switch = 'sdk:Switch'
export const Textarea = 'sdk:Textarea'
export const ListRow = 'sdk:ListRow'
export const Tip = 'sdk:Tip'
// dash-v1: Hermes's Tabler icons, as the SDK hands them out (`export * as icons from '@/lib/icons'`)
export const icons = { Box: 'sdk:icons.Box', Brain: 'sdk:icons.Brain', Lock: 'sdk:icons.Lock' }
