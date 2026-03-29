let arStream = null;
let arScene = null;
let arRenderer = null;
let arCamera = null;
let arPlantGroup = null;

document.addEventListener('DOMContentLoaded', () => {
    loadARPlants();

    document.getElementById('ar-start-btn').addEventListener('click', toggleCamera);
    document.getElementById('ar-plant-select').addEventListener('change', loadARPlantData);
});

async function loadARPlants() {
    try {
        const plants = await API.getPlants();
        const select = document.getElementById('ar-plant-select');
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

async function toggleCamera() {
    const btn = document.getElementById('ar-start-btn');
    const video = document.getElementById('ar-video');

    if (arStream) {
        // Stop camera
        arStream.getTracks().forEach(track => track.stop());
        arStream = null;
        video.srcObject = null;
        btn.innerHTML = '<span class="material-icons-outlined">videocam</span> Start Camera';
        return;
    }

    try {
        arStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 960 }
            }
        });
        video.srcObject = arStream;
        btn.innerHTML = '<span class="material-icons-outlined">videocam_off</span> Stop Camera';
        initAROverlay();
    } catch (error) {
        alert('Could not access camera: ' + error.message);
    }
}

async function loadARPlantData() {
    const plantId = document.getElementById('ar-plant-select').value;
    const infoPanel = document.getElementById('ar-info');

    if (!plantId) {
        infoPanel.classList.add('hidden');
        return;
    }

    try {
        const plant = await API.getPlant(plantId);
        const health = plant.health || {};
        const data = plant.latest_data || {};

        document.getElementById('ar-plant-name').textContent = plant.name;

        const healthEl = document.getElementById('ar-plant-health');
        const statusClass = health.status || 'unknown';
        healthEl.innerHTML = `
            <span class="health-indicator ${statusClass}">
                <span class="health-dot"></span>
                ${escapeHtml(health.label || 'No Data')}
            </span>
        `;

        const dataEl = document.getElementById('ar-plant-data');
        dataEl.innerHTML = `
            <div><span>Humidity:</span> <strong>${data.soil_humidity != null ? data.soil_humidity.toFixed(1) + '%' : '--'}</strong></div>
            <div><span>Temperature:</span> <strong>${data.temperature != null ? data.temperature.toFixed(1) + '\u00b0C' : '--'}</strong></div>
            <div><span>Light:</span> <strong>${data.light_level != null ? data.light_level.toFixed(0) + ' lux' : '--'}</strong></div>
        `;

        infoPanel.classList.remove('hidden');

        // Update 3D overlay
        if (arScene) {
            updateARPlant(health.score || 50);
        }
    } catch (error) {
        console.error('Error loading plant data:', error);
    }
}

function initAROverlay() {
    const canvas = document.getElementById('ar-overlay');
    if (!canvas || typeof THREE === 'undefined') return;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    arScene = new THREE.Scene();
    arCamera = new THREE.PerspectiveCamera(45, canvas.width / canvas.height, 0.1, 100);
    arCamera.position.set(0, 2, 5);
    arCamera.lookAt(0, 1, 0);

    arRenderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    arRenderer.setSize(canvas.width, canvas.height);
    arRenderer.setClearColor(0x000000, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    arScene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(3, 5, 3);
    arScene.add(directional);

    // Placeholder plant
    arPlantGroup = new THREE.Group();
    arScene.add(arPlantGroup);
    buildARPlant(1.0);

    function animate() {
        requestAnimationFrame(animate);
        if (arPlantGroup) {
            arPlantGroup.rotation.y += 0.01;
        }
        arRenderer.render(arScene, arCamera);
    }
    animate();
}

function buildARPlant(scale) {
    if (!arPlantGroup) return;

    while (arPlantGroup.children.length) {
        const child = arPlantGroup.children[0];
        arPlantGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    const stemHeight = 2.0 * scale;

    // Stem
    const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, stemHeight, 8),
        new THREE.MeshLambertMaterial({ color: 0x228B22 })
    );
    stem.position.y = stemHeight / 2;
    arPlantGroup.add(stem);

    // Leaves
    const leafGeom = new THREE.SphereGeometry(0.3 * scale, 8, 8);
    leafGeom.scale(1, 0.3, 1);

    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const y = stemHeight * (0.4 + i * 0.1);
        const leaf = new THREE.Mesh(
            leafGeom.clone(),
            new THREE.MeshLambertMaterial({ color: 0x32CD32, transparent: true, opacity: 0.9 })
        );
        leaf.position.set(Math.cos(angle) * 0.3, y, Math.sin(angle) * 0.3);
        leaf.rotation.z = Math.cos(angle) * 0.4;
        leaf.rotation.x = Math.sin(angle) * 0.4;
        arPlantGroup.add(leaf);
    }

    // Top cluster
    const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 * scale, 8, 8),
        new THREE.MeshLambertMaterial({ color: 0x32CD32, transparent: true, opacity: 0.9 })
    );
    top.position.y = stemHeight + 0.2;
    arPlantGroup.add(top);
}

function updateARPlant(score) {
    const scale = 0.5 + (score / 100) * 0.7;
    buildARPlant(scale);
}
