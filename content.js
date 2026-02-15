// content.js
if (!window.cesiumBridgeLoaded) {
    window.cesiumBridgeLoaded = true;

    // 1. Inject the guest script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('guest.js');
    (document.head || document.documentElement).appendChild(script);

    // 2. Listen for Data FROM the Page (Guest)
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;
        if (event.data.type === "SYNC_DATA") {
            chrome.storage.local.set({ keyframes: event.data.keyframes });
        }
        if (event.data.type === "PLAYBACK_STATE") {
            chrome.storage.local.set({ playbackActive: event.data.active });
        }
    });

    // 3. Listen for Commands FROM the Popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const allowed = ["RECORD", "PLAY", "STOP", "SPIN", "REVISIT", "DELETE", "CLEAR_ALL", "IMPORT", "SET_SPEED"];
        if (allowed.includes(request.command)) {
            window.postMessage({ type: "FROM_EXTENSION", ...request }, "*");
        }
    });
}