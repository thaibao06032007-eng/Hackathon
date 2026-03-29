// ==================== Weather Code Mapping ====================
const WEATHER_ICONS = {
    0: { icon: 'wb_sunny', label: 'Clear sky' },
    1: { icon: 'wb_sunny', label: 'Mainly clear' },
    2: { icon: 'cloud', label: 'Partly cloudy' },
    3: { icon: 'cloud', label: 'Overcast' },
    45: { icon: 'foggy', label: 'Fog' },
    48: { icon: 'foggy', label: 'Rime fog' },
    51: { icon: 'grain', label: 'Light drizzle' },
    53: { icon: 'grain', label: 'Drizzle' },
    55: { icon: 'grain', label: 'Dense drizzle' },
    61: { icon: 'water_drop', label: 'Light rain' },
    63: { icon: 'water_drop', label: 'Rain' },
    65: { icon: 'water_drop', label: 'Heavy rain' },
    71: { icon: 'ac_unit', label: 'Light snow' },
    73: { icon: 'ac_unit', label: 'Snow' },
    75: { icon: 'ac_unit', label: 'Heavy snow' },
    80: { icon: 'thunderstorm', label: 'Rain showers' },
    81: { icon: 'thunderstorm', label: 'Heavy showers' },
    82: { icon: 'thunderstorm', label: 'Violent showers' },
    95: { icon: 'thunderstorm', label: 'Thunderstorm' },
    96: { icon: 'thunderstorm', label: 'Thunderstorm + hail' },
    99: { icon: 'thunderstorm', label: 'Thunderstorm + heavy hail' }
};

function getWeatherInfo(code) {
    return WEATHER_ICONS[code] || { icon: 'help_outline', label: 'Unknown' };
}

