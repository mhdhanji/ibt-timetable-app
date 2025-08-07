let overlayTimeoutHandle = null;
let lastOverlayMsg = "";
let lastOverlayType = "";
let lastOverlaySection = "";
let lastOverlayTimeoutStart = 0;
// Toast for updater messages
function showUpdateToast(message) {
    let toast = document.getElementById('app-update-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-update-toast';
        toast.style.position = 'fixed';
        toast.style.bottom = '30px';
        toast.style.right = '30px';
        toast.style.background = '#222';
        toast.style.color = '#fff';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '8px';
        toast.style.fontSize = '1.3rem';
        toast.style.zIndex = 9999;
        toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.display = 'none';
    }, 4000);
}
console.log("Script loaded!");
let isMuted = false;


function isSunday() {
    return (new Date()).getDay() === 0;
}

function showNoRunsMessageForAllSections() {
    document.querySelectorAll('.timetable-section').forEach(section => {
        let msg = section.querySelector('.no-runs-message');
        if (!msg) {
            msg = document.createElement('div');
            msg.className = 'no-runs-message';
            msg.textContent = "No IBT runs on Sunday";
            msg.style.fontSize = "2.2rem";
            msg.style.fontWeight = "bold";
            msg.style.textAlign = "center";
            msg.style.margin = "3rem 0";
            msg.style.color = "#b71c1c";
            section.insertBefore(msg, section.querySelector('table'));
        }
        msg.style.display = "block";
        // Hide the table
        const table = section.querySelector('table');
        if (table) table.style.display = "none";
    });
}

function hideNoRunsMessageForAllSections() {
    document.querySelectorAll('.timetable-section').forEach(section => {
        let msg = section.querySelector('.no-runs-message');
        if (msg) msg.style.display = "none";
        const table = section.querySelector('table');
        if (table) table.style.display = "";
    });
}
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

/* ===== Wallboard Mode Persistence and Toggle ===== */
// Wallboard Mode UI patch
// function showWallboardExitButton(show) {
//     let exitBtn = document.getElementById('exit-wallboard-btn');
//     if (show) {
//         if (!exitBtn) {
//             exitBtn = document.createElement('button');
//             exitBtn.id = 'exit-wallboard-btn';
//             exitBtn.className = 'wallboard-exit-btn';
//             exitBtn.textContent = 'Exit Wallboard Mode';
//             exitBtn.style.position = 'fixed';
//             exitBtn.style.top = '';
//             exitBtn.style.bottom = '40px';   // or '20px'
//             exitBtn.style.right = '40px';    // or '20px'
//             exitBtn.style.zIndex = '10000';
//             exitBtn.style.fontSize = '1.5rem';
//             exitBtn.style.background = '#111';
//             exitBtn.style.color = '#fff';
//             exitBtn.style.border = '2px solid #fff';
//             exitBtn.style.padding = '10px 30px';
//             exitBtn.style.borderRadius = '7px';
//             exitBtn.style.cursor = 'pointer';
//             exitBtn.onclick = () => {
//                 enableWallboardMode(false);
//                 // UI sync: update main wallboard toggle button if present
//                 const wallboardBtn = document.getElementById('wallboard-button');
//                 if (wallboardBtn) {
//                     wallboardBtn.classList.remove('active');
//                     wallboardBtn.textContent = "Wallboard Mode";
//                 }
//                 showWallboardExitButton(false);
//             };
//             document.body.appendChild(exitBtn);
//         }
//     } else {
//         if (exitBtn) exitBtn.remove();
//     }
// }
function enableWallboardMode(enable) {
    const body = document.body;
    if (enable) {
        body.classList.add('wallboard');
        localStorage.setItem('wallboardMode', 'true');
    } else {
        body.classList.remove('wallboard');
        localStorage.setItem('wallboardMode', 'false');
    }
}
function loadWallboardMode() {
    const isWallboard = localStorage.getItem('wallboardMode') === 'true';
    enableWallboardMode(isWallboard);
    const btn = document.getElementById('wallboard-button');
    if (btn) btn.classList.toggle('active', isWallboard);
}
/* ===== END Wallboard Mode Section ===== */
let speechVolume = 1.0;
let useWeekendTimes = false;
let lastDepartureCheck = null;
let globalIbtData = null;

