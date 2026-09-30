import { cp, mkdir, rm } from "node:fs/promises"
import pkg from "../package.json"

await rm("demo/dist", { recursive: true, force: true })
await mkdir("demo/dist", { recursive: true })
const result = await Bun.build({
  entrypoints: ["demo/main.tsx"],
  outdir: "demo/dist",
  target: "browser",
  format: "esm",
  minify: true,
  naming: "app.[ext]",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __REPO_URL__: JSON.stringify(process.env.DEMO_REPO_URL ?? ""),
    __PACKAGE_NAME__: JSON.stringify(pkg.name),
  },
})
if (!result.success) throw new AggregateError(result.logs, "Demo build failed")
await cp("demo/public", "demo/dist", { recursive: true })
await cp("demo/index.html", "demo/dist/index.html")
console.log(
  "Static demo built in demo/dist. Set DEMO_REPO_URL when the repository exists.",
)
