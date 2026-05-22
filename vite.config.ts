import { defineConfig, build } from "vite";
import { resolve } from "node:path";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const root = resolve(__dirname);

const sharedOutput = {
  entryFileNames: "[name].js",
  chunkFileNames: "chunks/[name]-[hash].js",
  assetFileNames: (assetInfo: { name?: string }) => {
    if (assetInfo.name?.endsWith(".css")) {
      return "assets/[name]-[hash][extname]";
    }
    return "assets/[name]-[hash][extname]";
  },
};

export default defineConfig(({ mode }) => ({
  base: "./",
  define: {
    __DEV__: mode === "development",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      // content.ts is excluded here and built separately (no chunk splitting)
      // because content scripts are loaded as classic scripts and cannot use
      // ES module import statements.
      input: {
        background: resolve(root, "src/background/background.ts"),
        offscreen: resolve(root, "src/offscreen/offscreen.ts"),
      },
      output: sharedOutput,
    },
  },
  plugins: [
    {
      name: "nanofill-postbuild",
      async writeBundle() {
        const dist = resolve(root, "dist");
        mkdirSync(dist, { recursive: true });

        // Build content script separately with inlineDynamicImports so that
        // no shared chunks are emitted — classic scripts cannot use import.
        await build({
          configFile: false,
          base: "./",
          define: { __DEV__: mode === "development" },
          build: {
            outDir: dist,
            emptyOutDir: false,
            target: "esnext",
            rollupOptions: {
              input: { content: resolve(root, "src/content/content.ts") },
              output: { ...sharedOutput, inlineDynamicImports: true },
            },
          },
        });

        copyFileSync(
          resolve(root, "manifest.json"),
          resolve(dist, "manifest.json"),
        );

        copyFileSync(
          resolve(root, "src/offscreen/offscreen.html"),
          resolve(dist, "offscreen.html"),
        );

        rmSync(resolve(dist, "icons/icon.svg"), { force: true });
      },
    },
  ],
}));
