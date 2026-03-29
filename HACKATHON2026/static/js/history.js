// ==================== Plant Chat Notifications ====================

let miniHumidityChart = null;
let miniTempChart = null;
let selectedChatPlantId = null;

document.addEventListener('DOMContentLoaded', () => {
    loadPlantContacts();
});

// ==================== Plant Contact List ====================

async function loadPlantContacts() {
    try {
        const plants = await API.getPlants();
        const container = document.getElementById('plant-contacts');

        if (!plants || plants.length === 0) {
            container.innerHTML = '<div class="notif-no-plants">No plants yet. Add one in Settings!</div>';
            return;
        }

        container.innerHTML = plants.map(p => {
            const health = p.health || {};
            const statusDot = health.status === 'critical' ? 'dot-red'
                : health.status === 'attention' ? 'dot-yellow'
                : health.status === 'healthy' ? 'dot-green'
                : 'dot-gray';
            const lastData = p.latest_data;
            let preview = 'Tap to see messages';
            if (lastData && lastData.soil_humidity != null) {
                const soil = lastData.soil_humidity;
                if (soil < (p.ideal_soil_humidity_min || 30)) preview = 'I\'m thirsty! 💧';
                else if (soil > (p.ideal_soil_humidity_max || 70)) preview = 'Too much water! 🏊';
                else preview = 'Doing great! 🌱';
            }
            return `
            <div class="notif-contact" data-id="${p.id}" onclick="selectChatPlant(${p.id})">
                <div class="notif-contact-avatar">
                    <span class="material-icons-outlined">eco</span>
                    <span class="notif-status-dot ${statusDot}"></span>
                </div>
                <div class="notif-contact-info">
                    <span class="notif-contact-name">${escapeHtml(p.name)}</span>
                    <span class="notif-contact-preview">${escapeHtml(preview)}</span>
                </div>
                <div class="notif-contact-meta">
                    ${health.score != null ? `<span class="notif-contact-score">${health.score}</span>` : ''}
                    <span class="material-icons-outlined notif-contact-arrow">chevron_right</span>
                </div>
            </div>`;
        }).join('');

        // Auto-select first plant
        selectChatPlant(plants[0].id);
    } catch (err) {
        document.getElementById('plant-contacts').innerHTML =
            '<div class="notif-no-plants">Error loading plants</div>';
    }
}

// ==================== Select & Load Chat ====================

async function selectChatPlant(plantId) {
    selectedChatPlantId = plantId;

    // Highlight active contact
    document.querySelectorAll('.notif-contact').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.id) === plantId);
    });

    document.getElementById('chat-area').style.display = 'block';
    document.getElementById('data-panel').style.display = 'block';
    document.getElementById('chat-messages').innerHTML = '<div class="loading">Loading messages...</div>';

    try {
        const data = await API.get(`/api/plants/${plantId}/chat`);
        renderChatHeader(data);
        renderChatMessages(data.messages);
        renderMiniCharts(data.sensor_history);
        renderWaterTable(data.water_events);
        renderDemoIndicator(data.demo_mode);
    } catch (err) {
        document.getElementById('chat-messages').innerHTML =
            '<div class="notif-empty-chat">Could not load messages 😕</div>';
    }
}

// ==================== Render Chat Header ====================

function renderChatHeader(data) {
    document.getElementById('chat-name').textContent = data.plant_name;

    const health = data.health || {};
    const statusText = health.label || 'Unknown';
    const statusEl = document.getElementById('chat-status');
    statusEl.textContent = statusText;
    statusEl.className = 'notif-chat-status status-' + (health.status || 'unknown');

    const badge = document.getElementById('chat-health-badge');
    if (health.score != null) {
        const cls = health.score >= 70 ? 'badge-green' : health.score >= 40 ? 'badge-yellow' : 'badge-red';
        badge.innerHTML = `<span class="notif-score-badge ${cls}">${health.score}</span>`;
    } else {
        badge.innerHTML = '';
    }
}

// ==================== Render Chat Bubbles ====================

