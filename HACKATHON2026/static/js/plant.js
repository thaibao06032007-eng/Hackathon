let miniChart = null;
let threeScene = null;
let plantGroup = null;
let currentHealthScore = 100;

document.addEventListener('DOMContentLoaded', () => {
    loadPlantData();
    initThreeJS();

    document.getElementById('water-btn').addEventListener('click', waterPlant);
    document.getElementById('show-future').addEventListener('change', (e) => {
        updatePlant3D(e.target.checked);
    });

    // Auto-refresh every 15 seconds
    setInterval(loadPlantData, 15000);
});

async function loadPlantData() {
    try {
        const plant = await API.getPlant(PLANT_ID);
        updateUI(plant);

        const history = await API.getHistory(PLANT_ID, 24);
        updateMiniChart(history.sensor_data);
        updateLastWatered(history.water_events);
    } catch (error) {
        console.error('Error loading plant data:', error);
    }
}

function updateUI(plant) {
    document.getElementById('plant-name').textContent = plant.name;

    const health = plant.health || {};
    const data = plant.latest_data || {};

    // Health badge
    const badge = document.getElementById('health-badge');
    const statusClass = health.status || 'unknown';
    badge.className = `health-badge health-indicator ${statusClass}`;
    badge.innerHTML = `<span class="health-dot"></span> ${escapeHtml(health.label || 'No Data')}`;

    // Sensor values
    if (data.soil_humidity != null) {
        document.getElementById('humidity-value').textContent = `${data.soil_humidity.toFixed(1)}%`;
        const pct = Math.min(100, Math.max(0, data.soil_humidity));
        document.querySelector('#humidity-bar .sensor-bar-fill').style.width = `${pct}%`;
    }
    if (data.temperature != null) {
        document.getElementById('temp-value').textContent = `${data.temperature.toFixed(1)}\u00b0C`;
        const pct = Math.min(100, Math.max(0, ((data.temperature + 10) / 60) * 100));
        document.querySelector('#temp-bar .sensor-bar-fill').style.width = `${pct}%`;
    }
    if (data.light_level != null) {
        document.getElementById('light-value').textContent = `${data.light_level.toFixed(0)} lux`;
        const pct = Math.min(100, Math.max(0, (data.light_level / 1000) * 100));
        document.querySelector('#light-bar .sensor-bar-fill').style.width = `${pct}%`;
    }

    // Health score
    const scoreEl = document.getElementById('health-score');
    const labelEl = document.getElementById('health-label');
    const detailsEl = document.getElementById('health-details');

    if (health.score != null) {
        scoreEl.textContent = health.score;
        scoreEl.style.color = health.color;
        labelEl.textContent = health.label;
        labelEl.style.color = health.color;
        currentHealthScore = health.score;
    }

    if (health.details && health.details.length > 0) {
        detailsEl.innerHTML = health.details.map(d =>
            `<li>\u26a0 ${escapeHtml(d)}</li>`
        ).join('');
    } else if (health.status === 'healthy') {
        detailsEl.innerHTML = '<li style="color: var(--success);">\u2714 All conditions are optimal!</li>';
    } else {
        detailsEl.innerHTML = '';
    }

    // Update 3D plant based on health
    if (plantGroup && health.score != null) {
        updatePlant3DHealth(health.score);
    }
}

function updateMiniChart(sensorData) {
    const ctx = document.getElementById('mini-chart').getContext('2d');

    const labels = sensorData.map(d => formatTime(d.recorded_at));
    const humidity = sensorData.map(d => d.soil_humidity);
    const temperature = sensorData.map(d => d.temperature);
    const light = sensorData.map(d => d.light_level);

    if (miniChart) {
        miniChart.data.labels = labels;
        miniChart.data.datasets[0].data = humidity;
        miniChart.data.datasets[1].data = temperature;
        miniChart.data.datasets[2].data = light;
        miniChart.update();
        return;
    }

    miniChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Soil Humidity (%)',
                    data: humidity,
                    borderColor: '#0288d1',
                    backgroundColor: 'rgba(2, 136, 209, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Temperature (\u00b0C)',
                    data: temperature,
                    borderColor: '#e63946',
                    backgroundColor: 'rgba(230, 57, 70, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 0
                },
                {
                    label: 'Light (lux)',
                    data: light,
                    borderColor: '#f4a261',
                    backgroundColor: 'rgba(244, 162, 97, 0.1)',
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y2',
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
            },
            scales: {
                x: { display: false },
                y: { position: 'left', title: { display: true, text: '% / \u00b0C', font: { size: 11 } } },
                y2: { position: 'right', title: { display: true, text: 'lux', font: { size: 11 } }, grid: { drawOnChartArea: false } }
            }
        }
    });
}

