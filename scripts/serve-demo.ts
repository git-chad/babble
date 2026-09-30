import { resolve, sep } from "node:path"

const root = resolve("demo/dist")
if (!(await Bun.file(`${root}/index.html`).exists()))
  throw new Error("Run bun run demo:build first")
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4100),
  async fetch(request) {
    const pathname = new URL(request.url).pathname
    const path = resolve(
      root,
      `.${decodeURIComponent(pathname === "/" ? "/index.html" : pathname)}`,
    )
    if (!path.startsWith(root + sep))
      return new Response("Forbidden", { status: 403 })
    const file = Bun.file(path)
    if (!(await file.exists()))
      return new Response("Not found", { status: 404 })
    return new Response(file, { headers: { "Cache-Control": "no-store" } })
  },
})
console.log(`Babble demo: ${server.url}`)
