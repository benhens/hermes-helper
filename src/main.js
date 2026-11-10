// Plugin entry: one sidebar row and one full page. Nothing else is registered: no tools, hooks,
// panes, timers or network.
import { ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'
import { makePage } from './page.js'

const ID = 'helper'
const PATH = '/helper'

export default {
  id: ID,
  name: 'Helper',
  register(ctx) {
    const Page = makePage(ctx)
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: PATH }, render: () => jsx(Page, {}) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: PATH, label: 'Helper', codicon: 'compass' } }
    ])
  }
}
