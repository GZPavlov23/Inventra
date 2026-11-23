// The website's only server code, running on Cloudflare's edge. /api/... is passed on to the
// Inventra API (api.inventra.day, which a Cloudflare Tunnel connects to the server); everything
// else is the built site, served by Cloudflare without running this code at all.
//
// For the browser the API stays on the site's own address, exactly like Vite's proxy in
// development, so the session cookie works without cross-site cookies or CORS.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  API_ORIGIN: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

    const target = new URL(url.pathname + url.search, env.API_ORIGIN)
    // Same method, headers (the session cookie among them) and body. A redirect from the API
    // goes back to the browser as it is, instead of being followed here.
    return fetch(new Request(target, request), { redirect: 'manual' })
  },
}
