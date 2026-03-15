/**
 * Migrates from models/[id]/export/ to models/[project]/[model].zip
 * Run with: node scripts/migrate-to-project-structure.js [projectName]
 *
 * Example: node scripts/migrate-to-project-structure.js default
 * Creates models/default/106699.zip, models/default/106708.zip from existing export folders
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, '..', 'models');
const projectName = process.argv[2] || 'default';

if (!fs.existsSync(modelsDir)) {
  console.error('Models directory not found');
  process.exit(1);
}

const projectDir = path.join(modelsDir, projectName);
fs.mkdirSync(projectDir, { recursive: true });

const dirs = fs.readdirSync(modelsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== projectName);

for (const dir of dirs) {
  const exportPath = path.join(modelsDir, dir.name, 'export');
  if (!fs.existsSync(exportPath)) continue;
  const zipPath = path.join(projectDir, `${dir.name}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(exportPath);
  zip.writeZip(zipPath);
  console.log('Created', zipPath);
}

console.log('Done. Run "npm run generate-models" or use Admin → Rescan to update the list.');
