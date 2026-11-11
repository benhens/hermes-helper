// What the page keeps in ctx.storage on the person's computer.
// Keys the page reads back: tab (dashboard | learn | my_setup), helperWidth (the width Helper's window was dragged
// to, 360 to 600 px). Anything unexpected in storage falls back to the default.
// dash-v1: the first build's tabs (Setup, Your setup) left the page; their keys step, answers and remember are no
// longer read or written by the page (their parked files, src/steps.js and src/setup-tab.js, still name them).
// About the person, only the record of what Helper keeps (talk v2 row 3): never what they do, never the
// conversation, nothing about their bots (the Dashboard reads Hermes each time it opens). STORED_KEYS is every key
// the plugin may write; tests/state.test.mjs reads every storage call in src/ and fails on a key outside it.
import { clampHelperWidth, HELPER_PX } from './layout.js'

// 'kept' is the one record of what Helper keeps about the person, by fixed rules (src/kept.js).
// 'met' (changes-14, keeps.met): true once Helper has said hello, so the name is asked only on the first
// visit; nothing about the person, and no Forget removes it (src/page.js).
export const STORED_KEYS = ['tab', 'helperWidth', 'kept', 'met']
// dash-v1: the three tabs, Dashboard first (only it is built)
// loom-fixes: My setup is out (his words, Loom 3:22); a stored 'my_setup' opens the Dashboard
export const TAB_IDS = ['dashboard', 'learn']

export function readState(get) {
  const tab = get('tab', TAB_IDS[0])
  return {
    tab: TAB_IDS.includes(tab) ? tab : TAB_IDS[0],
    helperWidth: clampHelperWidth(get('helperWidth', HELPER_PX))
  }
}
