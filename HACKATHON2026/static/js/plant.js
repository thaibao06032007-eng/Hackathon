let miniChart = null;
let threeScene = null;
let plantGroup = null;
let currentHealthScore = 100;
let displayedScore = 0;
let scoreAnimFrame = null;
let currentPlantScale = 1.0;
let targetPlantScale = 1.0;
let targetHealthForGrowth = null;
let currentPlantSpecies = '';
let currentTreeType = 'default';

// ==================== SPECIES MAPPING (matches AR view) ====================
const SPECIES_MAP = {
    'pine': 'pine', 'spruce': 'pine', 'fir': 'pine', 'conifer': 'pine', 'cypress': 'pine',
    'palm': 'palm', 'coconut': 'palm', 'tropical': 'palm', 'banana': 'palm',
    'oak': 'oak', 'maple': 'oak', 'elm': 'oak', 'beech': 'oak', 'birch': 'oak', 'willow': 'oak',
    'cherry': 'cherry', 'sakura': 'cherry', 'plum': 'cherry', 'blossom': 'cherry', 'peach': 'cherry',
    'cactus': 'cactus', 'succulent': 'cactus', 'aloe': 'cactus', 'agave': 'cactus',
    'rose': 'flower', 'lily': 'flower', 'orchid': 'flower', 'tulip': 'flower', 'daisy': 'flower', 'sunflower': 'flower', 'lavender': 'flower', 'jasmine': 'flower', 'flower': 'flower',
    'fern': 'fern', 'moss': 'fern', 'ivy': 'fern', 'vine': 'fern',
    'bamboo': 'bamboo', 'reed': 'bamboo', 'grass': 'bamboo',
};

function getTreeTypeForPlant(plant) {
    const text = ((plant.species || '') + ' ' + (plant.name || '')).toLowerCase();
    for (const [keyword, type] of Object.entries(SPECIES_MAP)) {
        if (text.includes(keyword)) return type;
    }
    return 'default';
}

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

    // Detect species and rebuild 3D model if type changed
    const newType = getTreeTypeForPlant(plant);
    if (newType !== currentTreeType) {
        currentTreeType = newType;
        currentPlantSpecies = plant.species || '';
        buildPlant(currentPlantScale);
    }

    // Health badge
    const badge = document.getElementById('health-badge');
    const statusClass = health.status || 'unknown';
    badge.className = `pd-hero-badge ${statusClass}`;
    badge.querySelector('.pd-badge-text').textContent = health.label || 'No Data';

    // Sensor values
    if (data.soil_humidity != null) {
        document.getElementById('humidity-value').textContent = `${data.soil_humidity.toFixed(1)}%`;
        const pct = Math.min(100, Math.max(0, data.soil_humidity));
        document.querySelector('#humidity-bar .pd-sensor-bar-fill').style.width = `${pct}%`;
    }
    if (data.temperature != null) {
        document.getElementById('temp-value').textContent = `${data.temperature.toFixed(1)}\u00b0C`;
        const pct = Math.min(100, Math.max(0, ((data.temperature + 10) / 60) * 100));
        document.querySelector('#temp-bar .pd-sensor-bar-fill').style.width = `${pct}%`;
    }
    if (data.air_humidity != null) {
        document.getElementById('air-humidity-value').textContent = `${data.air_humidity.toFixed(1)}%`;
        const pct = Math.min(100, Math.max(0, data.air_humidity));
        document.querySelector('#air-humidity-bar .pd-sensor-bar-fill').style.width = `${pct}%`;
    }

    // Health score — smooth animated counter + tree
    const scoreEl = document.getElementById('health-score');
    const labelEl = document.getElementById('health-label');
    const detailsEl = document.getElementById('health-details');

    if (health.score != null) {
        const targetScore = health.score;
        animateScore(scoreEl, displayedScore, targetScore, '#fff');
        labelEl.textContent = health.label;
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
    const height = container.clientHeight || 280;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f7f5);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.8, 4);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting (matches AR view)
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 1.2);
    directional.position.set(5, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(512, 512);
    scene.add(directional);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-3, 5, -3);
    scene.add(fillLight);

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Plant group
    plantGroup = new THREE.Group();
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
        const h = container.clientHeight || 280;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });
}

// ==================== SPECIES-SPECIFIC 3D BUILDERS (synced with AR view) ====================

