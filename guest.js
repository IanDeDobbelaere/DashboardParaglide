window.CesiumPathEngine = {
    viewer: null,
    keyframes: [],
    playbackSpeed: 0.005, // Default start speed
    isSpinning: false,
    activePanListener: null,

    // --- 1. CORE UTILS ---
    findViewer() {
        try {
            // Locate the Cesium Viewer inside the shadow DOM
            this.viewer = document.querySelector('sc-app').shadowRoot
                .querySelector('sc-viewer').shadowRoot
                .querySelector('sc-map-viewer').shadowRoot
                .querySelector('cesium-viewer')._viewer;
        } catch (e) { 
            console.error("Cesium Viewer not found. Are you on the right tab?"); 
        }
    },

    sync() {
        // Send data back to the popup
        window.postMessage({ type: "SYNC_DATA", keyframes: this.keyframes }, "*");
    },

    // --- 2. ACTIONS ---
    recordKeyframe() {
        if (!this.viewer) this.findViewer();
        const cam = this.viewer.camera;
        
        const newFrame = {
            position: cam.position.clone(),
            heading: cam.heading,
            pitch: cam.pitch,
            roll: cam.roll
        };
        
        this.keyframes.push(newFrame);
        this.sync();
        console.log(`Recorded Point ${this.keyframes.length}`);
    },

    deletePoint(index) {
        this.keyframes.splice(index, 1);
        this.sync();
    },

    revisitPoint(index) {
        if (!this.viewer) this.findViewer();
        const p = this.keyframes[index];
        this.viewer.camera.flyTo({
            destination: p.position,
            orientation: { heading: p.heading, pitch: p.pitch, roll: p.roll },
            duration: 1.5
        });
    },

    toggleSpin() {
        if (!this.viewer) this.findViewer();
        const v = this.viewer;
        
        if (this.isSpinning) {
            if (this.activePanListener) v.scene.postRender.removeEventListener(this.activePanListener);
            this.isSpinning = false;
        } else {
            // Spin around the center of the screen
            const centerWindow = { x: v.container.clientWidth / 2, y: v.container.clientHeight / 2 };
            const target = v.scene.pickPosition(centerWindow) || v.scene.globe.pick(v.camera.getPickRay(centerWindow), v.scene);
            
            if (!target) return alert("Look at the ground to set a pivot point!");
            
            this.activePanListener = () => { v.camera.rotate(target, 0.002); };
            v.scene.postRender.addEventListener(this.activePanListener);
            this.isSpinning = true;
        }
    },

    playPath() {
        if (this.keyframes.length < 2) return alert("Record at least 2 points first.");
        if (!this.viewer) this.findViewer();
        
        const start = this.keyframes[0];

        // 1. Fly to start position
        this.viewer.camera.flyTo({
            destination: start.position,
            orientation: { heading: start.heading, pitch: start.pitch, roll: start.roll },
            duration: 2,
            complete: () => {
                // 2. Wait for tiles to load, then start engine
                setTimeout(() => {
                    console.log("Starting Cinematic Path...");
                    this.runCinematicEngine(this.keyframes);
                }, 1000);
            }
        });
    },

    // --- 3. THE CINEMATIC ENGINE ---
    runCinematicEngine(points) {
        let t = 0; 
        const v = this.viewer;
        const totalPoints = points.length;

        // Spline Interpolation (Catmull-Rom)
        const interpolate = (p0, p1, p2, p3, t) => {
            const v0 = (p2 - p0) * 0.5;
            const v1 = (p3 - p1) * 0.5;
            const t2 = t * t;
            const t3 = t * t2;
            return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
        };

        // Smart Rotation (takes the shortest path around the circle)
        const lerpAngle = (start, end, amt) => {
            let diff = end - start;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            return start + diff * amt;
        };

        // Easing Function (Smooth Start / Smooth Stop)
        // input x is 0..1 (percentage of total path)
        const easeInOut = (x) => {
            return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
        };

        const animate = () => {
            // STOP condition
            if (window.CesiumPathEngine.keyframes.length === 0) return;
            
            // Calculate Global Progress (0.0 to 1.0)
            const globalProgress = t / (totalPoints - 1);

            if (globalProgress >= 1.0) {
                console.log("Path Complete");
                return;
            }

            // Segment Logic
            const i = Math.floor(t);       // Current segment index (0, 1, 2...)
            const localT = t - i;          // Progress within that segment (0.0 to 1.0)

            // Safe Indices (Handle boundaries for the spline)
            const i0 = Math.max(i - 1, 0);
            const i1 = i;
            const i2 = Math.min(i + 1, totalPoints - 1);
            const i3 = Math.min(i + 2, totalPoints - 1);

            const p0 = points[i0];
            const p1 = points[i1];
            const p2 = points[i2];
            const p3 = points[i3];

            // Move Camera
            v.camera.setView({
                destination: {
                    x: interpolate(p0.position.x, p1.position.x, p2.position.x, p3.position.x, localT),
                    y: interpolate(p0.position.y, p1.position.y, p2.position.y, p3.position.y, localT),
                    z: interpolate(p0.position.z, p1.position.z, p2.position.z, p3.position.z, localT)
                },
                orientation: {
                    heading: lerpAngle(p1.heading, p2.heading, localT),
                    pitch: interpolate(p0.pitch, p1.pitch, p2.pitch, p3.pitch, localT),
                    roll: 0
                }
            });

            // SPEED CALCULATION
            // 1. Get base speed from slider
            let currentSpeed = window.CesiumPathEngine.playbackSpeed; 
            
            // 2. Apply Easing (Slow down at very start and very end)
            // We dampen the speed if we are in the first 10% or last 10% of the path
            if (globalProgress < 0.1) currentSpeed *= (globalProgress * 10) + 0.1;
            if (globalProgress > 0.9) currentSpeed *= ((1 - globalProgress) * 10) + 0.1;

            t += currentSpeed;

            requestAnimationFrame(animate);
        };

        animate();
    }
};

// --- 4. LISTENER SETUP ---
// Prevents duplicate listeners if injected multiple times
if (!window.cesiumListenerAttached) {
    window.cesiumListenerAttached = true;
    window.addEventListener("message", (event) => {
        if (event.data.type === "FROM_EXTENSION") {
            const engine = window.CesiumPathEngine;
            const cmd = event.data.command;
            const data = event.data;

            if (cmd === "SET_SPEED") {
                engine.playbackSpeed = data.value;
                console.log("Speed set to:", engine.playbackSpeed);
            }
            if (cmd === "RECORD") engine.recordKeyframe();
            if (cmd === "PLAY") engine.playPath();
            if (cmd === "SPIN") engine.toggleSpin();
            if (cmd === "REVISIT") engine.revisitPoint(data.index);
            if (cmd === "DELETE") engine.deletePoint(data.index);
            if (cmd === "CLEAR_ALL") { engine.keyframes = []; engine.sync(); }
            if (cmd === "IMPORT") { engine.keyframes = data.data; engine.sync(); }
        }
    });
}