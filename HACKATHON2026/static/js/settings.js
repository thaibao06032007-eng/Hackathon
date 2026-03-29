let editingPlantId = null;

// ==================== SPECIES PRESETS WITH SCIENTIFICALLY ACCURATE CONDITIONS ====================
// Values based on established horticultural/botanical science for each category.
const SPECIES_PRESETS = {
    'Pine': {
        icon: '🌲', model: 'pine',
        desc: '3D Pine tree with layered cone canopy',
        conditions: {
            humidity_min: 40, humidity_max: 70,
            temp_min: 15, temp_max: 25,
            light_min: 10000, light_max: 80000,
            water_duration: 8
        },
        science: 'Conifers: Ideal active growth requires moderate humidity and bright light. Prevent waterlogging.'
    },
    'Palm': {
        icon: '🌴', model: 'palm',
        desc: '3D Palm tree with curved trunk & fronds',
        conditions: {
            humidity_min: 50, humidity_max: 80,
            temp_min: 18, temp_max: 30,
            light_min: 5000, light_max: 50000,
            water_duration: 7
        },
        science: 'Tropical palms: Thrive in consistent warmth and high humidity. Avoid drafts and cold spots.'
    },
    'Oak': {
        icon: '🌳', model: 'oak',
        desc: '3D Oak tree with bushy spherical canopy',
        conditions: {
            humidity_min: 40, humidity_max: 60,
            temp_min: 15, temp_max: 28,
            light_min: 15000, light_max: 60000,
            water_duration: 10
        },
        science: 'Temperate deciduous: Moderate moisture. High light requirements for healthy foliage development.'
    },
    'Cherry Blossom': {
        icon: '🌸', model: 'cherry',
        desc: '3D Cherry tree with pink blossoms',
        conditions: {
            humidity_min: 50, humidity_max: 70,
            temp_min: 15, temp_max: 25,
            light_min: 10000, light_max: 60000,
            water_duration: 8
        },
        science: 'Prunus spp.: Active blooming and growth prefer mild temperatures (15-25°C) and bright, consistent light.'
    },
    'Bamboo': {
        icon: '🎋', model: 'bamboo',
        desc: '3D Bamboo stalks with leaf nodes',
        conditions: {
            humidity_min: 50, humidity_max: 80,
            temp_min: 18, temp_max: 35,
            light_min: 15000, light_max: 60000,
            water_duration: 7
        },
        science: 'Poaceae family: Fast-growing grass requiring steady moisture, high humidity, and warm environments.'
    },
    'Cactus': {
        icon: '🌵', model: 'cactus',
        desc: '3D Cactus with arms in a terracotta pot',
        conditions: {
            humidity_min: 10, humidity_max: 30,
            temp_min: 18, temp_max: 35,
            light_min: 20000, light_max: 100000,
            water_duration: 3
        },
        science: 'Cactaceae: Arid conditions. Require very dry air, warm temperatures, and maximum direct sunlight.'
    },
    'Flower': {
        icon: '🌺', model: 'flower',
        desc: '3D Flower bouquet in a terracotta pot',
        conditions: {
            humidity_min: 40, humidity_max: 70,
            temp_min: 18, temp_max: 26,
            light_min: 10000, light_max: 50000,
            water_duration: 5
        },
        science: 'Blooming plants: Moderate conditions. Avoid extreme heat which wilts flowers. Good indirect/direct mix.'
    },
    'Fern': {
        icon: '🌿', model: 'fern',
        desc: '3D Fern with radiating fronds',
        conditions: {
            humidity_min: 60, humidity_max: 90,
            temp_min: 16, temp_max: 24,
            light_min: 1000, light_max: 8000,
            water_duration: 6
        },
        science: 'Polypodiopsida: Forest understory. High humidity, cool to warm temps, strict protection from direct midday sun.'
    },
};

// ==================== DOM READY ====================
document.addEventListener('DOMContentLoaded', () => {
    loadPlants();

    document.getElementById('add-plant-btn').addEventListener('click', () => openModal());
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('plant-form').addEventListener('submit', savePlant);

    // Close modal on backdrop click
    document.getElementById('plant-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeModal();
    });

    // Event delegation for edit/delete buttons
    document.getElementById('plants-list').addEventListener('click', (e) => {
        const item = e.target.closest('.plant-list-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);

        if (e.target.closest('.edit-btn')) {
            editPlant(id);
        } else if (e.target.closest('.delete-btn')) {
            const name = item.querySelector('h3').textContent;
            confirmDelete(id, name);
        }
    });

    setupSpeciesDropdown();
    setupImageUpload();
});

