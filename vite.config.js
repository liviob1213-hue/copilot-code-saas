import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// O SaaS reusa o core da extensao (copiado por scripts/sync-core.mjs para
// src/core). Nada de especial no build: Vite empacota React + core normalmente.
// O CORS de Vercel/Supabase-Mgmt e resolvido em runtime pelo Worker (core/net.js),
// entao nao precisamos de proxy no dev-server.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
});
