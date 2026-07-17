import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseTarget = env.VITE_SUPABASE_URL || "https://boejvavrpolvtabunddo.supabase.co";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/supabase": {
          target: supabaseTarget,
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/supabase/, ""),
        },
      },
    },
  };
});
