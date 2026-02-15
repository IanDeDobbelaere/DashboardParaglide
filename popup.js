const listEl = document.getElementById('keyframe-list');

function sendCmd(command, extra = {}) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { command, ...extra });
        }
    });
}

function renderList(keyframes = []) {
    listEl.innerHTML = '';
    keyframes.forEach((kf, index) => {
        const row = document.createElement('div');
        row.className = 'kf-row';
        row.innerHTML = `
            <div class="kf-info">
                <div class="kf-diamond"></div>
                <span class="kf-name">Point ${index + 1}</span>
            </div>
            <div style="display:flex; align-items:center;">
                <button class="btn-fly view-btn" data-idx="${index}">PREVIEW</button>
                <button class="btn-del-small del-btn" data-idx="${index}">
                    <img src="trash-2.svg" class="icon-svg-white" />
                </button>
            </div>
        `;
        listEl.appendChild(row);
    });

    // Re-attach listeners
    document.querySelectorAll('.view-btn').forEach(b => b.onclick = () => sendCmd("REVISIT", { index: b.dataset.idx }));
    document.querySelectorAll('.del-btn').forEach(b => b.onclick = () => sendCmd("DELETE", { index: b.dataset.idx }));
}

// Speed: slider and number input stay in sync (1–100 scale → normalizedSpeed = rawValue / 10000)
const speedSlider = document.getElementById('speed-slider');
const speedNumber = document.getElementById('speed-number');

function applySpeed(rawValue) {
    const clamped = Math.max(1, Math.min(100, parseInt(rawValue, 10) || 1));
    speedSlider.value = clamped;
    speedNumber.value = clamped;
    chrome.storage.local.set({ playbackSpeedRaw: clamped });
    sendCmd("SET_SPEED", { value: clamped / 10000 });
}

speedSlider.oninput = (e) => applySpeed(e.target.value);
speedNumber.oninput = (e) => applySpeed(e.target.value);
speedNumber.onchange = (e) => applySpeed(e.target.value); // sync after blur if user typed

// Clapperboard: countdown + 1-frame sync inside popup (no tab rendering)
const ONE_FRAME_MS = 1000 / 30;
const COUNTDOWN_STEP_MS = 1000;

const syncToggle = document.getElementById('sync-toggle');
const overlayEl = document.getElementById('clapperboard-overlay');
const countdownEl = document.getElementById('clapperboard-countdown');
const flashEl = document.getElementById('clapperboard-flash');

const playStopBtn = document.getElementById('play-stop');
let playbackActive = false;

function updatePlayStopButton() {
    playStopBtn.textContent = playbackActive ? "STOP" : "PLAY PATH";
    playStopBtn.classList.toggle("play-btn", !playbackActive);
}

chrome.storage.local.get(['clapperboardEnabled', 'playbackSpeedRaw', 'playbackActive'], (res) => {
    syncToggle.checked = !!res.clapperboardEnabled;
    if (res.playbackSpeedRaw != null) applySpeed(res.playbackSpeedRaw);
    playbackActive = !!res.playbackActive;
    updatePlayStopButton();
});
syncToggle.onchange = () => {
    chrome.storage.local.set({ clapperboardEnabled: syncToggle.checked });
};

function runClapperboardThenPlay() {
    overlayEl.classList.add('visible');
    countdownEl.style.display = '';
    flashEl.classList.remove('visible');
    let step = 3;
    countdownEl.textContent = step;
    const tick = () => {
        step--;
        if (step >= 1) {
            countdownEl.textContent = step;
            setTimeout(tick, COUNTDOWN_STEP_MS);
        } else {
            countdownEl.style.display = 'none';
            flashEl.classList.add('visible');
            setTimeout(() => {
                flashEl.classList.remove('visible');
                overlayEl.classList.remove('visible');
                sendCmd("PLAY");
            }, ONE_FRAME_MS);
        }
    };
    setTimeout(tick, COUNTDOWN_STEP_MS);
}

document.getElementById('rec').onclick = () => sendCmd("RECORD");
playStopBtn.onclick = () => {
    if (playbackActive) {
        sendCmd("STOP");
    } else {
        if (syncToggle.checked) {
            runClapperboardThenPlay();
        } else {
            sendCmd("PLAY");
        }
    }
};
document.getElementById('spin').onclick = () => sendCmd("SPIN");
document.getElementById('clear-all').onclick = () => sendCmd("CLEAR_ALL");

// Storage & Sync
chrome.storage.local.get(['keyframes'], (res) => renderList(res.keyframes || []));
chrome.storage.onChanged.addListener((changes) => {
    if (changes.keyframes) renderList(changes.keyframes.newValue);
    if (changes.playbackActive) {
        playbackActive = !!changes.playbackActive.newValue;
        updatePlayStopButton();
    }
});

// Import / Export
document.getElementById('export').onclick = () => {
    chrome.storage.local.get(['keyframes'], (res) => {
        const blob = new Blob([JSON.stringify(res.keyframes, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cesium_path.json'; a.click();
    });
};

document.getElementById('import').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                chrome.storage.local.set({ keyframes: importedData }, () => {
                    sendCmd("IMPORT", { data: importedData });
                });
            } catch (err) { alert("Invalid JSON"); }
        };
        reader.readAsText(file);
    };
    input.click();
};