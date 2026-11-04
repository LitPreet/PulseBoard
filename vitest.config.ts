import { defineConfig } from "vitest/config";

const nodeMajor = Number(process.versions.node.split(".")[0]);

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    testTimeout: 30_000,
    // Node ≥ 25 ships a global localStorage that shadows happy-dom's — turn it off for tests.
    poolOptions: { forks: { execArgv: nodeMajor >= 22 ? ["--no-experimental-webstorage"] : [] } },
  },
});
