const base = (import.meta.env.BASE_URL || '/').replace(/\/*$/, '/');

const rescanBtn = document.getElementById('rescan-btn');
const rescanStatus = document.getElementById('rescan-status');
const modelsList = document.getElementById('models-list');
const logoInput = document.getElementById('logo-input');
const logoSaveBtn = document.getElementById('logo-save-btn');
const logoRemoveBtn = document.getElementById('logo-remove-btn');
const logoStatus = document.getElementById('logo-status');
const logoPreview = document.getElementById('logo-preview');

async function loadModelsList() {
  try {
    const res = await fetch(`${base}models.json`);
    const models = await res.json();
    const list = Array.isArray(models) ? models : [];
    const labels = list.map((m) => (typeof m === 'object' && m.id ? m.id : m));
    modelsList.innerHTML = `
      <h3>Current models (${list.length})</h3>
      <ul>
        ${labels.map((l) => `<li>${l}</li>`).join('')}
      </ul>
    `;
  } catch (err) {
    modelsList.innerHTML = `<p class="rescan-status error">Failed to load model list</p>`;
  }
}

rescanBtn.addEventListener('click', async () => {
  rescanBtn.disabled = true;
  rescanStatus.textContent = 'Scanning...';
  rescanStatus.className = 'rescan-status';

  try {
    const res = await fetch(`${base}api/rescan-models`, { method: 'POST' });
    const text = await res.text();

    if (!text) {
      throw new Error('Empty response. Rescan API may not be available (dev server only).');
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid response: ${text.slice(0, 100)}`);
    }

    if (!res.ok) {
      throw new Error(data.error || 'Rescan failed');
    }

    rescanStatus.textContent = `Found ${data.models.length} model(s): ${data.models.join(', ') || 'none'}`;
    rescanStatus.className = 'rescan-status success';
    loadModelsList();
  } catch (err) {
    rescanStatus.textContent = err.message || 'Rescan failed. In production, run "npm run generate-models" to update the list.';
    rescanStatus.className = 'rescan-status error';
  } finally {
    rescanBtn.disabled = false;
  }
});

logoInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    logoSaveBtn.disabled = false;
    const reader = new FileReader();
    reader.onload = () => {
      logoPreview.innerHTML = `<img src="${reader.result}" alt="Logo preview" class="logo-preview-img" />`;
    };
    reader.readAsDataURL(file);
  } else {
    logoSaveBtn.disabled = true;
    logoPreview.innerHTML = '';
  }
});

logoSaveBtn.addEventListener('click', async () => {
  const file = logoInput.files[0];
  if (!file) return;
  logoSaveBtn.disabled = true;
  logoStatus.textContent = 'Saving...';
  logoStatus.className = 'rescan-status';
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await fetch(`${base}api/save-logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: reader.result }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.error || 'Save failed');
      logoStatus.textContent = 'Logo saved. Refresh the viewer to see it.';
      logoStatus.className = 'rescan-status success';
      loadLogoPreview();
    } catch (err) {
      logoStatus.textContent = err.message || 'Failed to save logo.';
      logoStatus.className = 'rescan-status error';
    } finally {
      logoSaveBtn.disabled = false;
    }
  };
  reader.readAsDataURL(file);
});

logoRemoveBtn.addEventListener('click', async () => {
  logoRemoveBtn.disabled = true;
  logoStatus.textContent = 'Removing...';
  logoStatus.className = 'rescan-status';
  try {
    const res = await fetch(`${base}api/remove-logo`, { method: 'POST' });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(data.error || 'Remove failed');
    logoStatus.textContent = 'Logo removed.';
    logoStatus.className = 'rescan-status success';
    logoInput.value = '';
    logoPreview.innerHTML = '';
    loadLogoPreview();
  } catch (err) {
    logoStatus.textContent = err.message || 'Failed to remove logo.';
    logoStatus.className = 'rescan-status error';
  } finally {
    logoRemoveBtn.disabled = false;
  }
});

async function loadLogoPreview() {
  try {
    const res = await fetch(`${base}logo.json`);
    if (res.ok) {
      const { path } = await res.json();
      logoPreview.innerHTML = `<img src="${base}${path.replace(/^\//, '')}?t=${Date.now()}" alt="Current logo" class="logo-preview-img" />`;
    } else {
      logoPreview.innerHTML = '<p class="logo-none">No logo set</p>';
    }
  } catch {
    logoPreview.innerHTML = '<p class="logo-none">No logo set</p>';
  }
}

loadModelsList();
loadLogoPreview();
