import { build } from "esbuild";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const common = { entryPoints: ["src/index.ts"], bundle: true, target: "es2018", minify: true, sourcemap: true };

// ESM build for bundlers
await build({ ...common, format: "esm", outfile: "dist/index.js" });

// Script-tag build: exposes window.pulseboard
await build({
  ...common,
  format: "iife",
  globalName: "__pulseboard",
  footer: { js: "window.pulseboard=__pulseboard.pulseboard;" },
  outfile: "dist/pulseboard.iife.js",
});

// Serve the script-tag build from the web app at /sdk.js
mkdirSync("../../apps/web/public", { recursive: true });
copyFileSync("dist/pulseboard.iife.js", "../../apps/web/public/sdk.js");

const size = statSync("dist/pulseboard.iife.js").size;
const gz = gzipSync(readFileSync("dist/pulseboard.iife.js")).length;
console.log(`✔ sdk built — ${(size / 1024).toFixed(1)} kB (${(gz / 1024).toFixed(1)} kB gzipped)`);