function buildPlant(scale) {
    if (!plantGroup) return;

    // Clear existing
    while (plantGroup.children.length) {
        const child = plantGroup.children[0];
        plantGroup.remove(child);
        disposeMesh(child);
    }

    const BUILDERS = {
        'pine': buildPineTree,
        'palm': buildPalmTree,
        'oak': buildOakTree,
        'cherry': buildCherryBlossom,
        'cactus': buildCactus,
        'flower': buildFlowerPlant,
        'fern': buildFern,
        'bamboo': buildBamboo,
        'default': buildPottedPlant,
    };

    const builder = BUILDERS[currentTreeType] || BUILDERS['default'];
    const model = builder();
    model.scale.setScalar(scale);
    plantGroup.add(model);
}

function disposeMesh(obj) {
    if (obj.traverse) {
        obj.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
}

function buildPottedPlant() {
    const group = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xc67a4b, roughness: 0.85 });

    const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.4, 0.8, 16), potMat);
    potBody.position.y = 0.4;
    potBody.castShadow = true;
    group.add(potBody);

    const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.61, 0.05, 8, 16),
        new THREE.MeshStandardMaterial({ color: 0xb5694a, roughness: 0.7 })
    );
    rim.position.y = 0.8;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16),
        new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1.0 })
    );
    soil.position.y = 0.78;
    group.add(soil);

    const leafColors = [0x2e7d32, 0x388e3c, 0x43a047, 0x4caf50, 0x66bb6a];
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x33691e, roughness: 0.8 });
    const stemCount = 7;

    for (let i = 0; i < stemCount; i++) {
        const stemGroup = new THREE.Group();
        const angle = (i / stemCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const stemHeight = 0.6 + Math.random() * 0.7;
        const lean = 0.15 + Math.random() * 0.25;

        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.035, stemHeight, 6),
            stemMat
        );
        stem.position.y = stemHeight / 2;
        stem.castShadow = true;
        stemGroup.add(stem);

        const leafSize = 0.18 + Math.random() * 0.12;
        const leaf = new THREE.Mesh(
            new THREE.SphereGeometry(leafSize, 8, 6),
            new THREE.MeshStandardMaterial({ color: leafColors[i % leafColors.length], roughness: 0.6, metalness: 0.05 })
        );
        leaf.scale.set(1, 0.4, 1.8);
        leaf.position.y = stemHeight + leafSize * 0.2;
        leaf.castShadow = true;
        stemGroup.add(leaf);

        if (i % 2 === 0) {
            const leaf2 = new THREE.Mesh(
                new THREE.SphereGeometry(leafSize * 0.7, 8, 6),
                new THREE.MeshStandardMaterial({ color: leafColors[(i + 2) % leafColors.length], roughness: 0.6 })
            );
            leaf2.scale.set(1, 0.35, 1.6);
            leaf2.position.y = stemHeight * 0.65;
            leaf2.position.x = 0.08;
            leaf2.rotation.z = 0.3;
            leaf2.castShadow = true;
            stemGroup.add(leaf2);
        }

        stemGroup.position.y = 0.82;
        stemGroup.position.x = Math.cos(angle) * 0.15;
        stemGroup.position.z = Math.sin(angle) * 0.15;
        stemGroup.rotation.x = Math.cos(angle) * lean;
        stemGroup.rotation.z = -Math.sin(angle) * lean;
        group.add(stemGroup);
    }
    return group;
}

function buildPineTree() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.16, 2.0, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 })
    );
    trunk.position.y = 1.0;
    trunk.castShadow = true;
    group.add(trunk);

    const pine = new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
        const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.8 - i * 0.12, 0.8, 8),
            pine
        );
        cone.position.y = 1.4 + i * 0.44;
        cone.castShadow = true;
        group.add(cone);
    }
    return group;
}

function buildPalmTree() {
    const group = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
    const segments = 8;
    let curveX = 0;
    for (let i = 0; i < segments; i++) {
        const seg = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12 - i * 0.01, 0.14 - i * 0.01, 0.36, 8),
            trunkMat
        );
        curveX += Math.sin(i * 0.15) * 0.04;
        seg.position.set(curveX, 0.18 + i * 0.34, 0);
        seg.rotation.z = Math.sin(i * 0.2) * 0.05;
        seg.castShadow = true;
        group.add(seg);
    }

    const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7, side: THREE.DoubleSide });
    const topY = 0.18 + segments * 0.34;
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const frondShape = new THREE.Shape();
        frondShape.moveTo(0, 0);
        frondShape.quadraticCurveTo(0.3, 0.6, 0.04, 1.4);
        frondShape.lineTo(-0.04, 1.4);
        frondShape.quadraticCurveTo(-0.3, 0.6, 0, 0);

        const frond = new THREE.Mesh(new THREE.ShapeGeometry(frondShape, 8), frondMat);
        frond.position.set(curveX, topY, 0);
        frond.rotation.set(-0.5, angle, Math.PI * 0.1);
        frond.castShadow = true;
        group.add(frond);
    }

    const cocoMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const coco = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), cocoMat);
        coco.position.set(curveX + Math.cos(a) * 0.12, topY - 0.1, Math.sin(a) * 0.12);
        group.add(coco);
    }
    return group;
}

