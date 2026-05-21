import { defineConfig } from "vite";
import { resolve } from "node:path";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const root = resolve(__dirname);

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      input: {
        content: resolve(root, "src/content/content.ts"),
        popup: resolve(root, "src/popup/popup.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            return "assets/[name]-[hash][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  plugins: [
    {
      name: "nanofill-postbuild",
      writeBundle() {
        const dist = resolve(root, "dist");
        mkdirSync(dist, { recursive: true });

        copyFileSync(
          resolve(root, "manifest.json"),
          resolve(dist, "manifest.json"),
        );

        const nestedPopup = resolve(dist, "src/popup/popup.html");
        const flatPopup = resolve(dist, "popup.html");
        if (existsSync(nestedPopup)) {
          const html = readFileSync(nestedPopup, "utf8").replace(
            /(\.\.\/)+/g,
            "./",
          );
          writeFileSync(flatPopup, html);
          rmSync(resolve(dist, "src"), { recursive: true, force: true });
        }
      },
    },
  ],
});
