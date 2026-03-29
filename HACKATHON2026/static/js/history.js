let humidityChart = null;
let tempChart = null;
let lightChart = null;

document.addEventListener('DOMContentLoaded', () => {
    loadPlantSelect();

    document.getElementById('plant-select').addEventListener('change', loadHistory);
    document.getElementById('time-range').addEventListener('change', loadHistory);
});

async function loadPlantSelect() {
    try {
        const plants = await API.getPlants();
        const select = document.getElementById('plant-select');
        plants.forEach(plant => {
            const option = document.createElement('option');
            option.value = plant.id;
            option.textContent = plant.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading plants:', error);
    }
}

async function loadHistory() {
    const plantId = document.getElementById('plant-select').value;
    const hours = document.getElementById('time-range').value;

    if (!plantId) return;

    try {
        const data = await API.getHistory(plantId, hours);
        renderCharts(data.sensor_data);
        renderWaterTable(data.water_events);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function renderCharts(sensorData) {
    const labels = sensorData.map(d => formatShortDate(d.recorded_at));

    humidityChart = renderOrUpdateChart(
        'humidity-chart', humidityChart,
        labels,
        sensorData.map(d => d.soil_humidity),
        'Soil Humidity (%)',
        '#0288d1',
        'rgba(2, 136, 209, 0.1)'
    );

    tempChart = renderOrUpdateChart(
        'temp-chart', tempChart,
        labels,
        sensorData.map(d => d.temperature),
        'Temperature (\u00b0C)',
        '#e63946',
        'rgba(230, 57, 70, 0.1)'
    );

    lightChart = renderOrUpdateChart(
        'light-chart', lightChart,
        labels,
        sensorData.map(d => d.light_level),
        'Light Level (lux)',
        '#f4a261',
        'rgba(244, 162, 97, 0.1)'
    );
}

function renderOrUpdateChart(canvasId, existingChart, labels, data, label, borderColor, bgColor) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    if (existingChart) {
        existingChart.data.labels = labels;
        existingChart.data.datasets[0].data = data;
        existingChart.update();
        return existingChart;
    }

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor,
                backgroundColor: bgColor,
                tension: 0.3,
                fill: true,
                pointRadius: 1,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 10, maxRotation: 45 },
                    title: { display: true, text: 'Time' }
                },
                y: {
                    title: { display: true, text: label }
                }
            }
        }
    });
}

function renderWaterTable(waterEvents) {
    const tbody = document.querySelector('#water-table tbody');

    if (!waterEvents || waterEvents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-message">No watering events in this period</td></tr>';
        return;
    }

    tbody.innerHTML = waterEvents.map(event => `
        <tr>
            <td>${escapeHtml(formatDateTime(event.recorded_at))}</td>
            <td>${escapeHtml(String(event.duration_seconds))}s</td>
            <td>${escapeHtml(event.triggered_by)}</td>
        </tr>
    `).join('');
}
