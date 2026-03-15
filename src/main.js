import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

const base = (import.meta.env.BASE_URL || '/').replace(/\/*$/, '/');

let scene, camera, renderer, controls;
let currentModel = null;
let meshMaterials = new Map();
let textureMaterials = new Map();
let currentProject = null;
let resolutionPreference = 'low';

function init() {
  const container = document.querySelector('.viewer');
  const canvas = document.getElementById('canvas');
  const rect = container.getBoundingClientRect();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d24);

  camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 1000);
  camera.position.set(0, 1, 3);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(rect.width, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.5;
  controls.maxDistance = 50;

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(-5, 10, -5);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x88ccff, 0.3);
  fillLight.position.set(5, 5, 5);
  scene.add(fillLight);

  window.addEventListener('resize', onResize);

  // Load logo
  fetch(`${base}logo.json`).then((r) => (r.ok ? r.json() : null)).then((data) => {
    if (data?.path) {
      const img = document.getElementById('header-logo');
      if (img) {
        img.src = `${base}${data.path.replace(/^\//, '')}${data.t ? `?t=${data.t}` : ''}`;
        img.alt = 'Logo';
        img.classList.remove('hidden');
        document.getElementById('header-title')?.classList.add('hidden');
      }
    }
  }).catch(() => {});

  // Project prompt
  setupProjectPrompt();

  // Material mode toggle (Texture / Plain)
  document.querySelectorAll('input[name="material-mode"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      setUVMode(e.target.value === 'texture');
    });
  });

  // Resolution toggle
  document.querySelectorAll('input[name="resolution"]').forEach((el) => {
    el.addEventListener('change', (e) => {
      resolutionPreference = e.target.value;
      const active = document.querySelector('.model-list li.active');
      if (active && active.dataset.id) {
        const models = Array.from(document.querySelectorAll('.model-list li')).map((li) => ({
          id: li.dataset.id,
          project: li.dataset.project,
          baseName: li.dataset.baseName,
          lowRes: li.dataset.lowRes || undefined,
          highRes: li.dataset.highRes || undefined,
          lowResObjPath: li.dataset.lowResObjPath || '',
          highResObjPath: li.dataset.highResObjPath || '',
          legacy: li.dataset.legacy === 'true',
          model: li.dataset.model,
          objPath: li.dataset.objPath || '',
        }));
        const m = models.find((x) => x.id === active.dataset.id);
        if (m) loadModel(m);
      }
    });
  });

  animate();
}

function setupProjectPrompt() {
  const overlay = document.getElementById('project-prompt-overlay');
  const input = document.getElementById('project-input');
  const submitBtn = document.getElementById('project-submit');
  const errorEl = document.getElementById('project-error');

  function handleSubmit() {
    const project = (input.value || '').trim();
    if (!project) return;
    errorEl.classList.add('hidden');
    fetch(`${base}models.json`)
      .then((r) => r.json())
      .then((allModels) => {
        const list = Array.isArray(allModels)
          ? allModels.map((m) => (typeof m === 'string' ? { id: m, project: m, model: m, objPath: `export/${m}_30k.obj`, legacy: true } : m))
          : [];
        const projectModels = list.filter(
          (m) => m.project.toLowerCase() === project.toLowerCase()
        );
        if (projectModels.length > 0) {
          currentProject = project;
          overlay.classList.add('hidden');
          document.getElementById('project-change')?.classList.remove('hidden');
          document.getElementById('project-name').textContent = project;
          loadModelList(projectModels);
        } else {
          errorEl.classList.remove('hidden');
        }
      })
      .catch((err) => {
        console.error('Failed to load models:', err);
        errorEl.textContent = 'Failed to load models';
        errorEl.classList.remove('hidden');
      });
  }

  submitBtn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
  input.focus();

  document.getElementById('project-change')?.addEventListener('click', () => {
    overlay.classList.remove('hidden');
    input.value = currentProject || '';
    input.focus();
    errorEl.classList.add('hidden');
  });
}

function getDownloadUrl(project, zipName) {
  return `${base}api/download/zip/${encodeURIComponent(project)}/${encodeURIComponent(zipName + '.zip')}`;
}

function loadModelList(models) {
  const ul = document.getElementById('model-list');
  const titleEl = document.getElementById('model-list-title');
  const errorMsg = document.getElementById('project-error-msg');
  ul.innerHTML = '';
  errorMsg.classList.add('hidden');

  if (!models || models.length === 0) {
    titleEl.textContent = 'Models';
    errorMsg.classList.remove('hidden');
    return;
  }

  titleEl.textContent = `Models (${currentProject})`;
  models.forEach((m) => {
    const li = document.createElement('li');
    const isNewFormat = m.baseName != null;
    const displayName = isNewFormat ? m.baseName : m.model;

    li.dataset.id = m.id;
    li.dataset.project = m.project;
    li.dataset.baseName = m.baseName ?? '';
    li.dataset.model = m.model ?? m.baseName ?? '';
    li.dataset.objPath = m.objPath ?? '';
    li.dataset.lowRes = m.lowRes ?? '';
    li.dataset.highRes = m.highRes ?? '';
    li.dataset.photos = m.photos ?? '';
    li.dataset.lowResObjPath = m.lowResObjPath ?? '';
    li.dataset.highResObjPath = m.highResObjPath ?? '';
    li.dataset.legacy = isNewFormat ? 'false' : 'true';

    const nameEl = document.createElement('span');
    nameEl.className = 'model-name';
    nameEl.textContent = displayName;
    li.appendChild(nameEl);

    const linksEl = document.createElement('div');
    linksEl.className = 'model-download-links';
    const links = [];
    if (m.lowRes) links.push({ href: getDownloadUrl(m.project, m.lowRes), label: 'Low' });
    if (m.highRes) links.push({ href: getDownloadUrl(m.project, m.highRes), label: 'High' });
    if (m.photos) links.push({ href: getDownloadUrl(m.project, m.photos), label: 'Photos' });
    if (links.length === 0 && m.legacy) {
      const zipName = (m.model || m.id).replace(/^[^/]+\//, '');
      links.push({ href: getDownloadUrl(m.project, zipName), label: 'Zip' });
    }
    const downloadIcon = '<svg class="download-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    links.forEach(({ href, label }) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = '';
      a.className = 'download-link';
      a.innerHTML = downloadIcon + `<span>${label}</span>`;
      a.addEventListener('click', (e) => e.stopPropagation());
      linksEl.appendChild(a);
    });
    if (linksEl.children.length) li.appendChild(linksEl);

    li.addEventListener('click', (e) => { if (!e.target.closest('a')) loadModel(m); });
    ul.appendChild(li);
  });
}

function loadModel(model) {
  const id = typeof model === 'string' ? model : model.id;
  const listItems = document.querySelectorAll('.model-list li');
  listItems.forEach((li) => li.classList.toggle('active', li.dataset.id === id));

  const panel = document.getElementById('model-list-panel');
  const backdrop = document.getElementById('model-list-backdrop');
  if (panel?.classList.contains('open')) {
    panel.classList.remove('open');
    backdrop?.classList.remove('visible');
    backdrop?.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('empty').classList.add('hidden');

  let baseUrl, objUrl, objBase;
  const project = typeof model === 'object' ? model.project : id.split('/')[0];

  if (typeof model === 'object' && model.legacy) {
    const objPath = model.objPath || '';
    const objDir = objPath.includes('/') ? objPath.substring(0, objPath.lastIndexOf('/') + 1) : '';
    const objFile = objPath.includes('/') ? objPath.substring(objPath.lastIndexOf('/') + 1) : objPath;
    objBase = objFile.replace(/\.obj$/i, '');
    baseUrl = `${base}models/${model.project}/${model.model}/${objDir}`.replace(/\/+/g, '/');
    objUrl = `${baseUrl}${objFile}`.replace(/\/+/g, '/');
  } else {
    const wantHigh = resolutionPreference === 'high';
    const zipName = wantHigh && model.highRes ? model.highRes : (model.lowRes || model.highRes);
    const objPath = wantHigh && model.highRes && model.highResObjPath
      ? model.highResObjPath
      : (model.lowResObjPath || model.highResObjPath || '');
    const objDir = objPath.includes('/') ? objPath.substring(0, objPath.lastIndexOf('/') + 1) : '';
    const objFile = objPath.includes('/') ? objPath.substring(objPath.lastIndexOf('/') + 1) : objPath;
    objBase = objFile.replace(/\.obj$/i, '');
    baseUrl = `${base}models/${project}/${zipName}/${objDir}`.replace(/\/+/g, '/');
    objUrl = `${baseUrl}${objFile}`.replace(/\/+/g, '/');
  }

  // Clear previous model
  if (currentModel) {
    scene.remove(currentModel);
    currentModel = null;
    meshMaterials.clear();
    textureMaterials.clear();
  }

  const meshMat = new THREE.MeshLambertMaterial({
    color: 0xc4724a,
    side: THREE.DoubleSide,
  });

  function setupModel(object) {
    document.getElementById('loading').classList.add('hidden');

    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        meshMaterials.set(child, meshMat.clone());
        const texMat = child.material
          ? (Array.isArray(child.material) ? child.material[0] : child.material).clone()
          : null;
        if (texMat) {
          texMat.side = THREE.DoubleSide;
          textureMaterials.set(child, texMat);
        }
        child.material = (document.querySelector('input[name="material-mode"]:checked')?.value === 'texture' && texMat)
          ? texMat
          : meshMaterials.get(child);
      }
    });

    object.rotation.x = -Math.PI / 2;
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    object.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2 / maxDim;
    object.scale.setScalar(scale);

    scene.add(object);
    currentModel = object;
    object.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(object);
    const modelCenter = finalBox.getCenter(new THREE.Vector3());
    controls.target.copy(modelCenter);
    camera.position.set(modelCenter.x, modelCenter.y + 1, modelCenter.z + 3);
    controls.update();

    const materialMode = document.querySelector('input[name="material-mode"]:checked')?.value;
    if (materialMode === 'texture') setUVMode(true);
  }

  const mtlLoader = new MTLLoader();
  mtlLoader.setPath(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');
  mtlLoader.setResourcePath(baseUrl.endsWith('/') ? baseUrl : baseUrl + '/');

  mtlLoader.load(
    `${objBase}.mtl`,
    (materials) => {
      materials.preload();
      const objLoader = new OBJLoader();
      objLoader.setMaterials(materials);
      objLoader.load(
        objUrl,
        setupModel,
        undefined,
        (err) => {
          document.getElementById('loading').classList.add('hidden');
          document.getElementById('empty').classList.remove('hidden');
          document.getElementById('empty').textContent = 'Failed to load model';
          console.error(err);
        }
      );
    },
    undefined,
    () => {
      const objLoader = new OBJLoader();
      objLoader.load(objUrl, setupModel, undefined, (err) => {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('empty').classList.remove('hidden');
        document.getElementById('empty').textContent = 'Failed to load model';
        console.error(err);
      });
    }
  );
}

function setUVMode(enabled) {
  if (!currentModel) return;

  currentModel.traverse((child) => {
    if (child.isMesh) {
      const meshMat = meshMaterials.get(child);
      const texMat = textureMaterials.get(child);
      child.material = enabled && texMat ? texMat : meshMat;
    }
  });
}

function onResize() {
  const container = document.querySelector('.viewer');
  const rect = container.getBoundingClientRect();

  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  renderer.setSize(rect.width, rect.height);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  const coordsEl = document.getElementById('viewer-coords');
  if (coordsEl) {
    const p = camera.position;
    coordsEl.textContent = `X: ${p.x.toFixed(2)}  Y: ${p.y.toFixed(2)}  Z: ${p.z.toFixed(2)}`;
  }
  renderer.render(scene, camera);
}

init();
