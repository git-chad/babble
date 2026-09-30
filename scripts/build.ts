import { mkdir, rm } from "node:fs/promises"

await rm("dist", { recursive: true, force: true })
await mkdir("dist", { recursive: true })
const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "browser",
  format: "esm",
  minify: true,
})
if (!result.success)
  throw new AggregateError(result.logs, "Library build failed")
const types = Bun.spawn(
  ["bun", "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
  { stdout: "inherit", stderr: "inherit" },
)
if (await types.exited) throw new Error("Declaration build failed")
const bytes = new Uint8Array(await Bun.file("dist/index.js").arrayBuffer())
console.log(`Core: ${bytes.length} bytes minified`)
