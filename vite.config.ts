import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function copyStaticDirsPlugin(dirs: string[]) {
  return {
    name: 'copy-static-dirs',
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      for (const dir of dirs) {
        const src = path.resolve(__dirname, dir);
        const dest = path.resolve(outDir, dir);
        if (fs.existsSync(src)) {
          fs.cpSync(src, dest, { recursive: true });
        }
      }
      const rootGlb = path.resolve(__dirname, 'kepler.glb');
      if (fs.existsSync(rootGlb)) {
        fs.copyFileSync(rootGlb, path.resolve(outDir, 'kepler.glb'));
      }
    },
  };
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

function serveRawStaticDirsPlugin(rawPrefixes: string[], strictAssetPrefixes: string[]) {
  return {
    name: 'serve-raw-static-dirs',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url || '/').split('?')[0];

        // Return real 404 (not SPA index.html) when a requested audio/asset/data file is missing
        if (strictAssetPrefixes.some((p) => urlPath.startsWith(p))) {
          const filePath = path.resolve(__dirname, '.' + urlPath);
          const publicPath = path.resolve(__dirname, 'public' + urlPath);
          const existsInRoot = filePath.startsWith(__dirname) && fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory();
          const existsInPublic = publicPath.startsWith(path.resolve(__dirname, 'public')) && fs.existsSync(publicPath) && !fs.statSync(publicPath).isDirectory();
          if (!existsInRoot && !existsInPublic) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
        }

        // Bypass Vite module/HTML transform for standalone sub-sites (anatomy/ and kepler-modle-main/)
        if (!rawPrefixes.some((p) => urlPath === p || urlPath.startsWith(p + '/'))) {
          next();
          return;
        }

        let relPath = urlPath.replace(/^\/+/, '');
        let targetPath = path.resolve(__dirname, relPath);
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
          targetPath = path.join(targetPath, 'index.html');
        }
        if (!targetPath.startsWith(__dirname) || !fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        const ext = path.extname(targetPath).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        fs.createReadStream(targetPath).pipe(res);
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      serveRawStaticDirsPlugin(['/anatomy', '/kepler-modle-main'], ['/audio/', '/assets/', '/data/']),
      react(),
      tailwindcss(),
      copyStaticDirsPlugin(['assets', 'audio', 'data', 'anatomy', 'kepler-modle-main']),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          acknowledgements: path.resolve(__dirname, 'acknowledgements.html'),
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
    },
  };
});
