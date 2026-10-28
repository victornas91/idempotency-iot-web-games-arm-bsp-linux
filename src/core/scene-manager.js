import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export class SceneManager {
    scene;
    camera;
    renderer;
    controls;
    container;
    isRunning = false;
    animFrameId = null;
    clock;
    updateCallbacks = [];
    resizeHandler;
    // Visual ambiance
    ambientLight;
    dirLight;
    fillLight;
    gridHelper = null;
    constructor(container) {
        this.container = container;
        this.clock = new THREE.Clock();
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0d14);
        this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.025);
        // Camera
        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, 8, 16);
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false,
        });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        container.appendChild(this.renderer.domElement);
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Slightly allow ground glance
        this.controls.minDistance = 3;
        this.controls.maxDistance = 60;
        this.controls.target.set(0, 1.5, 0);
        // Lights
        this.ambientLight = new THREE.AmbientLight(0xd9e5ff, 0.6);
        this.scene.add(this.ambientLight);
        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
        this.dirLight.position.set(12, 20, 10);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 60;
        this.dirLight.shadow.camera.left = -15;
        this.dirLight.shadow.camera.right = 15;
        this.dirLight.shadow.camera.top = 15;
        this.dirLight.shadow.camera.bottom = -15;
        this.dirLight.shadow.bias = -0.0005;
        this.scene.add(this.dirLight);
        this.fillLight = new THREE.PointLight(0x00d2ff, 1.2, 30);
        this.fillLight.position.set(-10, 8, -5);
        this.scene.add(this.fillLight);
        // Cyberpunk Floor Grid
        this.createCyberFloor();
        // Resize handling
        this.resizeHandler = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);
        this.start();
    }
    createCyberFloor() {
        // Elegant dual-color grid
        const grid = new THREE.GridHelper(50, 50, 0x00f0ff, 0x1f293d);
        grid.position.y = -0.01;
        grid.material.opacity = 0.45;
        grid.material.transparent = true;
        this.scene.add(grid);
        this.gridHelper = grid;
        // Subtle dark reflective floor disc
        const floorGeo = new THREE.PlaneGeometry(60, 60);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x07090e,
            roughness: 0.6,
            metalness: 0.4,
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = -0.02;
        floorMesh.receiveShadow = true;
        this.scene.add(floorMesh);
    }
    setCameraPreset(preset, duration = 0.8) {
        // Smoothly animate or set camera
        this.camera.position.copy(preset.position);
        this.controls.target.copy(preset.target);
        this.controls.update();
    }
    onUpdate(callback) {
        this.updateCallbacks.push(callback);
    }
    clearUpdateCallbacks() {
        this.updateCallbacks = [];
    }
    start() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        this.clock.start();
        const animate = () => {
            if (!this.isRunning)
                return;
            this.animFrameId = requestAnimationFrame(animate);
            const delta = Math.min(this.clock.getDelta(), 0.1); // Clamp large lag spikes
            const elapsed = this.clock.getElapsedTime();
            this.controls.update();
            for (let i = 0; i < this.updateCallbacks.length; i++) {
                this.updateCallbacks[i](delta, elapsed);
            }
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
    stop() {
        this.isRunning = false;
        if (this.animFrameId !== null) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        }
    }
    onWindowResize() {
        const width = this.container.clientWidth || window.innerWidth;
        const height = this.container.clientHeight || window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    /**
     * Recursively disposes all geometries, materials, textures, and child meshes
     * in the specified root or the entire scene.
     */
    disposeObject(obj) {
        obj.traverse((child) => {
            if (child.isMesh) {
                const mesh = child;
                if (mesh.geometry) {
                    mesh.geometry.dispose();
                }
                if (mesh.material) {
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach((mat) => this.disposeMaterial(mat));
                    }
                    else {
                        this.disposeMaterial(mesh.material);
                    }
                }
            }
        });
        if (obj.parent) {
            obj.parent.remove(obj);
        }
    }
    disposeMaterial(mat) {
        mat.dispose();
        for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && typeof val === 'object' && 'isTexture' in val) {
                val.dispose();
            }
        }
    }
    /**
     * Cleans up scene contents except the fundamental lighting & floor.
     */
    clearSceneSimulationObjects(keepAmbiance = true) {
        this.clearUpdateCallbacks();
        const objectsToRemove = [];
        this.scene.children.forEach((child) => {
            if (keepAmbiance &&
                (child === this.ambientLight ||
                    child === this.dirLight ||
                    child === this.fillLight ||
                    child === this.gridHelper ||
                    child.name === 'cyber_floor')) {
                return;
            }
            objectsToRemove.push(child);
        });
        objectsToRemove.forEach((obj) => this.disposeObject(obj));
    }
    destroy() {
        this.stop();
        window.removeEventListener('resize', this.resizeHandler);
        this.clearSceneSimulationObjects(false);
        this.controls.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}
//# sourceMappingURL=scene-manager.js.map