// ==================== AUTO-FILL CONDITIONS FROM PRESET ====================
function applyPresetConditions(presetKey) {
    const preset = SPECIES_PRESETS[presetKey];
    if (!preset || !preset.conditions) return;

    const c = preset.conditions;
    document.getElementById('humidity-min').value = c.humidity_min;
    document.getElementById('humidity-max').value = c.humidity_max;
    document.getElementById('temp-min').value = c.temp_min;
    document.getElementById('temp-max').value = c.temp_max;
    document.getElementById('light-min').value = c.light_min;
    document.getElementById('light-max').value = c.light_max;
    document.getElementById('water-duration').value = c.water_duration;

    // Show auto-fill indicator
    showConditionsToast(`🔬 Conditions auto-filled for ${presetKey}: ${preset.science}`);
}

function showConditionsToast(message) {
    let toast = document.getElementById('conditions-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'conditions-toast';
        toast.className = 'conditions-toast';
        document.querySelector('.modal-content').appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 6000);
}

// ==================== SPECIES DROPDOWN ====================
function setupSpeciesDropdown() {
    const select = document.getElementById('plant-species-select');
    const customInput = document.getElementById('plant-species-custom');
    const hiddenInput = document.getElementById('plant-species');
    const previewDiv = document.getElementById('species-3d-preview');
    const previewIcon = document.getElementById('species-preview-icon');
    const previewText = document.getElementById('species-preview-text');
    const imageArea = document.getElementById('custom-image-area');

    select.addEventListener('change', () => {
        const val = select.value;

        if (val === 'custom') {
            customInput.style.display = 'block';
            customInput.focus();
            hiddenInput.value = customInput.value;
            previewDiv.style.display = 'flex';
            previewIcon.textContent = '🌱';
            previewText.textContent = 'Default pot model — enter a name or use AI identification below';
            if (imageArea) imageArea.style.display = 'block';
        } else if (val && SPECIES_PRESETS[val]) {
            customInput.style.display = 'none';
            customInput.value = '';
            hiddenInput.value = val;
            previewDiv.style.display = 'flex';
            previewIcon.textContent = SPECIES_PRESETS[val].icon;
            previewText.textContent = SPECIES_PRESETS[val].desc;
            if (imageArea) imageArea.style.display = 'none';
            // Auto-fill ideal conditions
            applyPresetConditions(val);
        } else {
            customInput.style.display = 'none';
            customInput.value = '';
            hiddenInput.value = '';
            previewDiv.style.display = 'none';
            if (imageArea) imageArea.style.display = 'none';
        }
    });

    customInput.addEventListener('input', () => {
        hiddenInput.value = customInput.value;
    });
}

function setSpeciesDropdownValue(speciesValue) {
    const select = document.getElementById('plant-species-select');
    const customInput = document.getElementById('plant-species-custom');
    const hiddenInput = document.getElementById('plant-species');
    const previewDiv = document.getElementById('species-3d-preview');
    const previewIcon = document.getElementById('species-preview-icon');
    const previewText = document.getElementById('species-preview-text');
    const imageArea = document.getElementById('custom-image-area');

    if (!speciesValue) {
        select.value = '';
        customInput.style.display = 'none';
        customInput.value = '';
        hiddenInput.value = '';
        previewDiv.style.display = 'none';
        if (imageArea) imageArea.style.display = 'none';
        return;
    }

    const matchedPreset = Object.keys(SPECIES_PRESETS).find(
        key => key.toLowerCase() === speciesValue.toLowerCase()
    );

    if (matchedPreset) {
        select.value = matchedPreset;
        customInput.style.display = 'none';
        customInput.value = '';
        hiddenInput.value = matchedPreset;
        previewDiv.style.display = 'flex';
        previewIcon.textContent = SPECIES_PRESETS[matchedPreset].icon;
        previewText.textContent = SPECIES_PRESETS[matchedPreset].desc;
        if (imageArea) imageArea.style.display = 'none';
    } else {
        select.value = 'custom';
        customInput.style.display = 'block';
        customInput.value = speciesValue;
        hiddenInput.value = speciesValue;
        previewDiv.style.display = 'flex';
        previewIcon.textContent = '🌱';
        previewText.textContent = 'Custom species — uses potted plant 3D model';
        if (imageArea) imageArea.style.display = 'block';
    }
}

// ==================== AI IMAGE IDENTIFICATION ====================
function setupImageUpload() {
    const fileInput = document.getElementById('plant-image-input');
    const cameraInput = document.getElementById('plant-camera-input');
    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => handleImageSelect(e.target.files[0]));
    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => handleImageSelect(e.target.files[0]));
    }
}

