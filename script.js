let isMuted = false;
// Persistent state for table and mute
function saveLastTable(table) {
    localStorage.setItem('lastTable', table);
}
function getLastTable() {
    return localStorage.getItem('lastTable') || 'maskew';
}
function saveMuteState(muted) {
    localStorage.setItem('isMuted', muted ? 'true' : 'false');
}
function getMuteState() {
    return localStorage.getItem('isMuted') === 'true';
}
let speechVolume = 1.0;
let useWeekendTimes = false;
let lastDepartureCheck = null;
let lastFiveMinuteCheck = null;
let globalIbtData = null;

// ===== Utilities =====
function normalizeTimeFormat(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getTimeStatus(timeStr) {
    if (!timeStr.includes(':')) return '';
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const diff = (target - now) / (1000 * 60);
    if (diff < -0.5) return 'past';
    if (diff <= 5) return 'time-five';
    if (diff <= 15) return 'time-fifteen';
    if (diff <= 30) return 'time-thirty';
    return '';
}

function showLoading(show) {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function updateTimestamp() {
    const now = new Date();
    const formatted = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) +
        ` on ${now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    document.querySelectorAll('.timestamp span').forEach(span => span.textContent = formatted);
}

// ===== Table Rendering =====
function createEmptyTimeGrid(locations) {
    const grid = {};
    locations.forEach(location => {
        grid[location] = {};
    });
    return grid;
}

function renderMatrixTable(bodyId, times, locations, grid) {
    const tableBody = document.getElementById(bodyId);
    tableBody.innerHTML = '';

    Array.from(times).sort((a, b) => {
        const timeA = new Date(`1970/01/01 ${a}`);
        const timeB = new Date(`1970/01/01 ${b}`);
        return timeA - timeB;
    }).forEach(time => {
        const row = document.createElement('tr');
        locations.forEach(location => {
            const cell = document.createElement('td');
            const value = grid[location][time];
            const timeStatus = getTimeStatus(time);
            cell.className = timeStatus;
            if (value) {
                cell.textContent = value.time;
            }
            row.appendChild(cell);
        });
        tableBody.appendChild(row);
    });
}

// ===== Announcements =====
function speakMessage(message) {
    if (isMuted) return;
    const activeSection = document.querySelector('.timetable-section.active');
    if (activeSection) {
        if (activeSection.id === 'maskew-section') {
            // Maskew: IBT = to Market Deeping, IBT TO WB = to Wisbech
            message = message
              .replace(/\bIBT TO WB\b/g, 'Inter Branch Transfer to Wisbech')
              .replace(/\bIBT\b/g, 'Inter Branch Transfer to Market Deeping');
        } else if (activeSection.id === 'market-section') {
            // Market: IBT = to Maskew Avenue
            message = message.replace(/\bIBT\b/g, 'Inter Branch Transfer to Maskew Avenue');
        } else if (activeSection.id === 'fengate-section') {
            // Wisbech: IBT TO HD = to Maskew Avenue
            message = message.replace(/\bIBT TO HD\b/g, 'Inter Branch Transfer to Maskew Avenue');
        }
    }
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.volume = speechVolume;
    window.speechSynthesis.speak(utterance);
}

function speakFiveMinMessage(message) {
    if (isMuted) return;
    const activeSection = document.querySelector('.timetable-section.active');
    if (activeSection) {
        if (activeSection.id === 'maskew-section') {
            message = message
              .replace(/\bIBT TO WB\b/g, 'Inter Branch Transfer to Wisbech')
              .replace(/\bIBT\b/g, 'Inter Branch Transfer to Market Deeping');
        } else if (activeSection.id === 'market-section') {
            message = message.replace(/\bIBT\b/g, 'Inter Branch Transfer to Maskew Avenue');
        } else if (activeSection.id === 'fengate-section') {
            message = message.replace(/\bIBT TO HD\b/g, 'Inter Branch Transfer to Maskew Avenue');
        }
    }
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.volume = speechVolume;
    utterance.onend = () => {
        setTimeout(() => {
            const secondUtterance = new SpeechSynthesisUtterance(message);
            secondUtterance.volume = speechVolume;
            window.speechSynthesis.speak(secondUtterance);
        }, 10000);
    };
    window.speechSynthesis.speak(utterance);
}

function showOverlay(mainText, detailText, isWarning = false) {
    const overlay = document.getElementById('departure-message');
    overlay.querySelector('.main-message').textContent = mainText;
    overlay.querySelector('.detail-message').textContent = detailText;
    overlay.classList.add('active');
    if (isWarning) overlay.classList.add('five-minute');
    setTimeout(() => overlay.classList.remove('active', 'five-minute'), 60000);
}

// ===== Checks =====
function checkDepartures(ibtData) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Build a string in "HH:mm" format
    const currentTimeStr = normalizeTimeFormat(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);

    // Only announce once per actual minute (per session)
    if (lastDepartureCheck === currentTimeStr) return;

    const isSaturday = useWeekendTimes;
    const departures = [];

    // Helper: Check if a time matches the current minute (treat "14:45" as matching any second in 14:45:00-14:45:59)
    function matchesCurrentMinute(timeStr) {
        if (!timeStr.includes(':')) return false;
        const [h, m] = timeStr.split(':').map(Number);
        return h === currentHour && m === currentMinute;
    }

    const checkTimes = (times, label) => {
        Object.values(times)
            .map(normalizeTimeFormat)
            .forEach(t => { if (matchesCurrentMinute(t)) departures.push(`${label} at ${t}`); });
    };

    checkTimes(isSaturday ? ibtData.maskew_avenue_saturday_times : ibtData.maskew_avenue_weekday_times, 'Maskew IBT');
    checkTimes(isSaturday ? ibtData.maskew_to_wisbech_saturday_times : ibtData.maskew_to_wisbech_weekday_times, 'Maskew IBT TO WB');
    checkTimes(isSaturday ? ibtData.market_deeping_saturday_times : ibtData.market_deeping_weekday_times, 'Market IBT');
    checkTimes(isSaturday ? ibtData.fengate_saturday_times : ibtData.fengate_weekday_times, 'Wisbech IBT TO HD');

    // Filter departures by active table
    const activeSection = document.querySelector('.timetable-section.active');
    let allowedLabels = [];
    if (activeSection) {
        if (activeSection.id === 'maskew-section') {
            allowedLabels = ['Maskew IBT', 'Maskew IBT TO WB'];
        } else if (activeSection.id === 'market-section') {
            allowedLabels = ['Market IBT'];
        } else if (activeSection.id === 'fengate-section') {
            allowedLabels = ['Wisbech IBT TO HD'];
        }
    }
    const filteredDepartures = departures.filter(dep =>
        allowedLabels.some(label => dep.startsWith(label))
    );
    if (filteredDepartures.length) {
        speakMessage(`Attention please. ${filteredDepartures.join(', ')} has now departed.`);
        showOverlay(filteredDepartures.length > 1 ? 'MULTIPLE VANS DEPARTED' : 'VAN DEPARTED', filteredDepartures.join(', '));
        lastDepartureCheck = currentTimeStr;
    }
}

function checkUpcomingDepartures(ibtData) {
    const now = new Date();
    const currentMinute = `${now.getHours()}:${now.getMinutes()}`;
    if (lastFiveMinuteCheck === currentMinute) return;

    const isSaturday = useWeekendTimes;
    const warnings = [];

    const checkTimes = (times, label) => {
        Object.values(times)
            .map(normalizeTimeFormat)
            .forEach(t => {
                if (!t.includes(':')) return;
                const [h, m] = t.split(':').map(Number);
                const depTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
                const diff = (depTime - now) / (1000 * 60);
                if (diff > 4.9 && diff < 5.1) warnings.push(`${label} at ${t}`);
            });
    };

    checkTimes(isSaturday ? ibtData.maskew_avenue_saturday_times : ibtData.maskew_avenue_weekday_times, 'Maskew IBT');
    checkTimes(isSaturday ? ibtData.maskew_to_wisbech_saturday_times : ibtData.maskew_to_wisbech_weekday_times, 'Maskew IBT TO WB');
    checkTimes(isSaturday ? ibtData.market_deeping_saturday_times : ibtData.market_deeping_weekday_times, 'Market IBT');
    checkTimes(isSaturday ? ibtData.fengate_saturday_times : ibtData.fengate_weekday_times, 'Wisbech IBT TO HD');

    // Filter warnings by active table
    const activeSection = document.querySelector('.timetable-section.active');
    let allowedLabels = [];
    if (activeSection) {
        if (activeSection.id === 'maskew-section') {
            allowedLabels = ['Maskew IBT', 'Maskew IBT TO WB'];
        } else if (activeSection.id === 'market-section') {
            allowedLabels = ['Market IBT'];
        } else if (activeSection.id === 'fengate-section') {
            allowedLabels = ['Wisbech IBT TO HD'];
        }
    }
    const filteredWarnings = warnings.filter(warn =>
        allowedLabels.some(label => warn.startsWith(label))
    );
    if (filteredWarnings.length) {
        speakFiveMinMessage(`Attention please. ${filteredWarnings.join(', ')} will depart in 5 minutes.`);
        showOverlay(filteredWarnings.length > 1 ? '5 MINUTES TO MULTIPLE DEPARTURES' : '5 MINUTES TO DEPARTURE', filteredWarnings.join(', '), true);
        lastFiveMinuteCheck = currentMinute;
    }
}

// ===== Main Loader =====
async function loadTimetableData() {
    showLoading(true);
    try {
        const res = await fetch('https://raw.githubusercontent.com/mhdhanji/ibt-timetable-app/data/data/ibt_data.json');
        const ibtData = await res.json();
        globalIbtData = ibtData;
        const isSaturday = useWeekendTimes;

        // Maskew Avenue: IBT and IBT TO WB
        const maskewLocations = ['IBT', 'IBT TO WB'];
        const maskewGrid = createEmptyTimeGrid(maskewLocations);
        const allMaskewTimes = new Set();

        // Fill grid with IBT times
        Object.values(isSaturday ? ibtData.maskew_avenue_saturday_times : ibtData.maskew_avenue_weekday_times).forEach(time => {
            if (time) {
                allMaskewTimes.add(normalizeTimeFormat(time));
                maskewGrid['IBT'][normalizeTimeFormat(time)] = { time: normalizeTimeFormat(time) };
            }
        });
        // Fill grid with IBT TO WB times
        Object.values(isSaturday ? ibtData.maskew_to_wisbech_saturday_times : ibtData.maskew_to_wisbech_weekday_times).forEach(time => {
            if (time) {
                allMaskewTimes.add(normalizeTimeFormat(time));
                maskewGrid['IBT TO WB'][normalizeTimeFormat(time)] = { time: normalizeTimeFormat(time) };
            }
        });

        renderMatrixTable('maskew-body', allMaskewTimes, maskewLocations, maskewGrid);

        // Market Deeping: IBT only
        const marketLocations = ['IBT'];
        const marketGrid = createEmptyTimeGrid(marketLocations);
        const allMarketTimes = new Set();
        Object.values(isSaturday ? ibtData.market_deeping_saturday_times : ibtData.market_deeping_weekday_times).forEach(time => {
            if (time) {
                allMarketTimes.add(normalizeTimeFormat(time));
                marketGrid['IBT'][normalizeTimeFormat(time)] = { time: normalizeTimeFormat(time) };
            }
        });
        renderMatrixTable('market-body', allMarketTimes, marketLocations, marketGrid);

        // Wisbech (Fengate): IBT TO HD only
        const fengateLocations = ['IBT TO HD'];
        const fengateGrid = createEmptyTimeGrid(fengateLocations);
        const allFengateTimes = new Set();
        Object.values(isSaturday ? ibtData.fengate_saturday_times : ibtData.fengate_weekday_times).forEach(time => {
            if (time) {
                allFengateTimes.add(normalizeTimeFormat(time));
                fengateGrid['IBT TO HD'][normalizeTimeFormat(time)] = { time: normalizeTimeFormat(time) };
            }
        });
        renderMatrixTable('fengate-body', allFengateTimes, fengateLocations, fengateGrid);

        updateTimestamp();
        checkDepartures(ibtData);
        checkUpcomingDepartures(ibtData);

    } catch (err) {
        console.error('Error loading IBT data:', err);
        document.getElementById('error-message').textContent = 'Failed to load data';
    } finally {
        showLoading(false);
    }
}

function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    if (today.getDay() === 6) useWeekendTimes = true;

    document.getElementById('day-toggle').checked = useWeekendTimes;

    document.getElementById('day-toggle').addEventListener('change', e => {
        useWeekendTimes = e.target.checked;
        loadTimetableData();
    });

    document.getElementById('refresh-button').addEventListener('click', loadTimetableData);

    document.getElementById('mute-button').addEventListener('click', () => {
        isMuted = !isMuted;
        document.getElementById('mute-button').classList.toggle('muted', isMuted);
        document.querySelector('.mute-icon').textContent = isMuted ? '🔇' : '🔊';
        saveMuteState(isMuted);
    });

    document.getElementById('table-select').addEventListener('change', e => {
        document.querySelectorAll('.timetable-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`${e.target.value}-section`).classList.add('active');
        saveLastTable(e.target.value);
    });

    loadTimetableData();

    // Set initial table based on last used
    const lastTable = getLastTable();
    document.getElementById('table-select').value = lastTable;
    document.querySelectorAll('.timetable-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(`${lastTable}-section`).classList.add('active');

    // Set mute based on last used
    isMuted = getMuteState();
    document.getElementById('mute-button').classList.toggle('muted', isMuted);
    document.querySelector('.mute-icon').textContent = isMuted ? '🔇' : '🔊';

    updateClock();
    setInterval(updateClock, 1000);
    setInterval(() => {
        if (globalIbtData) checkDepartures(globalIbtData);
        if (globalIbtData) checkUpcomingDepartures(globalIbtData);
    }, 1000);

    // Add live time-based table cell coloring update every second
    setInterval(updateTimeBasedStyling, 1000);

    // 7pm auto refresh logic
    setInterval(() => {
        const now = new Date();
        // If it's exactly 19:00:00 (7pm), refresh once
        if (now.getHours() === 19 && now.getMinutes() === 0 && now.getSeconds() === 0) {
            loadTimetableData();
            // Optional: show an overlay or notification to indicate auto-refresh
            // showOverlay('Schedule Auto-Refreshed', 'Timetable has been updated for the next day.');
        }
    }, 1000); // Check every second for the top of the minute
});