function buildOakTree() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.28, 1.4, 10),
        new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.95 })
    );
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    group.add(trunk);

    const branchMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + 0.3;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.7, 6), branchMat);
        branch.position.set(Math.cos(angle) * 0.24, 1.2, Math.sin(angle) * 0.24);
        branch.rotation.set(Math.sin(angle) * 0.6, 0, Math.cos(angle) * 0.6);
        branch.castShadow = true;
        group.add(branch);
    }

    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x33691e, roughness: 0.8 });
    const canopyPositions = [
        [0, 1.9, 0, 0.7], [-0.3, 1.7, 0.2, 0.5], [0.3, 1.8, -0.2, 0.56],
        [0.1, 2.2, 0.1, 0.44], [-0.2, 2.0, -0.24, 0.4],
    ];
    canopyPositions.forEach(([x, y, z, r]) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), canopyMat);
        s.position.set(x, y, z);
        s.castShadow = true;
        group.add(s);
    });
    return group;
}

function buildCherryBlossom() {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.18, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.9 })
    );
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    group.add(trunk);

    const branchMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.8, 6), branchMat);
        b.position.set(Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2);
        b.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
        b.castShadow = true;
        group.add(b);
    }

    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xf8bbd0, roughness: 0.6 });
    const darkPink = new THREE.MeshStandardMaterial({ color: 0xf48fb1, roughness: 0.6 });
    const positions = [
        [0, 1.9, 0, 0.56], [-0.36, 1.7, 0.24, 0.4], [0.3, 1.76, -0.2, 0.44],
        [0.16, 2.1, 0.2, 0.36], [-0.24, 2.0, -0.16, 0.32],
    ];
    positions.forEach(([x, y, z, r], i) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), i % 2 === 0 ? pinkMat : darkPink);
        s.position.set(x, y, z);
        s.castShadow = true;
        group.add(s);
    });
    return group;
}

function buildCactus() {
    const group = new THREE.Group();
    const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });

    const potMat = new THREE.MeshStandardMaterial({ color: 0xbf360c, roughness: 0.8 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.5, 12), potMat);
    pot.position.y = 0.25;
    group.add(pot);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 1.2, 12), cactusMat);
    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);

    const top = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), cactusMat);
    top.position.y = 1.7;
    top.scale.y = 0.5;
    group.add(top);

    const armPositions = [[0.25, 1.0, 0, 0.6], [-0.25, 0.8, 0, 0.5]];
    armPositions.forEach(([x, y, z, h]) => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8), cactusMat);
        arm.position.set(x * 2.5, y, z);
        arm.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2;
        arm.castShadow = true;
        group.add(arm);

        const up = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, h, 8), cactusMat);
        up.position.set(x * 3.5, y + h / 2, z);
        up.castShadow = true;
        group.add(up);

        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), cactusMat);
        cap.position.set(x * 3.5, y + h, z);
        cap.scale.y = 0.5;
        group.add(cap);
    });
    return group;
}

function buildFlowerPlant() {
    const group = new THREE.Group();

    const pot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.4, 0.5, 12),
        new THREE.MeshStandardMaterial({ color: 0xbf360c, roughness: 0.8 })
    );
    pot.position.y = 0.25;
    group.add(pot);

    const soil = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.08, 12),
        new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1 })
    );
    soil.position.y = 0.5;
    group.add(soil);

    const flowerColors = [0xe91e63, 0xf44336, 0xff9800, 0x9c27b0, 0xffeb3b];
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const stemH = 1.0 + Math.random() * 0.6;

        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.04, stemH, 6),
            new THREE.MeshStandardMaterial({ color: 0x388e3c })
        );
        const sx = Math.cos(angle) * 0.18;
        const sz = Math.sin(angle) * 0.18;
        stem.position.set(sx, 0.5 + stemH / 2, sz);
        stem.rotation.set(Math.sin(angle) * 0.15, 0, Math.cos(angle) * 0.15);
        stem.castShadow = true;
        group.add(stem);

        const petalMat = new THREE.MeshStandardMaterial({ color: flowerColors[i], roughness: 0.5 });
        const flowerY = 0.5 + stemH;
        for (let p = 0; p < 5; p++) {
            const pa = (p / 5) * Math.PI * 2;
            const petal = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), petalMat);
            petal.position.set(sx + Math.cos(pa) * 0.08, flowerY, sz + Math.sin(pa) * 0.08);
            petal.scale.set(1, 0.4, 1);
            group.add(petal);
        }
        const center = new THREE.Mesh(
            new THREE.SphereGeometry(0.05, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xffeb3b })
        );
        center.position.set(sx, flowerY + 0.03, sz);
        group.add(center);
    }

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x43a047, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.5;
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), leafMat);
        leaf.position.set(Math.cos(a) * 0.28, 0.55, Math.sin(a) * 0.28);
        leaf.scale.set(1, 0.15, 0.6);
        leaf.rotation.y = a;
        group.add(leaf);
    }
    return group;
}

