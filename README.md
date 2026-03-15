# 3D Model Viewer

A web-based 3D model viewer built with Three.js. Displays OBJ models from the `models/[id]/export` directory.

## Features

- **Model list** – Left sidebar showing all available models
- **Admin page** – Rescan the models folder to detect newly added models (`/admin.html`)
- **3D viewer** – Interactive orbit controls (drag to rotate, scroll to zoom)
- **UV map toggle** – Top menu option to visualize UV coordinates (red = U, green = V)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:8081

## Model Structure

Models are organized by **project** folders. Each project folder contains **zip files** of models:

```
models/
  [project]/
    model1.zip
    model2.zip
  [project2]/
    model1.zip
```

Each zip file contains a 3D model (OBJ, MTL, textures). The zip can have any structure; the first `.obj` file found is used.

## Adding Models

1. Create a project folder: `models/[projectName]/`
2. Add zip files of models to the project folder
3. Run Admin → Rescan Models (or `npm run generate-models`) to update the list

## Migrating from Old Structure

If you have the old structure (`models/[id]/export/`), run:
```bash
npm run migrate-models [projectName]
```
This creates `models/[projectName]/[id].zip` from each existing export folder. Default project name is `default`.

## Build

```bash
npm run build
```

Output is in the `dist/` folder.

## Production (Apache)

To run behind Apache:

1. Build and start the Node server:
   ```bash
   npm run build
   npm start
   ```
   The server runs on port 3000 by default (set `PORT` env var to change).

2. Configure Apache to proxy to the Node server. See `apache.conf.example`:
   ```apache
   ProxyPreserveHost On
   ProxyPass / http://127.0.0.1:3000/
   ProxyPassReverse / http://127.0.0.1:3000/
   ```

3. Enable mod_proxy: `a2enmod proxy proxy_http`

4. Keep the Node process running (e.g. with systemd, pm2, or screen).