async function handleImageSelect(file) {
    if (!file) return;

    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('image-preview-img');
    const status = document.getElementById('ai-status');
    const resultDiv = document.getElementById('ai-result');

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Show loading state
    status.style.display = 'flex';
    status.innerHTML = '<span class="loading-spinner"></span> Analyzing plant with AI...';
    status.className = 'ai-status analyzing';
    resultDiv.style.display = 'none';

    // Convert to base64 and send to API
    try {
        const base64 = await fileToBase64(file);
        const resp = await fetch('/api/identify-plant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: base64,
                mime_type: file.type || 'image/jpeg'
            })
        });

        const data = await resp.json();

        if (data.error) {
            status.innerHTML = `<span class="material-icons-outlined" style="font-size:18px;">error</span> ${escapeHtml(data.error)}`;
            status.className = 'ai-status error';
            return;
        }

        // Success — fill in the form
        const confidence = data.confidence || 'medium';
        const confidenceColors = { high: '#2d6a4f', medium: '#f4a261', low: '#e63946' };

        status.innerHTML = `<span class="material-icons-outlined" style="font-size:18px;">check_circle</span> Identified: <strong>${escapeHtml(data.common_name || data.species)}</strong>`;
        status.className = 'ai-status success';

        resultDiv.style.display = 'block';
        resultDiv.innerHTML = `
            <div class="ai-result-row">
                <span class="ai-label">Species:</span>
                <span class="ai-value">${escapeHtml(data.species || 'Unknown')}</span>
            </div>
            <div class="ai-result-row">
                <span class="ai-label">Common Name:</span>
                <span class="ai-value">${escapeHtml(data.common_name || 'Unknown')}</span>
            </div>
            <div class="ai-result-row">
                <span class="ai-label">Confidence:</span>
                <span class="ai-value" style="color:${confidenceColors[confidence]}; font-weight:600;">${confidence.toUpperCase()}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="apply-ai-btn" style="margin-top:8px; width:100%;">
                <span class="material-icons-outlined" style="font-size:16px;">auto_fix_high</span>
                Apply AI Results
            </button>
        `;

        // Store data for apply button
        resultDiv._aiData = data;
        document.getElementById('apply-ai-btn').addEventListener('click', () => {
            applyAIResults(resultDiv._aiData);
        });

    } catch (err) {
        status.innerHTML = `<span class="material-icons-outlined" style="font-size:18px;">error</span> ${escapeHtml(err.message)}`;
        status.className = 'ai-status error';
    }
}

