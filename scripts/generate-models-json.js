/**
 * Generates public/models.json from the models directory.
 * Run with: node scripts/generate-models-json.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, '..', 'models');
const outputPath = path.join(__dirname, '..', 'public', 'models.json');

const ids = fs.readdirSync(modelsDir)
  .filter((name) => {
    const fullPath = path.join(modelsDir, name);
    return fs.statSync(fullPath).isDirectory() &&
      fs.existsSync(path.join(fullPath, 'export'));
  })
  .sort();

fs.writeFileSync(outputPath, JSON.stringify(ids, null, 2));
console.log(`Generated models.json with ${ids.length} models:`, ids);