function buildFern() {
    const group = new THREE.Group();
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.7, side: THREE.DoubleSide });

    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const frondLen = 1.0 + Math.random() * 0.4;

        const spineGeo = new THREE.CylinderGeometry(0.02, 0.03, frondLen, 4);
        const spine = new THREE.Mesh(spineGeo, new THREE.MeshStandardMaterial({ color: 0x2e7d32 }));
        spine.position.set(0, frondLen * 0.3, 0);
        spine.rotation.set(-0.6 + Math.random() * 0.2, angle, 0);

        const frondGroup = new THREE.Group();
        frondGroup.add(spine);

        for (let j = 0; j < 6; j++) {
            const t = (j + 1) / 7;
            const leafSize = 0.12 * (1 - t * 0.5);
            for (let side = -1; side <= 1; side += 2) {
                const leaflet = new THREE.Mesh(new THREE.SphereGeometry(leafSize, 6, 4), leafMat);
                leaflet.scale.set(1, 0.2, 0.8);
                leaflet.position.set(side * leafSize * 0.8, t * frondLen * 0.5, 0);
                spine.add(leaflet);
            }
        }
        frondGroup.castShadow = true;
        group.add(frondGroup);
    }
    return group;
}

function buildBamboo() {
    const group = new THREE.Group();
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x7cb342, roughness: 0.6 });
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x558b2f, roughness: 0.7 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x33691e, roughness: 0.7, side: THREE.DoubleSide });

    for (let s = 0; s < 4; s++) {
        const sx = (Math.random() - 0.5) * 0.6;
        const sz = (Math.random() - 0.5) * 0.6;
        const height = 2.0 + Math.random() * 1.0;
        const segments = Math.floor(height / 0.4);

        for (let i = 0; i < segments; i++) {
            const segH = height / segments;
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, segH, 8), stalkMat);
            seg.position.set(sx, segH / 2 + i * segH, sz);
            seg.castShadow = true;
            group.add(seg);

            const node = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.01, 6, 12), nodeMat);
            node.position.set(sx, (i + 1) * segH, sz);
            node.rotation.x = Math.PI / 2;
            group.add(node);

            if (i > segments * 0.4 && Math.random() > 0.3) {
                for (let l = 0; l < 2; l++) {
                    const la = Math.random() * Math.PI * 2;
                    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.08), leafMat);
                    leaf.position.set(sx + Math.cos(la) * 0.15, (i + 1) * segH, sz + Math.sin(la) * 0.15);
                    leaf.rotation.set(0.3, la, 0.2);
                    group.add(leaf);
                }
            }
        }
    }
    return group;
}

function updatePlant3DHealth(score) {
    currentHealthScore = score;
    if (!plantGroup) return;

    const greenness = score / 100;

    plantGroup.traverse(child => {
        if (child.material && child.material.color && child.geometry) {
            const geoType = child.geometry.type;
            // Recolor foliage (spheres, cones, shapes, planes) but not trunks/pots
            if (geoType === 'SphereGeometry' || geoType === 'ConeGeometry' ||
                geoType === 'ShapeGeometry' || geoType === 'PlaneGeometry') {
                const baseColor = child.material.color.clone();
                // Shift toward brown when unhealthy
                const r = baseColor.r * (0.4 + 0.6 * greenness) + 0.55 * (1 - greenness);
                const g = baseColor.g * (0.3 + 0.7 * greenness) + 0.35 * (1 - greenness);
                const b = baseColor.b * (0.3 + 0.7 * greenness) + 0.17 * (1 - greenness);
                child.material.color.setRGB(
                    Math.min(1, r),
                    Math.min(1, g),
                    Math.min(1, b)
                );
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
