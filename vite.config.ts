import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Check if we are building for Android / Capacitor dynamically
const isAndroid = 
  process.env.BUILD_TARGET === 'android' || 
  process.env.npm_lifecycle_event === 'mobile' ||
  process.env.npm_lifecycle_event === 'build:apk' ||
  process.argv.includes('--android');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'exclude-heavy-public-downloads-from-dist',
      closeBundle() {
        try {
          const distDownloads = path.resolve('dist', 'downloads');
          if (fs.existsSync(distDownloads)) {
            fs.rmSync(distDownloads, { recursive: true, force: true });
          }
          const distAiStudio = path.resolve('dist', 'assets', 'aistudio');
          if (fs.existsSync(distAiStudio)) {
            fs.rmSync(distAiStudio, { recursive: true, force: true });
          }
          // Remove unused raw .wasm files and non-LSTM files from dist/tesseract (worker.min.js only loads *-lstm.wasm.js)
          const distTesseract = path.resolve('dist', 'tesseract');
          if (fs.existsSync(distTesseract)) {
            for (const f of fs.readdirSync(distTesseract)) {
              if (
                f.endsWith('.wasm') ||
                (f.startsWith('tesseract-core') && !f.includes('-lstm.wasm.js'))
              ) {
                fs.rmSync(path.join(distTesseract, f), { force: true });
              }
            }
          }
        } catch (_) {}
      }
    }
  ],
  base: './', // Relative path for universal support across Web, CDN, Android, and Desktop (Tauri)
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: false,
    watch: {
      ignored: ['**/android/**', '**/*.cjs', '**/*.xlsx', '**/*.bat', '**/*.txt', '**/backups/**', '**/uploads/**'],
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    reportCompressedSize: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('xlsx') || id.includes('exceljs')) return 'vendor-excel';
            if (id.includes('docx') || id.includes('docxtemplater') || id.includes('mammoth')) return 'vendor-docx';
            if (id.includes('jspdf') || id.includes('pdf-lib') || id.includes('pdfjs-dist')) return 'vendor-pdf';
            if (id.includes('recharts') || id.includes('d3')) return 'vendor-charts';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('framer-motion') || id.includes('motion')) return 'vendor-motion';
            if (id.includes('quill') || id.includes('react-quill')) return 'vendor-editor';
            return 'vendor';
          }
        },
      },
    },
  },
})