function updateLastWatered(waterEvents) {
    const el = document.getElementById('last-watered-time');
    if (waterEvents && waterEvents.length > 0) {
        el.textContent = formatDateTime(waterEvents[0].recorded_at);
    } else {
        el.textContent = 'Never';
    }
}

async function waterPlant() {
    const btn = document.getElementById('water-btn');
    const status = document.getElementById('water-status');

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-outlined">hourglass_empty</span> Watering...';
    status.textContent = '';

    try {
        const result = await API.waterPlant(PLANT_ID);
        status.textContent = result.message;
        status.style.background = 'var(--success-light)';
        status.style.color = 'var(--success)';
    } catch (error) {
        status.textContent = error.message;
        status.style.background = 'var(--danger-light)';
        status.style.color = 'var(--danger)';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons-outlined">water</span> Water Plant';
        setTimeout(() => {
            status.textContent = '';
            status.style.background = '';
        }, 5000);
    }
}

// ==================== Three.js 3D Plant ====================

function initThreeJS() {
    const container = document.getElementById('plant-3d');
    if (!container || typeof THREE === 'undefined') return;

    const width = container.clientWidth;
    const height = container.clientHeight || 250;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7f5);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 5);
    scene.add(directional);

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshLambertMaterial({ color: 0x8B7355 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Pot
    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.4, 0.8, 16),
        new THREE.MeshLambertMaterial({ color: 0xb5651d })
    );
    pot.position.y = 0.4;
    scene.add(pot);

    // Soil in pot
    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16),
        new THREE.MeshLambertMaterial({ color: 0x4a3728 })
    );
    soil.position.y = 0.8;
    scene.add(soil);

    // Plant group
    plantGroup = new THREE.Group();
    plantGroup.position.y = 0.85;
    scene.add(plantGroup);

    buildPlant(1.0);

    threeScene = { scene, camera, renderer, container };

    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        if (plantGroup) {
            plantGroup.rotation.y += 0.005;
        }
        renderer.render(scene, camera);
    }
    animate();

    // Handle resize
    window.addEventListener('resize', () => {
        const w = container.clientWidth;
        const h = container.clientHeight || 250;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}

function buildPlant(scale) {
    if (!plantGroup) return;

    // Clear existing
    while (plantGroup.children.length) {
        const child = plantGroup.children[0];
        plantGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    const stemHeight = 1.5 * scale;
    const leafSize = 0.4 * scale;

    // Stem
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, stemHeight, 8),
        new THREE.MeshLambertMaterial({ color: 0x228B22 })
    );
    stem.position.y = stemHeight / 2;
    plantGroup.add(stem);

    // Leaves
    const leafGeom = new THREE.SphereGeometry(leafSize, 8, 8);
    leafGeom.scale(1, 0.3, 1);

    const leafPositions = [
        { y: stemHeight * 0.5, angle: 0 },
        { y: stemHeight * 0.6, angle: Math.PI * 0.5 },
        { y: stemHeight * 0.7, angle: Math.PI },
        { y: stemHeight * 0.8, angle: Math.PI * 1.5 },
        { y: stemHeight * 0.9, angle: Math.PI * 0.25 },
    ];

    leafPositions.forEach(pos => {
        const leaf = new THREE.Mesh(
            leafGeom.clone(),
            new THREE.MeshLambertMaterial({ color: 0x32CD32 })
        );
        leaf.position.set(
            Math.cos(pos.angle) * 0.3 * scale,
            pos.y,
            Math.sin(pos.angle) * 0.3 * scale
        );
        leaf.rotation.z = Math.cos(pos.angle) * 0.5;
        leaf.rotation.x = Math.sin(pos.angle) * 0.5;
        plantGroup.add(leaf);
    });

    // Top cluster
    const top = new THREE.Mesh(
        new THREE.SphereGeometry(leafSize * 1.2, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x32CD32 })
    );
    top.position.y = stemHeight + leafSize * 0.5;
    plantGroup.add(top);
}

function updatePlant3DHealth(score) {
    currentHealthScore = score;
    if (!plantGroup) return;

    const greenness = score / 100;

    plantGroup.children.forEach(child => {
        if (child.material && child.material.color) {
            // Only recolor leaves (spheres), not the stem (cylinder)
            if (child.geometry && child.geometry.type === 'SphereGeometry') {
                const r = Math.floor(139 * (1 - greenness) + 50 * greenness) / 255;
                const g = Math.floor(90 * (1 - greenness) + 205 * greenness) / 255;
                const b = Math.floor(43 * (1 - greenness) + 50 * greenness) / 255;
                child.material.color.setRGB(r, g, b);
            }
        }
    });
}

function updatePlant3D(showFuture) {
    if (showFuture) {
        buildPlant(1.5);
        updatePlant3DHealth(Math.min(100, currentHealthScore + 20));
    } else {
        buildPlant(1.0);
        updatePlant3DHealth(currentHealthScore);
    }
}
