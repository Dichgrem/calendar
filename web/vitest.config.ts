import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    server: {
      deps: {
        inline: ["@tanstack/react-query", "@phosphor-icons/react", "@radix-ui/react-slot"],
      },
    },
  },
  resolve: {
    alias: {
      "react-dom/client": "preact/compat/client",
      "react-dom": "preact/compat",
      react: "preact/compat",
    },
  },
});
