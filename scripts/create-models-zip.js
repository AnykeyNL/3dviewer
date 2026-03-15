/**
 * Creates models.zip from the models directory.
 * Run with: node scripts/create-models-zip.js
 *
 * The zip will contain the same structure: [id]/export/[files]
 */
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, '..', 'models');
const zipPath = path.join(__dirname, '..', 'models.zip');

if (!fs.existsSync(modelsDir)) {
  console.error('Models directory not found:', modelsDir);
  process.exit(1);
}

const zip = new AdmZip();
zip.addLocalFolder(modelsDir);
zip.writeZip(zipPath);
console.log('Created', zipPath);
