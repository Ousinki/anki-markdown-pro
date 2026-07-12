import { defineConfig } from "vite";
import path from "path";

const target = process.env.BUILD_TARGET || "all";

const renderer = defineConfig({
  resolve: {
    alias: {
      katex: path.resolve(__dirname, 'src/dummy-katex.ts')
    }
  },
  build: {
    lib: {
      entry: "src/render.ts",
      formats: ["es"],
      fileName: () => "_review.js",
    },
    outDir: "anki_markdown",
    emptyOutDir: false,
    rollupOptions: {
      // Keep dynamic imports external - they load from collection.media at runtime
      external: (id) => {
        // Match ./_lang-*.js and ./_theme-*.js dynamic imports
        return /^\.\/_(?:lang|theme)-.*\.js$/.test(id);
      },
      output: {
        assetFileNames: "_review[extname]",
        inlineDynamicImports: true,
      },
    },
  },
});

const editor = defineConfig({
  resolve: {
    alias: {
      katex: path.resolve(__dirname, 'src/dummy-katex.ts')
    }
  },
  build: {
    lib: {
      entry: "src/editor.ts",
      formats: ["es"],
      fileName: () => "web/editor.js",
    },
    outDir: "anki_markdown",
    emptyOutDir: false,
    rollupOptions: {
      external: (id) => /^(anki|svelte)(\/|$)/.test(id),
      output: {
        assetFileNames: "web/editor[extname]",
      },
    },
  },
});

export default target === "editor" ? editor : renderer;
