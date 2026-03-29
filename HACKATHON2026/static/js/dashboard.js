document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setInterval(loadDashboard, 30000);
});

async function loadDashboard() {
    const grid = document.getElementById('plants-grid');

    try {
        const plants = await API.getPlants();

        // Update stats
        updateStats(plants);

        if (plants.length === 0) {
            grid.innerHTML = `
                <div class="dash-empty">
                    <span class="material-icons-outlined">yard</span>
                    <p>No plants added yet</p>
                    <a href="/settings" class="dash-add-btn">
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

function updateStats(plants) {
    const total = plants.length;
    let healthy = 0, attention = 0, critical = 0;
    for (const p of plants) {
        const s = (p.health || {}).status;
        if (s === 'healthy') healthy++;
        else if (s === 'attention') attention++;
        else if (s === 'critical') critical++;
    }
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-healthy').textContent = healthy;
    document.getElementById('stat-attention').textContent = attention;
    document.getElementById('stat-critical').textContent = critical;
}

function createPlantCard(plant) {
    const health = plant.health || {};
    const data = plant.latest_data || {};
    const statusClass = health.status || 'unknown';
    const statusLabel = health.label || 'No Data';
    const score = health.score != null ? health.score : '--';

    const humidity = data.soil_humidity != null ? `${data.soil_humidity.toFixed(1)}%` : '--';
    const temp = data.temperature != null ? `${data.temperature.toFixed(1)}\u00b0C` : '--';

    const scoreCls = score >= 70 ? 'score-green' : score >= 40 ? 'score-yellow' : score !== '--' ? 'score-red' : 'score-gray';

    return `
        <a href="/plant/${plant.id}" class="dash-plant-card ${statusClass}">
            <div class="dash-card-top">
                <div class="dash-card-avatar">
                    <span class="material-icons-outlined">eco</span>
                </div>
                <div class="dash-card-info">
                    <span class="dash-card-name">${escapeHtml(plant.name)}</span>
                    <span class="dash-card-species">${escapeHtml(plant.species || 'Unknown species')}</span>
                </div>
                <div class="dash-card-score ${scoreCls}">${score}</div>
            </div>
            <div class="dash-card-readings">
                <div class="dash-reading">
                    <span class="material-icons-outlined" style="color:#43cea2">water_drop</span>
                    <span class="dash-reading-val">${humidity}</span>
                    <span class="dash-reading-lbl">Soil</span>
                </div>
                <div class="dash-reading">
                    <span class="material-icons-outlined" style="color:#ef5350">thermostat</span>
                    <span class="dash-reading-val">${temp}</span>
                    <span class="dash-reading-lbl">Temp</span>
                </div>
                <div class="dash-reading">
                    <span class="dash-status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
                </div>
            </div>
        </a>
    `;
}
