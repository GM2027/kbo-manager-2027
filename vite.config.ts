import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

const ROOT_DIR = import.meta.dirname;

export default defineConfig(({ command }) => {
  const base =
    process.env.VITE_BASE_PATH ??
    (command === 'build' ? '/kbo-manager-2027/' : '/');
  return {
    base,
    build: {
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'vendor-motion',
                test: /[\\/]node_modules[\\/](motion|framer-motion)[\\/]/,
                priority: 25,
              },
              {
                name: 'vendor-icons',
                test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
                priority: 20,
              },
              {
                name: 'data-v18',
                test: /[\\/]src[\\/]data[\\/]v18RecalibratedData\.json$/,
                priority: 15,
              },
            ],
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      // Strips non-runtime archive assets from dist/ and adds GitHub Pages SPA helpers (.nojekyll + 404.html).
      {
        name: 'github-pages-dist-finalize',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(ROOT_DIR, 'dist');
          if (!fs.existsSync(distDir)) {
            return;
          }
          // public/assets/aistudio/ is an immutable archival/script reference (~17 MB) not loaded at runtime.
          const distAiStudio = path.resolve(distDir, 'assets/aistudio');
          if (fs.existsSync(distAiStudio)) {
            fs.rmSync(distAiStudio, { recursive: true, force: true });
          }
          fs.writeFileSync(path.resolve(distDir, '.nojekyll'), '');
          const indexHtml = path.resolve(distDir, 'index.html');
          const notFoundHtml = path.resolve(distDir, '404.html');
          if (fs.existsSync(indexHtml)) {
            fs.copyFileSync(indexHtml, notFoundHtml);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(ROOT_DIR, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
