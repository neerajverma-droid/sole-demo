import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.live.test.ts"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.setup.ts"],
    // One run at a time: two concurrent runs would read each other's events
    // out of the export API, and the run id only protects against that if
    // nothing else is racing the same project.
    fileParallelism: false,
    testTimeout: 10 * 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
