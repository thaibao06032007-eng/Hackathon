let editingPlantId = null;

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
});

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

        list.innerHTML = plants.map(plant => `
            <div class="plant-list-item" data-id="${plant.id}">
                <span class="material-icons-outlined plant-icon">potted_plant</span>
                <div class="plant-list-info">
                    <h3>${escapeHtml(plant.name)}</h3>
                    <p>${escapeHtml(plant.species || 'No species')} &middot; ${escapeHtml(plant.location || 'No location')} &middot; ESP32: ${escapeHtml(plant.esp32_ip || 'Not configured')}</p>
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
        `).join('');
    } catch (error) {
        list.innerHTML = `<div class="loading">Error loading plants: ${escapeHtml(error.message)}</div>`;
    }
}

function openModal(plant = null) {
    const modal = document.getElementById('plant-modal');
    const title = document.getElementById('modal-title');

    if (plant) {
        title.textContent = 'Edit Plant';
        editingPlantId = plant.id;
        document.getElementById('plant-id').value = plant.id;
        document.getElementById('plant-name').value = plant.name;
        document.getElementById('plant-species').value = plant.species || '';
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
