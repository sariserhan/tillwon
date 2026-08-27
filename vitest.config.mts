import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // convex-test runs functions in an environment that matches Convex's own
    // V8 isolate rather than Node.
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
  },
});