let lastDayChecked = (new Date()).getDay();

// ===== Utilities =====
function normalizeTimeFormat(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

// Format a time string (e.g. "14:00") to speech-friendly format ("2 o'clock PM")
function formatTimeForSpeech(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    let [hour, min] = timeStr.split(':').map(Number);
    let suffix = hour >= 12 ? "PM" : "AM";
    let hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;
    if (min === 0) return `${hour12} ${suffix}`;           // "2 PM"
    if (min < 10) return `${hour12} oh ${min} ${suffix}`;  // "2 oh 5 PM"
    return `${hour12} ${min} ${suffix}`;                   // "2 15 PM"
}

function getTimeStatus(timeStr) {
    if (!timeStr.includes(':')) return '';
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    const diff = (target - now) / (1000 * 60);
    if (diff < -0.5) return 'past';
    if (diff <= 10) return 'time-five';
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
            if (value && value.time) {
                cell.textContent = value.time;
                const timeStatus = getTimeStatus(value.time);
                cell.className = timeStatus;
            } else {
                cell.textContent = "";
                cell.className = "";
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
    // Replace "at XX:YY" or "in XX:YY" with formatted time for speech
    message = message.replace(/at (\d{1,2}:\d{2})/g, (m, t) => `at ${formatTimeForSpeech(t)}`);
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
    // Replace "at XX:YY" or "in XX:YY" with formatted time for speech
    message = message.replace(/at (\d{1,2}:\d{2})/g, (m, t) => `at ${formatTimeForSpeech(t)}`);
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
    const activeSection = document.querySelector('.timetable-section.active');
    const sectionId = activeSection ? activeSection.id : "";

    // Only show if new event, or a different table, or last overlay finished
    const now = Date.now();
    if (
        overlay.classList.contains('active') &&
        lastOverlayMsg === mainText + detailText &&
        lastOverlayType === (isWarning ? 'warn' : 'normal') &&
        lastOverlaySection === sectionId &&
        now - lastOverlayTimeoutStart < 58000 // <60s, allow a tiny margin
    ) {
        // Already active and same, skip
        return;
    }
    lastOverlayMsg = mainText + detailText;
    lastOverlayType = isWarning ? 'warn' : 'normal';
    lastOverlaySection = sectionId;
    lastOverlayTimeoutStart = now;

    overlay.querySelector('.main-message').textContent = mainText;
    overlay.querySelector('.detail-message').textContent = detailText;
    overlay.classList.add('active');
    if (isWarning) overlay.classList.add('five-minute');
    // Clear any previous timeout
    if (overlayTimeoutHandle) clearTimeout(overlayTimeoutHandle);
    overlayTimeoutHandle = setTimeout(() => {
        overlay.classList.remove('active', 'five-minute');
        lastOverlayMsg = "";
        lastOverlayType = "";
        lastOverlaySection = "";
        lastOverlayTimeoutStart = 0;
    }, 60000);
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

let lastTenMinuteCheck = null;

function checkUpcomingDepartures(ibtData) {
    const now = new Date();
    const currentMinuteKey = `${now.getHours()}:${now.getMinutes()}`;
    if (lastTenMinuteCheck === currentMinuteKey) return; // Only announce once per minute
    lastTenMinuteCheck = currentMinuteKey;

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
                if (diff > 9.9 && diff < 10.1) { // 10 min warning window
                    warnings.push({ label, t });
                }
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
        allowedLabels.some(label => warn.label === label)
    );

    if (filteredWarnings.length) {
        // Announce all warnings in this minute (will repeat the next minute for new ones)
        const msgText = filteredWarnings.map(warn => `${warn.label} at ${warn.t}`).join(', ');
        speakFiveMinMessage(`Attention please. ${msgText} will depart in 10 minutes.`);
        showOverlay(
            filteredWarnings.length > 1 ? '10 MINUTES TO MULTIPLE DEPARTURES' : '10 MINUTES TO DEPARTURE',
            msgText,
            true
        );
    }
}

// ===== Main Loader =====
async function loadTimetableData() {
    showLoading(true);
    if (isSunday()) {
        showNoRunsMessageForAllSections();
        updateTimestamp();
        showLoading(false);
        return;
    } else {
        hideNoRunsMessageForAllSections();
    }
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

function updateTimeBasedStyling() {
    // Update for all tables (Maskew, Market, Wisbech)
    document.querySelectorAll('.timetable-section table').forEach(table => {
        table.querySelectorAll('td').forEach(cell => {
            // Only update cells with a time value
            if (cell.textContent && cell.textContent.includes(':')) {
                // Remove any old time classes
                cell.classList.remove('past', 'time-five', 'time-fifteen', 'time-thirty');
                // Add new class according to its time
                const timeStatus = getTimeStatus(cell.textContent);
                if (timeStatus) cell.classList.add(timeStatus);
            } else {
                cell.classList.remove('past', 'time-five', 'time-fifteen', 'time-thirty');
            }
        });
    });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded fired");
    // Listen for dark mode toggle events from main process
    if (window.electron && typeof window.electron.onDarkModeToggle === 'function') {
      window.electron.onDarkModeToggle((isDark) => {
        document.body.classList.toggle('dark-mode', isDark);
      });
    }
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

    // ===== Auto-switch weekend mode at midnight (live day change support) =====
    setInterval(() => {
        const now = new Date();
        if (now.getDay() !== lastDayChecked) {
            lastDayChecked = now.getDay();
            const wasWeekend = useWeekendTimes;
            useWeekendTimes = now.getDay() === 6;
            document.getElementById('day-toggle').checked = useWeekendTimes;
            if (wasWeekend !== useWeekendTimes) {
                loadTimetableData();
            }
        }
    }, 60000); // Check every minute

    // ===== Wallboard Mode Initialization =====
    loadWallboardMode();
    const wallboardBtn = document.getElementById('wallboard-button');
    if (wallboardBtn) {
        // Set initial text and active class
        const isActive = document.body.classList.contains('wallboard');
        wallboardBtn.classList.toggle('active', isActive);
        wallboardBtn.textContent = isActive ? "Exit Wallboard Mode" : "Wallboard Mode";

        wallboardBtn.addEventListener('click', () => {
            const currentlyActive = document.body.classList.contains('wallboard');
            enableWallboardMode(!currentlyActive);
            wallboardBtn.classList.toggle('active', !currentlyActive);
            wallboardBtn.textContent = !currentlyActive ? "Exit Wallboard Mode" : "Wallboard Mode";
        });
    }

    // ===== Wallboard Mode Hotkey: Ctrl+W / Cmd+W =====
    document.addEventListener('keydown', (e) => {
        // Check for Ctrl+W (Win/Linux) or Cmd+W (Mac)
        const isToggleHotkey = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w';
        if (!isToggleHotkey) return;
        e.preventDefault();

        // Toggle wallboard mode
        const wallboardActive = document.body.classList.contains('wallboard');
        enableWallboardMode(!wallboardActive);

        // Sync UI button (if present)
        const wallboardBtn = document.getElementById('wallboard-button');
        if (wallboardBtn) {
            wallboardBtn.classList.toggle('active', !wallboardActive);
            wallboardBtn.textContent = !wallboardActive ? "Exit Wallboard Mode" : "Wallboard Mode";
        }
    });

    // ===== Electron auto-updater feedback (system tray initiated) =====
    if (window.electronAPI) {
        window.electronAPI.onCheckingForUpdate(() => showUpdateToast("Checking for app updates..."));
        window.electronAPI.onUpdateAvailable(() => showUpdateToast("Update available! Downloading..."));
        window.electronAPI.onUpdateNotAvailable(() => showUpdateToast("No updates available, you are up to date!"));
        window.electronAPI.onUpdateDownloaded(() => showUpdateToast("Update downloaded! Restart the app to apply the update."));
        window.electronAPI.onUpdateError((_, msg) => showUpdateToast("Error checking for updates: " + msg));
    }
});