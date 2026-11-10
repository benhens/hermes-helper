// Plugin entry: one sidebar row, one full page, and Helper's page in Hermes's Settings (Settings,
// then Plugins, then Helper). Nothing else is registered: no tools, hooks, panes, timers or network.
// registerSettingsPage is new in Hermes (desktop-plugin-sdk.md, "Plugin settings pages"): on a host
// without it the plugin still loads, without the settings page, and Helper's conversation then
// shows what it keeps in the conversation itself, with "Delete all of it".
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'
import { makePage } from './page.js'
import { makeSettingsPage } from './settings-page.js'

const ID = 'helper'
const PATH = '/helper'

export default {
  id: ID,
  name: 'Helper',
  register(ctx) {
    const settingsPage = typeof ctx.registerSettingsPage === 'function'
    const Page = makePage(ctx, { settingsPage, pluginId: ID })
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Helper', codicon: 'compass' } }
    ])
    if (settingsPage) {
      const Settings = makeSettingsPage(ctx)
      ctx.registerSettingsPage({ id: 'settings', title: 'Helper', icon: 'compass', render: () => jsx(Settings, {}) })
    }
  }
}
