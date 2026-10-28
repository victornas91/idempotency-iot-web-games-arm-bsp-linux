import * as THREE from 'three';
import { ParticleEngine } from '../core/particle-system.js';
export class BaseSimulation {
    sceneManager;
    scene;
    camera;
    rootGroup;
    particles;
    stateUpdateCallback = null;
    logCounter = 0;
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.scene = sceneManager.scene;
        this.camera = sceneManager.camera;
        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);
        this.particles = new ParticleEngine(800);
        this.rootGroup.add(this.particles.points);
    }
    setStateUpdateCallback(callback) {
        this.stateUpdateCallback = callback;
    }
    notifyStateUpdate(update) {
        if (this.stateUpdateCallback) {
            this.stateUpdateCallback(update);
        }
    }
    log(type, message, tag) {
        this.logCounter++;
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
        this.notifyStateUpdate({
            logEntry: {
                id: `log_${this.logCounter}`,
                timestamp: timeStr,
                type,
                message,
                tag,
            },
        });
    }
    updateMetrics(metrics) {
        this.notifyStateUpdate({ metrics });
    }
    setIdempotentStatus(isIdempotent, reason) {
        this.notifyStateUpdate({
            idempotentStatus: { isIdempotent, reason },
        });
    }
    /**
     * Per-frame animation tick.
     */
    update(delta, elapsed) {
        this.particles.update(delta);
    }
    /**
     * Camera preset for this specific simulation domain.
     */
    getCameraPreset() {
        return {
            position: new THREE.Vector3(0, 7, 14),
            target: new THREE.Vector3(0, 1.5, 0),
        };
    }
    /**
     * Clean unmounting and memory reclamation.
     */
    dispose() {
        this.particles.dispose();
        this.sceneManager.disposeObject(this.rootGroup);
        this.stateUpdateCallback = null;
    }
}
//# sourceMappingURL=base-simulation.js.map