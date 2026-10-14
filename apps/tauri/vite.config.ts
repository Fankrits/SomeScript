import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const editor = here("../editor");
const host = process.env.TAURI_DEV_HOST;
// Where the Rust server listens in debug builds (src-tauri/src/server.rs DEV_API_PORT).
const apiPort = process.env.SOMESCRIPT_DEV_API_PORT ?? "1430";

// The desktop app reuses apps/editor's UI source as-is. Everything Next/Clerk/Sentry/Eve
// is swapped for a shim here; keep this list in sync with tsconfig.json "paths".
// Specific stubs must come before the generic "@/" -> apps/editor alias.
const shim = (name: string) => here(`./src/shims/${name}`);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: [
      { find: /^next\/dynamic$/, replacement: shim("next-dynamic.tsx") },
      { find: /^next\/image$/, replacement: shim("next-image.tsx") },
      { find: /^next\/navigation$/, replacement: shim("noop.ts") },
      { find: /^@clerk\/nextjs$/, replacement: shim("clerk.ts") },
      { find: /^@sentry\/nextjs$/, replacement: shim("noop.ts") },
      { find: /^@\/components\/analytics\/clarity$/, replacement: shim("clarity.ts") },
      { find: /^@\/components\/chat\/eve-thread$/, replacement: shim("eve-thread.tsx") },
      { find: /^@\/lib\/eve-threads-client$/, replacement: shim("eve-threads-client.ts") },
      { find: /^@\//, replacement: `${editor}/` },
    ],
    // One copy of each, even though editor files resolve bare imports from apps/editor.
    dedupe: [
      "react",
      "react-dom",
      "sonner",
      "lucide-react",
      "@codemirror/state",
      "@codemirror/view",
    ],
  },

  // src/shims/polyfills.ts is the first thing the app imports. Naming its packages here has Vite
  // pre-bundle them at startup. Left to discovery, a dev server whose cache predates them finds
  // them late, re-optimizes and reloads in the middle of loading the editor, and a page that kept
  // modules from both bundle generations loads @codemirror/state twice ("Unrecognized extension
  // value ... multiple instances of @codemirror/state") and renders blank. Changing this list also
  // changes Vite's cache hash, so a stale cache is rebuilt cleanly on the next start.
  optimizeDeps: {
    include: [
      "core-js/actual/array/at",
      "core-js/actual/array/to-reversed",
      "core-js/actual/array/to-sorted",
      "core-js/actual/object/has-own",
      "core-js/actual/string/at",
      "uuid",
    ],
  },

  // The editor reads these through Next's build-time inlining; there is no process.env here.
  define: {
    "process.env.NEXT_PUBLIC_COLLAB_ENABLED": '"false"',
    "process.env.NEXT_PUBLIC_COLLAB_WS_URL": '""',
    "process.env.NEXT_PUBLIC_WEB_URL": '""',
    "process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID": '""',
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
    // Editor source lives outside this package.
    fs: { allow: [here("../..")] },
    // changeOrigin: the Rust server only accepts its own Host (DNS-rebinding guard).
    proxy: { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true } },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
});
