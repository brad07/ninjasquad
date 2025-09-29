import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.TAURI_DEV_HOST;

  return {
    plugins: [react()],

    // Resolve configuration for @opencode-ai/sdk and @ alias
    resolve: {
      alias: {
        '@opencode-ai/sdk/client': new URL('./node_modules/@opencode-ai/sdk/dist/client.js', import.meta.url).pathname,
        '@opencode-ai/sdk': new URL('./node_modules/@opencode-ai/sdk/dist/index.js', import.meta.url).pathname,
        '@': path.resolve(__dirname, './src')
      }
    },

    // Define global constants
    define: {
      'process.env': {}
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
