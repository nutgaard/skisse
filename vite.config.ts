import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/skisse/",
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
