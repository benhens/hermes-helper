// A fake host.request that records every method it was asked for. An answer may be a value, an
// Error (thrown), a function of the params, or a list: one item per call, the last one repeating.
export function fakeRequest(answers) {
  const calls = []
  const request = async (method, params, timeout) => {
    calls.push({ method, params, timeout })
    if (!(method in answers)) throw new Error(`unexpected method ${method}`)
    let a = answers[method]
    if (Array.isArray(a)) a = a.length > 1 ? a.shift() : a[0]
    if (a instanceof Error) throw a
    return typeof a === 'function' ? a(params) : a
  }
  return { request, calls }
}

// An error the way Hermes's JSON-RPC channel rejects: an Error carrying .code (json-rpc-channel.ts:65).
export const rpcError = (code, message) => Object.assign(new Error(message), { code })
