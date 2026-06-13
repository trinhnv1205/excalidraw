import { defineConfig } from "vitest/config";

export default defineConfig({
  // Local config so the monorepo root vitest.config.mts is not picked up.
  root: __dirname,
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: false,
  },
});
