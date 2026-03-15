import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsPath = path.resolve(__dirname, 'models');
const modelsJsonPath = path.resolve(__dirname, 'public', 'models.json');

const zipCache = new Map();

function getZipPath(project, model) {
  return path.join(modelsPath, project, model + '.zip');
}

function loadProjectZip(project, model) {
  const key = `${project}/${model}`;
  if (zipCache.has(key)) return zipCache.get(key);
  const zipPath = getZipPath(project, model);
  if (!fs.existsSync(zipPath)) return null;
  try {
    const zip = new AdmZip(zipPath);
    zipCache.set(key, zip);
    return zip;
  } catch (e) {
    return null;
  }
}

function findObjInZip(zip) {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entry.entryName.toLowerCase().endsWith('.obj')) {
      return entry.entryName.replace(/\\/g, '/');
    }
  }
  return null;
}

function parseZipType(filename) {
  const name = filename.slice(0, -4);
  if (name.endsWith('_30k')) return { type: 'lowRes', baseName: name.slice(0, -4) };
  if (name.endsWith('_1M')) return { type: 'highRes', baseName: name.slice(0, -3) };
  if (name.toLowerCase().endsWith('_photos')) return { type: 'photos', baseName: name.slice(0, -7) };
  return null;
}

function rescanModels() {
  const modelMap = new Map();
  if (!fs.existsSync(modelsPath)) {
    fs.writeFileSync(modelsJsonPath, JSON.stringify([], null, 2));
    return [];
  }
  const projects = fs.readdirSync(modelsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const project of projects) {
    const projectPath = path.join(modelsPath, project);
    const files = fs.readdirSync(projectPath);
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.zip')) continue;
      const parsed = parseZipType(file);
      if (!parsed) continue;
      const zipName = file.slice(0, -4);
      const key = `${project}/${parsed.baseName}`;
      if (!modelMap.has(key)) {
        modelMap.set(key, { project, baseName: parsed.baseName, lowRes: null, highRes: null, photos: null, lowResObjPath: '', highResObjPath: '' });
      }
      const entry = modelMap.get(key);
      if (parsed.type === 'lowRes') {
        const zip = loadProjectZip(project, zipName);
        entry.lowRes = zipName;
        if (zip) entry.lowResObjPath = findObjInZip(zip) || '';
      } else if (parsed.type === 'highRes') {
        const zip = loadProjectZip(project, zipName);
        entry.highRes = zipName;
        if (zip) entry.highResObjPath = findObjInZip(zip) || '';
      } else if (parsed.type === 'photos') {
        entry.photos = zipName;
      }
    }
  }
  const models = [];
  for (const [key, entry] of modelMap) {
    if (!entry.lowRes && !entry.highRes) continue;
    models.push({
      id: key,
      project: entry.project,
      baseName: entry.baseName,
      lowRes: entry.lowRes,
      highRes: entry.highRes,
      photos: entry.photos,
      lowResObjPath: entry.lowResObjPath,
      highResObjPath: entry.highResObjPath,
    });
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  fs.writeFileSync(modelsJsonPath, JSON.stringify(models, null, 2));
  return models;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

export default defineConfig({
  root: '.',
  base: process.env.BASE_PATH ?? (process.env.NODE_ENV === 'production' ? '/models/' : '/'),
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: ['index.html', 'admin.html'],
    },
  },
  server: {
    port: 8081,
    strictPort: true,
    host: true,
    fs: {
      allow: [__dirname, modelsPath],
    },
  },
  plugins: [
    {
      name: 'serve-models',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const urlPath = req.url.split('?')[0];
          if (urlPath === '/admin' || urlPath === '/admin/') {
            res.writeHead(302, { Location: '/admin.html' });
            res.end();
            return;
          }
          if (urlPath === '/api/rescan-models' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json');
            try {
              const models = rescanModels();
              res.statusCode = 200;
              res.end(JSON.stringify({ models: models.map((m) => m.id) }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          if (urlPath === '/api/save-logo' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
              res.setHeader('Content-Type', 'application/json');
              try {
                const data = JSON.parse(body);
                const match = (data.logo || '').match(/^data:image\/(\w+);base64,(.+)$/);
                if (!match) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Invalid logo data' }));
                  return;
                }
                const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                const logoPath = path.resolve(__dirname, 'public', `logo.${ext}`);
                const publicDir = path.resolve(__dirname, 'public');
                for (const e of ['png', 'jpg', 'jpeg', 'svg', 'gif']) {
                  const p = path.join(publicDir, `logo.${e}`);
                  if (fs.existsSync(p)) fs.unlinkSync(p);
                }
                fs.writeFileSync(logoPath, Buffer.from(match[2], 'base64'));
                fs.writeFileSync(path.join(publicDir, 'logo.json'), JSON.stringify({ path: `/logo.${ext}`, t: Date.now() }));
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, path: `/logo.${ext}` }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }
          if (urlPath === '/api/remove-logo' && req.method === 'POST') {
            res.setHeader('Content-Type', 'application/json');
            try {
              const publicDir = path.resolve(__dirname, 'public');
              for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'gif']) {
                const logoPath = path.join(publicDir, `logo.${ext}`);
                if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
              }
              const logoJsonPath = path.join(publicDir, 'logo.json');
              if (fs.existsSync(logoJsonPath)) fs.unlinkSync(logoJsonPath);
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }
          const downloadMatch = urlPath.match(/^\/api\/download\/zip\/([^/]+)\/([^/]+\.zip)$/);
          if (downloadMatch && req.method === 'GET') {
            const [, project, zipFile] = downloadMatch;
            const zipPath = path.join(modelsPath, project, zipFile);
            const rel = path.relative(modelsPath, path.resolve(modelsPath, project, zipFile));
            if (rel.startsWith('..') || path.isAbsolute(rel)) return next();
            if (!fs.existsSync(zipPath)) {
              res.statusCode = 404;
              res.end('Not found');
              return;
            }
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipFile}"`);
            fs.createReadStream(zipPath).pipe(res);
            return;
          }
          next();
        });

        server.middlewares.use('/models', (req, res, next) => {
          const urlPath = req.url.split('?')[0];
          if (urlPath === '.json' || urlPath === '/.json') return next();
          const relativePath = urlPath.replace(/^\/models\/?/, '').replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '').replace(/\\/g, '/');
          const parts = relativePath.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const [project, model, ...rest] = parts;
            const zip = loadProjectZip(project, model);
            if (zip) {
              const entryPath = rest.join('/');
              const fileName = rest[rest.length - 1] || '';
              let zipEntry = zip.getEntry(entryPath) || zip.getEntry(entryPath.replace(/\//g, '\\'));
              if (!zipEntry && fileName) {
                zipEntry = zip.getEntry(fileName);
              }
              if (!zipEntry) {
                for (const e of zip.getEntries()) {
                  const name = e.entryName.replace(/\\/g, '/');
                  if (!e.isDirectory && (name === entryPath || name.endsWith('/' + fileName) || name === fileName)) {
                    zipEntry = e;
                    break;
                  }
                }
              }
              if (zipEntry && !zipEntry.isDirectory) {
                const ext = path.extname(zipEntry.entryName);
                const types = {
                  '.obj': 'text/plain',
                  '.mtl': 'text/plain',
                  '.png': 'image/png',
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                };
                res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
                res.end(zipEntry.getData());
                return;
              }
            }
          }

          const filePath = path.join(modelsPath, relativePath);
          const rel = path.relative(modelsPath, path.resolve(modelsPath, relativePath));
          if (rel.startsWith('..') || path.isAbsolute(rel)) return next();
          fs.stat(filePath, (err, stat) => {
            if (err || !stat.isFile()) return next();
            const ext = path.extname(filePath);
            const types = {
              '.obj': 'text/plain',
              '.mtl': 'text/plain',
              '.png': 'image/png',
              '.jpg': 'image/jpeg',
            };
            res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
          });
        });
      },
      closeBundle() {
        const outDir = path.resolve(__dirname, 'dist');
        if (fs.existsSync(outDir) && fs.existsSync(modelsPath)) {
          copyDirSync(modelsPath, path.join(outDir, 'models'));
          rescanModels();
          fs.copyFileSync(modelsJsonPath, path.join(outDir, 'models.json'));
        }
      },
    },
  ],
});
