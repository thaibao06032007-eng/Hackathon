document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setInterval(loadDashboard, 30000);
});

async function loadDashboard() {
    const grid = document.getElementById('plants-grid');

    try {
        const plants = await API.getPlants();

        if (plants.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-outlined">yard</span>
                    <p>No plants added yet</p>
                    <a href="/settings" class="btn btn-primary">
                        <span class="material-icons-outlined">add</span>
                        Add Your First Plant
                    </a>
                </div>
            `;
            return;
        }

        grid.innerHTML = plants.map(plant => createPlantCard(plant)).join('');
    } catch (error) {
        grid.innerHTML = `<div class="loading">Error loading plants: ${escapeHtml(error.message)}</div>`;
    }
}

function createPlantCard(plant) {
    const health = plant.health || {};
    const data = plant.latest_data || {};
    const statusClass = health.status || 'unknown';
    const statusLabel = health.label || 'No Data';

    const humidity = data.soil_humidity != null ? `${data.soil_humidity.toFixed(1)}%` : '--';
    const temp = data.temperature != null ? `${data.temperature.toFixed(1)}\u00b0C` : '--';
    const light = data.light_level != null ? `${data.light_level.toFixed(0)} lux` : '--';

    return `
        <a href="/plant/${plant.id}" class="plant-card ${statusClass}">
            <div class="plant-card-header">
                <div>
                    <div class="plant-card-name">${escapeHtml(plant.name)}</div>
                    <div class="plant-card-species">${escapeHtml(plant.species || 'Unknown species')}</div>
                </div>
                <span class="health-indicator ${statusClass}">
                    <span class="health-dot"></span>
                    ${escapeHtml(statusLabel)}
                </span>
            </div>
            <div class="plant-card-readings">
                <div class="reading">
                    <span class="material-icons-outlined">water_drop</span>
                    <span class="reading-value">${humidity}</span>
                    <span class="reading-label">Humidity</span>
                </div>
                <div class="reading">
                    <span class="material-icons-outlined">thermostat</span>
                    <span class="reading-value">${temp}</span>
                    <span class="reading-label">Temperature</span>
                </div>
                <div class="reading">
                    <span class="material-icons-outlined">light_mode</span>
                    <span class="reading-value">${light}</span>
                    <span class="reading-label">Light</span>
                </div>
            </div>
        </a>
    `;
}