function renderChatMessages(messages) {
    const container = document.getElementById('chat-messages');

    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="notif-empty-chat">No messages yet. Your plant is quiet today 🌿</div>';
        return;
    }

    let html = '<div class="notif-date-divider"><span>Today</span></div>';

    for (const msg of messages) {
        const bubbleClass = getBubbleClass(msg.type);
        const iconColor = getIconColor(msg.type);

        html += `
        <div class="notif-bubble-row">
            <div class="notif-bubble-icon" style="background:${iconColor}">
                <span class="material-icons-outlined">${escapeHtml(msg.icon || 'eco')}</span>
            </div>
            <div class="notif-bubble ${bubbleClass}">
                <div class="notif-bubble-text">${escapeHtml(msg.text)}</div>
                <div class="notif-bubble-time">${escapeHtml(msg.time || '')}</div>
            </div>
        </div>`;
    }

    container.innerHTML = html;
}

function getBubbleClass(type) {
    switch (type) {
        case 'alert': return 'bubble-alert';
        case 'warning': return 'bubble-warning';
        case 'good': return 'bubble-good';
        case 'info': return 'bubble-info';
        case 'greeting': return 'bubble-greeting';
        default: return 'bubble-default';
    }
}

function getIconColor(type) {
    switch (type) {
        case 'alert': return '#ef5350';
        case 'warning': return '#ffa726';
        case 'good': return '#43cea2';
        case 'info': return '#4fc3f7';
        case 'greeting': return '#ab47bc';
        default: return '#90a4ae';
    }
}

// ==================== Mini Charts ====================

function renderMiniCharts(sensorHistory) {
    if (!sensorHistory || sensorHistory.length === 0) return;

    const labels = sensorHistory.map(d => {
        const t = d.recorded_at || '';
        return t.length >= 16 ? t.substring(11, 16) : t;
    });

    const humidityData = sensorHistory.map(d => d.soil_humidity);
    const tempData = sensorHistory.map(d => d.temperature);

    miniHumidityChart = renderMiniChart(
        'mini-humidity-chart', miniHumidityChart,
        labels, humidityData,
        'Soil %', '#43cea2', 'rgba(67,206,162,0.15)'
    );

    miniTempChart = renderMiniChart(
        'mini-temp-chart', miniTempChart,
        labels, tempData,
        'Temp °C', '#ef5350', 'rgba(239,83,80,0.12)'
    );
}

function renderMiniChart(canvasId, existing, labels, data, label, color, bgColor) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (existing) {
        existing.data.labels = labels;
        existing.data.datasets[0].data = data;
        existing.update();
        return existing;
    }

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label,
                data,
                borderColor: color,
                backgroundColor: bgColor,
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    display: true,
                    ticks: { maxTicksLimit: 5, font: { size: 10, family: 'Quicksand' } },
                    grid: { display: false }
                },
                y: {
                    display: true,
                    ticks: { maxTicksLimit: 4, font: { size: 10, family: 'Quicksand' } },
                    grid: { color: 'rgba(0,0,0,0.04)' }
                }
            }
        }
    });
}

// ==================== Water Events Table ====================

function renderWaterTable(events) {
    const tbody = document.querySelector('#notif-water-table tbody');
    if (!events || events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="empty-message">No recent events</td></tr>';
        return;
    }

    tbody.innerHTML = events.map(e => {
        const time = e.recorded_at ? e.recorded_at.substring(5, 16).replace('T', ' ') : '--';
        return `<tr>
            <td>${escapeHtml(time)}</td>
            <td>${e.duration_seconds}s</td>
            <td><span class="notif-trigger-badge">${escapeHtml(e.triggered_by)}</span></td>
        </tr>`;
    }).join('');
}

// ==================== Demo Mode Indicator ====================

function renderDemoIndicator(isDemo) {
    let badge = document.getElementById('demo-mode-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'demo-mode-badge';
        const panel = document.getElementById('data-panel');
        if (panel) panel.prepend(badge);
    }
    if (isDemo) {
        badge.innerHTML = '<span class="material-icons-outlined">science</span> Demo data — no Arduino connected';
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}
