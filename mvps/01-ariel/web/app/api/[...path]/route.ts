// Proxy del navegador al API .NET. La URL interna se lee en tiempo de ejecución,
// así la misma imagen sirve en local y en Docker.
const API_URL = process.env.API_URL ?? 'http://localhost:8080';

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API_URL}/api/${path.map(encodeURIComponent).join('/')}${url.search}`;

  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'accept']) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  try {
    const res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: 'no-store',
    });
    const out = new Headers();
    const ct = res.headers.get('content-type');
    if (ct) out.set('content-type', ct);
    return new Response(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status, headers: out });
  } catch {
    return Response.json({ title: 'API no disponible', detail: `No se pudo contactar ${API_URL}` }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