function getDayName(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (d - today) / (1000 * 60 * 60 * 24);
    if (diff < 1 && diff >= 0) return 'Today';
    if (diff < 2 && diff >= 1) return 'Tomorrow';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function getWaterAmountClass(amount) {
    switch (amount) {
        case 'extra': return 'water-extra';
        case 'light': return 'water-light';
        case 'normal': return 'water-normal';
        default: return 'water-none';
    }
}

function getWaterAmountLabel(shouldWater, amount) {
    if (!shouldWater) return 'Skip';
    switch (amount) {
        case 'extra': return 'Extra';
        case 'light': return 'Light';
        default: return 'Normal';
    }
}

function toggleCareDesc(btn) {
    const desc = btn.closest('.care-desc');
    const short = desc.querySelector('.care-desc-short');
    const full = desc.querySelector('.care-desc-full');
    const expanded = full.style.display !== 'none';
    short.style.display = expanded ? '' : 'none';
    full.style.display = expanded ? 'none' : '';
    btn.textContent = expanded ? 'Read more' : 'Show less';
}

// ==================== State ======================================
let selectedPlantId = null;
let allPlants = [];
let careCache = {};

// ==================== Plant Selector ====================

async function loadPlantTabs() {
    try {
        allPlants = await API.getPlants();
        const container = document.getElementById('plant-tabs');

        if (!allPlants || allPlants.length === 0) {
            container.innerHTML = '<span class="no-plants">No plants found. Add plants in Settings first.</span>';
            return;
        }

        container.innerHTML = allPlants.map(p =>
            `<button class="plant-tab" data-id="${p.id}">
                <span class="material-icons-outlined">eco</span>
                <span>${escapeHtml(p.name)}</span>
                ${p.species ? `<small>${escapeHtml(p.species)}</small>` : ''}
            </button>`
        ).join('');

        container.querySelectorAll('.plant-tab').forEach(tab => {
            tab.addEventListener('click', () => selectPlant(parseInt(tab.dataset.id)));
        });

        // Auto-select first plant
        selectPlant(allPlants[0].id);
    } catch (err) {
        document.getElementById('plant-tabs').innerHTML =
            `<span class="no-plants">Error loading plants</span>`;
    }
}

async function selectPlant(plantId) {
    selectedPlantId = plantId;

    // Update tab active state
    document.querySelectorAll('.plant-tab').forEach(t => {
        t.classList.toggle('active', parseInt(t.dataset.id) === plantId);
    });

    // Load care info
    await loadPlantCare(plantId);

    // Reload forecast for this plant
    await loadForecast();
}

async function loadPlantCare(plantId) {
    const container = document.getElementById('plant-care-info');

    if (careCache[plantId]) {
        renderCareInfo(careCache[plantId]);
        return;
    }

    container.innerHTML = '<div class="card"><div class="loading">Loading plant care info...</div></div>';
    container.classList.remove('hidden');

    try {
        const care = await API.get(`/api/plant-care/${plantId}`);
        careCache[plantId] = care;
        renderCareInfo(care);
    } catch (err) {
        container.innerHTML = `<div class="card care-error">
            <span class="material-icons-outlined">info</span>
            <span>Could not find care data: ${escapeHtml(err.message)}</span>
        </div>`;
    }
}

function renderCareInfo(care) {
    const container = document.getElementById('plant-care-info');
    container.classList.remove('hidden');

    const sunlightText = Array.isArray(care.sunlight) ? care.sunlight.join(', ') : (care.sunlight || 'N/A');
    const waterBenchmark = care.watering_benchmark_value
        ? `Every ${care.watering_benchmark_value} ${care.watering_benchmark_unit}`
        : '';

    container.innerHTML = `
    <div class="card care-card">
        <div class="care-card-inner">
            ${care.image ? `<img src="${escapeHtml(care.image)}" class="care-image" alt="${escapeHtml(care.common_name)}">` : ''}
            <div class="care-details">
                <h3>${escapeHtml(care.common_name)}</h3>
                ${care.scientific_name && care.scientific_name.length ? `<p class="care-scientific">${escapeHtml(care.scientific_name[0])}</p>` : ''}
                <div class="care-tags">
                    <span class="care-tag"><span class="material-icons-outlined">opacity</span>${escapeHtml(care.watering || 'N/A')}${waterBenchmark ? ` (${escapeHtml(waterBenchmark)})` : ''}</span>
                    <span class="care-tag"><span class="material-icons-outlined">wb_sunny</span>${escapeHtml(sunlightText)}</span>
                    ${care.care_level ? `<span class="care-tag"><span class="material-icons-outlined">favorite</span>Care: ${escapeHtml(care.care_level)}</span>` : ''}
                    ${care.growth_rate ? `<span class="care-tag"><span class="material-icons-outlined">trending_up</span>Growth: ${escapeHtml(care.growth_rate)}</span>` : ''}
                    ${care.drought_tolerant ? `<span class="care-tag"><span class="material-icons-outlined">water_drop</span>Drought tolerant</span>` : ''}
                    ${care.indoor ? `<span class="care-tag"><span class="material-icons-outlined">home</span>Indoor</span>` : ''}
                </div>
                ${care.description ? `
                    <p class="care-desc">
                        <span class="care-desc-short">${escapeHtml(care.description).substring(0, 200)}${care.description.length > 200 ? '... ' : ''}</span>
                        ${care.description.length > 200 ? `<span class="care-desc-full" style="display:none">${escapeHtml(care.description)} </span>
                        <span class="care-read-more" onclick="toggleCareDesc(this)" role="button">Read more</span>` : ''}
                    </p>` : ''}
            </div>
        </div>
    </div>`;
}

// ==================== Render Weather & Plans ====================

function getUvLevel(uv) {
    if (uv == null) return { label: '--', cls: 'uv-unknown', icon: 'help_outline' };
    if (uv <= 2) return { label: 'Low', cls: 'uv-low', icon: 'sentiment_satisfied' };
    if (uv <= 5) return { label: 'Moderate', cls: 'uv-moderate', icon: 'wb_sunny' };
    if (uv <= 7) return { label: 'High', cls: 'uv-high', icon: 'wb_twilight' };
    if (uv <= 10) return { label: 'Very High', cls: 'uv-very-high', icon: 'local_fire_department' };
    return { label: 'Extreme', cls: 'uv-extreme', icon: 'whatshot' };
}

function getHeatLevel(temp) {
    if (temp == null) return { label: '', cls: '', icon: '' };
    if (temp >= 40) return { label: 'Extreme Heat', cls: 'heat-extreme', icon: 'whatshot' };
    if (temp >= 35) return { label: 'Very Hot', cls: 'heat-very-hot', icon: 'local_fire_department' };
    if (temp >= 30) return { label: 'Hot', cls: 'heat-hot', icon: 'wb_sunny' };
    return { label: '', cls: '', icon: '' };
}

function renderWeatherStrip(daily) {
    const strip = document.getElementById('weather-strip');
    const dates = daily.time || [];
    const tempMax = daily.temperature_2m_max || [];
    const tempMin = daily.temperature_2m_min || [];
    const precip = daily.precipitation_sum || [];
    const uv = daily.uv_index_max || [];
    const codes = daily.weathercode || [];

    let html = '';
    for (let i = 0; i < dates.length; i++) {
        const weather = getWeatherInfo(codes[i]);
        const uvInfo = getUvLevel(uv[i]);
        const heatInfo = getHeatLevel(tempMax[i]);
        const isToday = i === 0;
        const precipVal = precip[i] != null ? precip[i] : 0;

        html += `
        <div class="weather-day-card ${isToday ? 'weather-today' : ''}">
            <div class="weather-day-name">${escapeHtml(getDayName(dates[i]))}</div>
            <div class="weather-icon-wrap">
                <span class="material-icons-outlined weather-icon">${weather.icon}</span>
            </div>
            <div class="weather-desc">${escapeHtml(weather.label)}</div>
            <div class="weather-temps">
                <span class="temp-max">${tempMax[i] != null ? tempMax[i].toFixed(0) + '°' : '--'}</span>
                <span class="temp-divider">/</span>
                <span class="temp-min">${tempMin[i] != null ? tempMin[i].toFixed(0) + '°' : '--'}</span>
            </div>
            ${heatInfo.label ? `
            <div class="weather-badge ${heatInfo.cls}">
                <span class="material-icons-outlined">${heatInfo.icon}</span>
                ${heatInfo.label}
            </div>` : ''}
            <div class="weather-details-grid">
                <div class="weather-detail-item">
                    <span class="material-icons-outlined rain-icon">water_drop</span>
                    <span class="detail-value">${precipVal.toFixed(1)}</span>
                    <span class="detail-unit">mm</span>
                </div>
                <div class="weather-detail-item">
                    <div class="uv-badge ${uvInfo.cls}">
                        <span class="material-icons-outlined">${uvInfo.icon}</span>
                        <span>UV ${uv[i] != null ? uv[i].toFixed(0) : '--'}</span>
                    </div>
                    <span class="uv-label">${uvInfo.label}</span>
                </div>
            </div>
        </div>`;
    }
    strip.innerHTML = html;
}

function renderWateringPlan(plan) {
    const container = document.getElementById('watering-plans');
    const section = document.getElementById('watering-section');
    if (!plan) {
        container.innerHTML = '';
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    const careInfo = plan.care_info || {};
    let html = `
    <div class="watering-plan-card">
        <div class="watering-plan-header">
            <div class="watering-plan-plant">
                <span class="material-icons-outlined watering-plant-icon">eco</span>
                <div>
                    <h3 class="watering-plant-name">${escapeHtml(plan.plant_name)}</h3>
                    ${plan.species ? `<span class="watering-plant-species">${escapeHtml(plan.species)}</span>` : ''}
                </div>
            </div>
            <div class="watering-care-badges">
                <span class="watering-badge watering-badge-blue">
                    <span class="material-icons-outlined">opacity</span>
                    ${escapeHtml(careInfo.watering_level || 'Average')}
                </span>
                <span class="watering-badge watering-badge-green">
                    <span class="material-icons-outlined">schedule</span>
                    Every ${careInfo.watering_days || 3} Days
                </span>
            </div>
        </div>
        <div class="watering-schedule-grid">`;

    for (const day of plan.daily) {
        const amountClass = getWaterAmountClass(day.water_amount);
        const amountLabel = getWaterAmountLabel(day.should_water, day.water_amount);
        const weatherInfo = getWeatherInfo(day.weather.weather_code);
        const actionIcon = day.should_water ? 'water_drop' : 'do_not_disturb';

        html += `
            <div class="watering-day-card ${amountClass}">
                <div class="watering-day-header">
                    <span class="watering-day-name">${escapeHtml(getDayName(day.date))}</span>
                    <span class="watering-day-weather-icon material-icons-outlined">${weatherInfo.icon}</span>
                </div>
                <div class="watering-day-temps">
                    ${day.weather.temp_max != null ? day.weather.temp_max.toFixed(0) : '--'}° / ${day.weather.temp_min != null ? day.weather.temp_min.toFixed(0) : '--'}°
                </div>
                <div class="watering-day-action-wrap">
                    <span class="material-icons-outlined watering-action-icon">${actionIcon}</span>
                    <span class="watering-action-label">${amountLabel}</span>
                </div>
                ${day.should_water && day.suggested_duration > 0 ?
                    `<div class="watering-day-duration">
                        <span class="material-icons-outlined">timer</span>
                        ${day.suggested_duration}s
                    </div>` :
                    `<div class="watering-day-duration watering-day-skip">
                        <span class="material-icons-outlined">remove</span>
                        --
                    </div>`
                }
                <div class="watering-day-reasons">
                    ${day.reasons.map(r => `<span class="watering-reason">${escapeHtml(r)}</span>`).join('')}
                </div>
            </div>`;
    }

    html += `</div></div>`;
    container.innerHTML = html;
}

// ==================== Location Search ====================

let searchTimeout = null;
const locationInput = document.getElementById('location-input');
const dropdown = document.getElementById('location-dropdown');
const currentLocationLabel = document.getElementById('current-location');

locationInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = locationInput.value.trim();
    if (q.length < 2) {
        dropdown.classList.add('hidden');
        return;
    }
    searchTimeout = setTimeout(() => searchLocation(q), 300);
});

locationInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        const q = locationInput.value.trim();
        if (q.length >= 2) searchLocation(q);
    }
});

document.getElementById('btn-fetch-forecast').addEventListener('click', () => {
    clearTimeout(searchTimeout);
    const q = locationInput.value.trim();
    if (q.length >= 2) {
        searchLocation(q);
    } else {
        loadForecast();
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.location-search-wrapper') && !e.target.closest('#btn-fetch-forecast')) {
        dropdown.classList.add('hidden');
    }
});

async function searchLocation(query) {
    try {
        const data = await API.get(`/api/geocode?q=${encodeURIComponent(query)}`);
        const results = data.results || [];
        if (results.length === 0) {
            dropdown.innerHTML = '<div class="dropdown-item no-result">No results found</div>';
        } else {
            dropdown.innerHTML = results.map(r => {
                const label = [r.name, r.admin1, r.country].filter(Boolean).join(', ');
                return `<div class="dropdown-item" data-lat="${r.latitude}" data-lon="${r.longitude}" data-label="${escapeHtml(label)}">
                    <span class="material-icons-outlined">place</span>
                    <span>${escapeHtml(label)}</span>
                </div>`;
            }).join('');
        }
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.dropdown-item[data-lat]').forEach(item => {
            item.addEventListener('click', () => {
                document.getElementById('lat-input').value = item.dataset.lat;
                document.getElementById('lon-input').value = item.dataset.lon;
                currentLocationLabel.textContent = item.dataset.label;
                locationInput.value = '';
                dropdown.classList.add('hidden');
                // Save location for AR page
                try {
                    localStorage.setItem('plant_monitor_lat', item.dataset.lat);
                    localStorage.setItem('plant_monitor_lon', item.dataset.lon);
                    localStorage.setItem('plant_monitor_location_name', item.dataset.label);
                } catch (e) { /* localStorage unavailable */ }
                loadForecast();
            });
        });
    } catch (err) {
        dropdown.innerHTML = '<div class="dropdown-item no-result">Search error</div>';
        dropdown.classList.remove('hidden');
    }
}

// ==================== Main ====================

async function loadForecast() {
    const lat = document.getElementById('lat-input').value;
    const lon = document.getElementById('lon-input').value;

    document.getElementById('weather-strip').innerHTML = '<div class="loading">Loading weather...</div>';
    document.getElementById('watering-plans').innerHTML = '<div class="loading">Generating watering plan...</div>';

    try {
        const plantParam = selectedPlantId ? `&plant_id=${selectedPlantId}` : '';
        const data = await API.get(`/api/forecast?lat=${lat}&lon=${lon}${plantParam}`);
        renderWeatherStrip(data.weather_daily);

        // Show only the selected plant's plan
        const plan = data.watering_plans && data.watering_plans.length > 0 ? data.watering_plans[0] : null;
        renderWateringPlan(plan);
    } catch (err) {
        document.getElementById('weather-strip').innerHTML =
            `<div class="card" style="color:var(--danger);">Error: ${escapeHtml(err.message)}</div>`;
        document.getElementById('watering-plans').innerHTML = '';
    }
}

// Init
loadPlantTabs();
