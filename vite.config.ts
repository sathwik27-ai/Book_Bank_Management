
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

const isVercel =
  (Boolean(process.env.VERCEL) && process.env.VERCEL !== "0") ||
  Boolean(process.env.VERCEL_URL);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  cloudflare: isVercel ? false : undefined,
  plugins: isVercel ? [nitro({ preset: "vercel" })] : [],
});