function applyAIResults(data) {
    // Fill species name
    const customInput = document.getElementById('plant-species-custom');
    const hiddenInput = document.getElementById('plant-species');
    const displayName = data.common_name || data.species || '';
    customInput.value = displayName;
    hiddenInput.value = displayName;

    // Fill ideal conditions
    if (data.ideal_soil_humidity_min != null) document.getElementById('humidity-min').value = Math.round(data.ideal_soil_humidity_min);
    if (data.ideal_soil_humidity_max != null) document.getElementById('humidity-max').value = Math.round(data.ideal_soil_humidity_max);
    if (data.ideal_temperature_min != null) document.getElementById('temp-min').value = Math.round(data.ideal_temperature_min);
    if (data.ideal_temperature_max != null) document.getElementById('temp-max').value = Math.round(data.ideal_temperature_max);
    if (data.ideal_light_min != null) document.getElementById('light-min').value = Math.round(data.ideal_light_min);
    if (data.ideal_light_max != null) document.getElementById('light-max').value = Math.round(data.ideal_light_max);
    if (data.water_duration != null) document.getElementById('water-duration').value = Math.round(data.water_duration);

    showConditionsToast(`🤖 AI identified: ${displayName} — ideal conditions filled from botanical analysis`);
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ==================== PLANT LIST ====================
async function loadPlants() {
    const list = document.getElementById('plants-list');

    try {
        const plants = await API.getPlants();

        if (plants.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">yard</span>
                    <p>No plants configured yet</p>
                </div>
            `;
            return;
        }

        list.innerHTML = plants.map(plant => {
            const speciesInfo = getSpeciesDisplayInfo(plant.species);
            return `
            <div class="plant-list-item" data-id="${plant.id}">
                <span class="plant-list-icon">${speciesInfo.icon}</span>
                <div class="plant-list-info">
                    <h3>${escapeHtml(plant.name)}</h3>
                    <p>${escapeHtml(speciesInfo.label)} &middot; ${escapeHtml(plant.location || 'No location')} &middot; ESP32: ${escapeHtml(plant.esp32_ip || 'Not configured')}</p>
                </div>
                <div class="plant-list-actions">
                    <button class="btn btn-secondary btn-sm edit-btn">
                        <span class="material-icons-outlined">edit</span> Edit
                    </button>
                    <button class="btn btn-danger btn-sm delete-btn">
                        <span class="material-icons-outlined">delete</span>
                    </button>
                </div>
            </div>
        `}).join('');
    } catch (error) {
        list.innerHTML = `<div class="loading">Error loading plants: ${escapeHtml(error.message)}</div>`;
    }
}

function getSpeciesDisplayInfo(species) {
    if (!species) return { icon: '🌱', label: 'No species' };
    const preset = Object.keys(SPECIES_PRESETS).find(
        key => key.toLowerCase() === species.toLowerCase()
    );
    if (preset) {
        return { icon: SPECIES_PRESETS[preset].icon, label: preset };
    }
    return { icon: '🌱', label: species };
}

// ==================== MODAL ====================
function openModal(plant = null) {
    const modal = document.getElementById('plant-modal');
    const title = document.getElementById('modal-title');

    // Reset AI state
    const preview = document.getElementById('image-preview');
    const status = document.getElementById('ai-status');
    const resultDiv = document.getElementById('ai-result');
    if (preview) preview.style.display = 'none';
    if (status) { status.style.display = 'none'; status.className = 'ai-status'; }
    if (resultDiv) resultDiv.style.display = 'none';
    const fileInput = document.getElementById('plant-image-input');
    const cameraInput = document.getElementById('plant-camera-input');
    if (fileInput) fileInput.value = '';
    if (cameraInput) cameraInput.value = '';

    if (plant) {
        title.textContent = 'Edit Plant';
        editingPlantId = plant.id;
        document.getElementById('plant-id').value = plant.id;
        document.getElementById('plant-name').value = plant.name;
        setSpeciesDropdownValue(plant.species || '');
        document.getElementById('plant-location').value = plant.location || '';
        document.getElementById('plant-esp32-ip').value = plant.esp32_ip || '';
        document.getElementById('humidity-min').value = plant.ideal_soil_humidity_min;
        document.getElementById('humidity-max').value = plant.ideal_soil_humidity_max;
        document.getElementById('temp-min').value = plant.ideal_temperature_min;
        document.getElementById('temp-max').value = plant.ideal_temperature_max;
        document.getElementById('light-min').value = plant.ideal_light_min;
        document.getElementById('light-max').value = plant.ideal_light_max;
        document.getElementById('water-duration').value = plant.water_duration;
    } else {
        title.textContent = 'Add Plant';
        editingPlantId = null;
        document.getElementById('plant-form').reset();
        setSpeciesDropdownValue('');
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('plant-modal').classList.add('hidden');
    editingPlantId = null;
}

async function editPlant(id) {
    try {
        const plant = await API.getPlant(id);
        openModal(plant);
    } catch (error) {
        alert('Error loading plant: ' + error.message);
    }
}

async function savePlant(e) {
    e.preventDefault();

    const data = {
        name: document.getElementById('plant-name').value.trim(),
        species: document.getElementById('plant-species').value.trim(),
        location: document.getElementById('plant-location').value.trim(),
        esp32_ip: document.getElementById('plant-esp32-ip').value.trim(),
        ideal_soil_humidity_min: parseFloat(document.getElementById('humidity-min').value),
        ideal_soil_humidity_max: parseFloat(document.getElementById('humidity-max').value),
        ideal_temperature_min: parseFloat(document.getElementById('temp-min').value),
        ideal_temperature_max: parseFloat(document.getElementById('temp-max').value),
        ideal_light_min: parseFloat(document.getElementById('light-min').value),
        ideal_light_max: parseFloat(document.getElementById('light-max').value),
        water_duration: parseInt(document.getElementById('water-duration').value)
    };

    try {
        if (editingPlantId) {
            await API.updatePlant(editingPlantId, data);
        } else {
            await API.createPlant(data);
        }
        closeModal();
        loadPlants();
    } catch (error) {
        alert('Error saving plant: ' + error.message);
    }
}

async function confirmDelete(id, name) {
    if (confirm(`Are you sure you want to delete "${name}"? This will also delete all sensor data.`)) {
        try {
            await API.deletePlant(id);
            loadPlants();
        } catch (error) {
            alert('Error deleting plant: ' + error.message);
        }
    }
}
