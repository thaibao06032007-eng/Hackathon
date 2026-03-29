let miniChart = null;
let threeScene = null;
let plantGroup = null;
let currentHealthScore = 100;
let displayedScore = 0;
let scoreAnimFrame = null;
let currentPlantScale = 1.0;
let targetPlantScale = 1.0;
let targetHealthForGrowth = null;

document.addEventListener('DOMContentLoaded', () => {
    loadPlantData();
    initThreeJS();

    document.getElementById('water-btn').addEventListener('click', waterPlant);
    document.getElementById('show-future').addEventListener('change', (e) => {
        updatePlant3D(e.target.checked);
    });
    document.getElementById('auto-water-toggle').addEventListener('change', toggleAutoWater);
    document.getElementById('water-duration').addEventListener('change', (e) => {
        const customInput = document.getElementById('custom-water-duration');
        if (e.target.value === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
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

        // Sync auto-water toggle with actual ESP32 state
        try {
            const resp = await fetch(`/api/plants/${PLANT_ID}/esp-status`);
            if (resp.ok) {
                const espStatus = await resp.json();
                const toggle = document.getElementById('auto-water-toggle');
                const statusEl = document.getElementById('auto-water-status');
                toggle.checked = espStatus.auto_water;
                statusEl.textContent = espStatus.auto_water ? 'ON' : 'OFF';
                statusEl.style.color = espStatus.auto_water ? 'var(--success)' : 'var(--danger)';
            }
        } catch (e) { /* ESP32 unreachable, leave toggle as-is */ }
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
    if (data.air_humidity != null) {
        document.getElementById('air-humidity-value').textContent = `${data.air_humidity.toFixed(1)}%`;
        const pct = Math.min(100, Math.max(0, data.air_humidity));
        document.querySelector('#air-humidity-bar .sensor-bar-fill').style.width = `${pct}%`;
    }

    // Health score — smooth animated counter + tree
    const scoreEl = document.getElementById('health-score');
    const labelEl = document.getElementById('health-label');
    const detailsEl = document.getElementById('health-details');

    if (health.score != null) {
        const targetScore = health.score;
        animateScore(scoreEl, displayedScore, targetScore, health.color);
        labelEl.textContent = health.label;
        labelEl.style.color = health.color;
        currentHealthScore = targetScore;
        updateHealthTree(targetScore);
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

function animateScore(el, from, to, color) {
    if (scoreAnimFrame) cancelAnimationFrame(scoreAnimFrame);
    const duration = 800;
    const start = performance.now();
    el.style.color = color;
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad
        const current = Math.round(from + (to - from) * ease);
        el.textContent = current;
        displayedScore = current;
        if (t < 1) {
            scoreAnimFrame = requestAnimationFrame(step);
        } else {
            displayedScore = to;
        }
    }
    scoreAnimFrame = requestAnimationFrame(step);
}

function updateHealthTree(score) {
    const pct = score / 100;

    function lerpColor(deadR, deadG, deadB, liveR, liveG, liveB, t) {
        const r = Math.round(deadR + (liveR - deadR) * t);
        const g = Math.round(deadG + (liveG - deadG) * t);
        const b = Math.round(deadB + (liveB - deadB) * t);
        return `rgb(${r},${g},${b})`;
    }

    const c3 = document.getElementById('tree-canopy-3');
    const c2 = document.getElementById('tree-canopy-2');
    const c1 = document.getElementById('tree-canopy-1');
    const trunk = document.getElementById('tree-trunk');
    const leaves = document.getElementById('falling-leaves');
    const svg = document.getElementById('health-tree');

    // Canopy color: dead brown → lush green (wider contrast)
    if (c3) c3.setAttribute('fill', lerpColor(120, 80, 10, 30, 120, 70, pct));
    if (c2) c2.setAttribute('fill', lerpColor(140, 95, 20, 50, 160, 100, pct));
    if (c1) c1.setAttribute('fill', lerpColor(160, 110, 30, 70, 200, 130, pct));

    // Trunk darkens when healthy
    if (trunk) trunk.setAttribute('fill', lerpColor(160, 130, 60, 110, 85, 16, pct));

    // Canopy shrinks dramatically when unhealthy
    if (c3) { c3.setAttribute('rx', 30 + 45 * pct); c3.setAttribute('ry', 15 + 25 * pct); }
    if (c2) { c2.setAttribute('rx', 22 + 38 * pct); c2.setAttribute('ry', 12 + 21 * pct); }
    if (c1) { c1.setAttribute('rx', 15 + 27 * pct); c1.setAttribute('ry', 10 + 17 * pct); }

    // Canopy opacity fades when dying
    if (c3) c3.setAttribute('opacity', 0.4 + 0.5 * pct);
    if (c2) c2.setAttribute('opacity', 0.4 + 0.5 * pct);
    if (c1) c1.setAttribute('opacity', 0.5 + 0.45 * pct);

    // Show falling leaves when score < 60
    if (leaves) leaves.style.display = score < 60 ? 'block' : 'none';

    // Desaturate + darken when critical
    if (svg) {
        if (score < 40) {
            svg.style.filter = `saturate(${0.2 + pct * 0.8}) brightness(${0.7 + pct * 0.3})`;
        } else {
            svg.style.filter = '';
        }
    }
}

function updateMiniChart(sensorData) {
    const ctx = document.getElementById('mini-chart').getContext('2d');

    const labels = sensorData.map(d => formatTime(d.recorded_at));
    const humidity = sensorData.map(d => d.soil_humidity);
    const temperature = sensorData.map(d => d.temperature);

    if (miniChart) {
        miniChart.data.labels = labels;
        miniChart.data.datasets[0].data = humidity;
        miniChart.data.datasets[1].data = temperature;
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
                y: { position: 'left', title: { display: true, text: '% / \u00b0C', font: { size: 11 } } }
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
    const select = document.getElementById('water-duration');
    let duration;
    if (select.value === 'custom') {
        duration = parseInt(document.getElementById('custom-water-duration').value);
        if (!duration || duration < 1 || duration > 3600) {
            status.textContent = 'Enter a custom duration between 1 and 3600 seconds';
            status.style.background = 'var(--danger-light)';
            status.style.color = 'var(--danger)';
            return;
        }
    } else {
        duration = parseInt(select.value);
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-outlined">hourglass_empty</span> Watering...';
    status.textContent = '';

    try {
        const result = await API.waterPlant(PLANT_ID, duration);
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

async function toggleAutoWater() {
    const toggle = document.getElementById('auto-water-toggle');
    const statusEl = document.getElementById('auto-water-status');
    const enabled = toggle.checked;

    try {
        const plant = await API.getPlant(PLANT_ID);
        const ip = plant.esp32_ip;
        if (!ip) throw new Error('No ESP32 IP configured');

        const resp = await fetch(`/api/plants/${PLANT_ID}/auto-water`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: 'Failed' }));
            throw new Error(err.error || 'Failed');
        }
        statusEl.textContent = enabled ? 'ON' : 'OFF';
        statusEl.style.color = enabled ? 'var(--success)' : 'var(--danger)';
    } catch (error) {
        // Revert toggle on failure
        toggle.checked = !enabled;
        alert('Failed to toggle auto-water: ' + error.message);
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

            // Smooth growth animation
            if (Math.abs(currentPlantScale - targetPlantScale) > 0.005) {
                currentPlantScale += (targetPlantScale - currentPlantScale) * 0.03;
                buildPlant(currentPlantScale);
                if (targetHealthForGrowth != null) {
                    const t = (currentPlantScale - 1.0) / (targetPlantScale - 1.0 || 1);
                    const blendedScore = currentHealthScore + (targetHealthForGrowth - currentHealthScore) * Math.max(0, Math.min(1, t));
                    updatePlant3DHealth(blendedScore);
                }
            }
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
        targetPlantScale = 1.5;
        targetHealthForGrowth = Math.min(100, currentHealthScore + 20);
    } else {
        targetPlantScale = 1.0;
        targetHealthForGrowth = currentHealthScore;
    }
}
