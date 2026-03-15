/**
 * Production server for 3D Model Viewer.
 * Run: npm run build && node server.js
 * Or with custom port: PORT=3000 node server.js
 *
 * For Apache: proxy /api, /models, /admin to this server.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(__dirname, 'dist');
const modelsPath = process.env.MODELS_PATH
  ? path.resolve(process.env.MODELS_PATH)
  : path.resolve(__dirname, 'models');
const modelsJsonPath = path.resolve(distPath, 'models.json');
const publicDir = distPath;

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

const MIME_TYPES = {
  '.obj': 'text/plain',
  '.mtl': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const app = express();
app.use(express.json({ limit: '10mb' }));

// /admin redirect
app.get('/admin', (req, res) => res.redirect(302, '/admin.html'));
app.get('/admin/', (req, res) => res.redirect(302, '/admin.html'));

// API: rescan models
app.post('/api/rescan-models', (req, res) => {
  try {
    const models = rescanModels();
    res.json({ models: models.map((m) => m.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: save logo
app.post('/api/save-logo', (req, res) => {
  try {
    const match = (req.body?.logo || '').match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid logo data' });
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const logoPath = path.join(publicDir, `logo.${ext}`);
    for (const e of ['png', 'jpg', 'jpeg', 'svg', 'gif']) {
      const p = path.join(publicDir, `logo.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    fs.writeFileSync(logoPath, Buffer.from(match[2], 'base64'));
    fs.writeFileSync(path.join(publicDir, 'logo.json'), JSON.stringify({ path: `/logo.${ext}`, t: Date.now() }));
    res.json({ success: true, path: `/logo.${ext}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: remove logo
app.post('/api/remove-logo', (req, res) => {
  try {
    for (const ext of ['png', 'jpg', 'jpeg', 'svg', 'gif']) {
      const logoPath = path.join(publicDir, `logo.${ext}`);
      if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
    }
    const logoJsonPath = path.join(publicDir, 'logo.json');
    if (fs.existsSync(logoJsonPath)) fs.unlinkSync(logoJsonPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: download zip
app.get('/api/download/zip/:project/:file', (req, res) => {
  const { project, file } = req.params;
  if (!file.endsWith('.zip')) return res.status(404).send('Not found');
  const zipFile = file;
  const zipPath = path.join(modelsPath, project, zipFile);
  const rel = path.relative(modelsPath, path.resolve(modelsPath, project, zipFile));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return res.status(404).send('Not found');
  }
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('Not found');
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFile}"`);
  fs.createReadStream(zipPath).pipe(res);
});

// Serve files from zip archives at /models/{project}/{zipName}/{path}
app.get(/^\/models\/(.+)$/, (req, res, next) => {
  const urlPath = req.path;
  const relativePath = req.params[0].replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '').replace(/\\/g, '/');
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
        res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
        return res.send(zipEntry.getData());
      }
    }
  }
  const filePath = path.join(modelsPath, relativePath);
  const rel = path.relative(modelsPath, path.resolve(modelsPath, relativePath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return next();
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next();
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

// Static files from dist
app.use(express.static(distPath));

// SPA fallback
app.get('*', (req, res) => {
  const p = path.join(distPath, req.path === '/' ? 'index.html' : req.path);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    res.sendFile(p);
  } else {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`3D Model Viewer server running at http://localhost:${PORT}`);
  console.log(`Models path: ${modelsPath}`);
  if (!fs.existsSync(distPath)) {
    console.warn('Warning: dist/ folder not found. Run "npm run build" first.');
  }
});
