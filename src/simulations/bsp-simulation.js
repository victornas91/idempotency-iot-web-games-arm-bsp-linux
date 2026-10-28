import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { sound } from '../core/sound.js';
export class BSPSimulation extends BaseSimulation {
    id = 'bsp';
    title = 'Board Support Package: I2C Peripheral Reset';
    domain = 'Embedded BSP & Low-Level Driver Firmware';
    // 3D PCB & Chip Components
    pcbGroup = new THREE.Group();
    chipDie = new THREE.Group();
    readyCore = null;
    readyLED = null;
    sdaTrace = null;
    sclTrace = null;
    // 4 Internal Register Columns
    registerColumns = [];
    // Hardware State
    resetCallCount = 0;
    isBusActive = false;
    isHardwareReady = true;
    fifoDepth = 0; // 0 is default
    configReg = 0x0000; // 0x0000 is default
    statusReg = 0x0001; // 0x0001 (READY) is default
    stateMachineName = 'IDLE_READY';
    CANONICAL_HASH = '0x00A1_READY';
    // Animation & Visual FX
    resetScanWave = null;
    scanProgress = 1.0; // 1.0 = idle
    async init() {
        this.buildPCBBoard();
        this.buildI2CChipPackage();
        this.buildInternalSiliconDie();
        this.buildRegisterTowers();
        this.buildBusTraces();
        this.rootGroup.add(this.pcbGroup);
        this.log('info', 'BSP I2C subsystem initialized. Chip in canonical READY state.', 'INIT');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, 'Ready. Calling reset routine once or 10x leaves hardware in identical state.');
    }
    buildPCBBoard() {
        // Green/Black solder mask PCB substrate
        const pcbGeo = new THREE.BoxGeometry(11, 0.3, 8);
        const pcbMat = new THREE.MeshStandardMaterial({
            color: 0x0b291b, // Deep solder mask green
            roughness: 0.4,
            metalness: 0.1,
        });
        const pcb = new THREE.Mesh(pcbGeo, pcbMat);
        pcb.position.y = 0.15;
        pcb.receiveShadow = true;
        this.pcbGroup.add(pcb);
        // Gold test points and pads (ENIG finish)
        const padMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.9,
            roughness: 0.2,
        });
        [-4.2, -3.4, -2.6, 2.6, 3.4, 4.2].forEach((x) => {
            const padGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
            const pad = new THREE.Mesh(padGeo, padMat);
            pad.position.set(x, 0.32, -3.0);
            this.pcbGroup.add(pad);
        });
        // On-board READY Status LED
        const ledHolderGeo = new THREE.BoxGeometry(0.4, 0.2, 0.4);
        const ledHolderMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
        const ledHolder = new THREE.Mesh(ledHolderGeo, ledHolderMat);
        ledHolder.position.set(4.2, 0.4, 2.8);
        this.pcbGroup.add(ledHolder);
        const ledGeo = new THREE.SphereGeometry(0.14, 16, 16);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        this.readyLED = new THREE.Mesh(ledGeo, ledMat);
        this.readyLED.position.set(4.2, 0.55, 2.8);
        this.pcbGroup.add(this.readyLED);
        // Bypass capacitors around chip
        const capGeo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
        const capMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.5 });
        [-2.8, 2.8].forEach((x) => {
            const cap = new THREE.Mesh(capGeo, capMat);
            cap.position.set(x, 0.4, 0);
            this.pcbGroup.add(cap);
        });
    }
    buildI2CChipPackage() {
        // QFP/SOIC IC chip body
        const chipBodyGeo = new THREE.BoxGeometry(4.4, 0.5, 4.4);
        const chipBodyMat = new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.5,
            metalness: 0.3,
        });
        const chipBody = new THREE.Mesh(chipBodyGeo, chipBodyMat);
        chipBody.position.set(0, 0.55, 0);
        chipBody.castShadow = true;
        this.pcbGroup.add(chipBody);
        // Metallic IC pins along sides
        const pinMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db,
            metalness: 0.95,
            roughness: 0.15,
        });
        for (let i = 0; i < 4; i++) {
            const z = -1.5 + i * 1.0;
            // Left pins
            const pinL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.25), pinMat);
            pinL.position.set(-2.4, 0.4, z);
            this.pcbGroup.add(pinL);
            // Right pins
            const pinR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.25), pinMat);
            pinR.position.set(2.4, 0.4, z);
            this.pcbGroup.add(pinR);
        }
    }
    buildInternalSiliconDie() {
        this.chipDie.position.set(0, 0.85, 0);
        this.pcbGroup.add(this.chipDie);
        // Translucent silicon die top window
        const dieWindowGeo = new THREE.BoxGeometry(3.6, 0.1, 3.6);
        const dieWindowMat = new THREE.MeshPhysicalMaterial({
            color: 0x064e3b,
            transparent: true,
            opacity: 0.4,
            roughness: 0.2,
            transmission: 0.7,
        });
        const dieWindow = new THREE.Mesh(dieWindowGeo, dieWindowMat);
        dieWindow.position.y = 0.05;
        this.chipDie.add(dieWindow);
        // Central Calibrated Emerald Reference Core
        const coreGeo = new THREE.OctahedronGeometry(0.45, 0);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x10b981,
            emissive: 0x059669,
            emissiveIntensity: 0.8,
            roughness: 0.2,
            metalness: 0.8,
        });
        this.readyCore = new THREE.Mesh(coreGeo, coreMat);
        this.readyCore.position.set(0, 0.6, 0);
        this.chipDie.add(this.readyCore);
        // Reset scan plane
        const scanGeo = new THREE.PlaneGeometry(0.2, 3.4);
        const scanMat = new THREE.MeshBasicMaterial({
            color: 0x34d399,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
        });
        this.resetScanWave = new THREE.Mesh(scanGeo, scanMat);
        this.resetScanWave.rotation.x = -Math.PI / 2;
        this.resetScanWave.position.set(-1.8, 0.12, 0);
        this.resetScanWave.visible = false;
        this.chipDie.add(this.resetScanWave);
    }
    buildRegisterTowers() {
        // 4 Register Columns:
        // 0: CR0 (Control Reg, default height 0.3)
        // 1: SR0 (Status Reg READY, default height 0.9)
        // 2: FIFO (Data Buffer, default height 0.15 = 0 bytes)
        // 3: FSM (State Machine, default height 0.8 = IDLE_READY)
        const configs = [
            { name: 'CR0', x: -1.2, z: -1.0, defaultH: 0.3, color: 0x0284c7 },
            { name: 'SR0 (RDY)', x: -1.2, z: 1.0, defaultH: 0.9, color: 0x10b981 },
            { name: 'FIFO_BUF', x: 1.2, z: -1.0, defaultH: 0.15, color: 0xf59e0b },
            { name: 'FSM_STATE', x: 1.2, z: 1.0, defaultH: 0.8, color: 0x8b5cf6 },
        ];
        configs.forEach((cfg) => {
            const group = new THREE.Group();
            group.position.set(cfg.x, 0.1, cfg.z);
            const barGeo = new THREE.BoxGeometry(0.5, 1, 0.5);
            barGeo.translate(0, 0.5, 0); // Origin at bottom
            const barMat = new THREE.MeshStandardMaterial({
                color: cfg.color,
                metalness: 0.7,
                roughness: 0.2,
                emissive: cfg.color,
                emissiveIntensity: 0.3,
            });
            const bar = new THREE.Mesh(barGeo, barMat);
            bar.scale.set(1, cfg.defaultH, 1);
            group.add(bar);
            this.chipDie.add(group);
            this.registerColumns.push({
                name: cfg.name,
                group,
                bar,
                currentHeight: cfg.defaultH,
                targetHeight: cfg.defaultH,
                valHex: '0x0000',
            });
        });
    }
    buildBusTraces() {
        // SCL clock line trace (Cyan)
        const sclPoints = [
            new THREE.Vector3(-4.2, 0.32, -3.0),
            new THREE.Vector3(-4.2, 0.32, -1.5),
            new THREE.Vector3(-2.4, 0.4, -0.5),
        ];
        const sclGeo = new THREE.BufferGeometry().setFromPoints(sclPoints);
        const sclMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 });
        this.sclTrace = new THREE.Line(sclGeo, sclMat);
        this.pcbGroup.add(this.sclTrace);
        // SDA data line trace (Yellow)
        const sdaPoints = [
            new THREE.Vector3(-3.4, 0.32, -3.0),
            new THREE.Vector3(-3.4, 0.32, -1.5),
            new THREE.Vector3(-2.4, 0.4, 0.5),
        ];
        const sdaGeo = new THREE.BufferGeometry().setFromPoints(sdaPoints);
        const sdaMat = new THREE.LineBasicMaterial({ color: 0xeab308, linewidth: 2 });
        this.sdaTrace = new THREE.Line(sdaGeo, sdaMat);
        this.pcbGroup.add(this.sdaTrace);
    }
    /**
     * Invokes the BSP I2C peripheral reset routine.
     * Guaranteed idempotent: whether called 1x or 10x, state is identical.
     */
    executePeripheralReset(loopCount = 1) {
        this.resetCallCount += loopCount;
        // Trigger visual scan wave animation
        this.scanProgress = 0.0;
        if (this.resetScanWave) {
            this.resetScanWave.visible = true;
        }
        // Set hardware registers to canonical baseline:
        this.configReg = 0x0000; // Reset default
        this.statusReg = 0x0001; // Bit 0 (READY) = 1
        this.fifoDepth = 0; // Empty
        this.stateMachineName = 'IDLE_READY';
        this.isHardwareReady = true;
        // Reset register tower heights to canonical
        this.registerColumns[0].targetHeight = 0.3; // CR0
        this.registerColumns[1].targetHeight = 0.9; // SR0
        this.registerColumns[2].targetHeight = 0.15; // FIFO
        this.registerColumns[3].targetHeight = 0.8; // FSM
        if (this.readyLED) {
            this.readyLED.material.color.setHex(0x10b981);
        }
        // Emit green calibration sparks
        this.particles.emit({
            count: 40,
            origin: new THREE.Vector3(0, 1.5, 0),
            spread: 0.6,
            color: 0x10b981,
            size: 0.3,
            life: 0.8,
            velocity: new THREE.Vector3(0, 0.6, 0),
        });
        sound.playHardwareReset();
        this.log('success', `bsp_i2c_peripheral_reset() invoked (x${loopCount}). SCL clock train -> STOP -> SoftReset 0x06. Chip in canonical READY state.`, 'BSP_RESET');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, `Idempotent hardware state: Invoked ${this.resetCallCount} time(s). All registers match canonical reference Hash ${this.CANONICAL_HASH}. Zero drift.`);
    }
    /**
     * Simulates a "dirty" / uncalibrated peripheral state (filled FIFO, dirty flags)
     * to demonstrate how reset recovers the exact canonical ready pose.
     */
    perturbState() {
        this.fifoDepth = 48; // Dirty FIFO
        this.configReg = 0xa512;
        this.statusReg = 0x0084; // Error bits active
        this.stateMachineName = 'RX_OVERRUN_ERROR';
        this.isHardwareReady = false;
        this.registerColumns[0].targetHeight = 1.1;
        this.registerColumns[1].targetHeight = 0.4;
        this.registerColumns[2].targetHeight = 1.4; // High FIFO
        this.registerColumns[3].targetHeight = 0.3;
        if (this.readyLED) {
            this.readyLED.material.color.setHex(0xef4444);
        }
        // Red warning sparks
        this.particles.emit({
            count: 30,
            origin: new THREE.Vector3(0, 1.5, 0),
            spread: 0.5,
            color: 0xef4444,
            size: 0.3,
            life: 0.6,
        });
        sound.playDeduplicateBlock();
        this.log('warn', 'Hardware perturbed: FIFO=48 bytes, SR0=0x0084 (OVERRUN). Ready to demonstrate idempotent recovery via reset routine.', 'DIRTY_STATE');
        this.updateHUDMetrics();
        this.setIdempotentStatus(false, 'Peripheral perturbed. Execute reset routine once or 10x to restore canonical state.');
    }
    update(delta, elapsed) {
        super.update(delta, elapsed);
        // Ready core harmonic pulse
        if (this.readyCore) {
            this.readyCore.rotation.y += delta * 1.8;
            this.readyCore.rotation.x = Math.sin(elapsed * 2.0) * 0.3;
            if (this.isHardwareReady) {
                const pulse = 0.7 + Math.sin(elapsed * 4.0) * 0.25;
                this.readyCore.material.emissiveIntensity = pulse;
            }
            else {
                this.readyCore.material.emissiveIntensity = 0.1;
            }
        }
        // Status LED breathing
        if (this.readyLED) {
            const ledPulse = 1.0 + Math.sin(elapsed * 5.0) * 0.12;
            this.readyLED.scale.set(ledPulse, ledPulse, ledPulse);
        }
        // Idle I2C bus clock heartbeat pulses along PCB traces
        if (Math.random() < 0.2) {
            // SCL Cyan pulse
            this.particles.emit({
                count: 1,
                origin: new THREE.Vector3(-4.2 + Math.random() * 1.5, 0.33, -2.2),
                color: 0x06b6d4,
                size: 0.2,
                life: 0.6,
                velocity: new THREE.Vector3(0.8, 0, 0.6),
            });
            // SDA Yellow pulse
            this.particles.emit({
                count: 1,
                origin: new THREE.Vector3(-3.4 + Math.random() * 1.0, 0.33, -2.0),
                color: 0xeab308,
                size: 0.2,
                life: 0.6,
                velocity: new THREE.Vector3(0.6, 0, 0.7),
            });
        }
        // Smooth register column height interpolation
        this.registerColumns.forEach((col) => {
            col.currentHeight += (col.targetHeight - col.currentHeight) * Math.min(1.0, delta * 6.0);
            col.bar.scale.y = col.currentHeight;
        });
        // Reset scan wave animation
        if (this.scanProgress < 1.0) {
            this.scanProgress += delta * 2.5;
            if (this.resetScanWave) {
                this.resetScanWave.position.x = -1.8 + this.scanProgress * 3.6;
                if (this.scanProgress >= 1.0) {
                    this.resetScanWave.visible = false;
                }
            }
        }
    }
    updateHUDMetrics() {
        this.updateMetrics([
            {
                id: 'hardware_state',
                label: 'Chip FSM State',
                value: this.stateMachineName,
                status: this.isHardwareReady ? 'success' : 'alert',
                highlight: true,
            },
            {
                id: 'reset_calls',
                label: 'Reset Routine Invocations',
                value: this.resetCallCount,
            },
            {
                id: 'canonical_hash',
                label: 'State Consistency Hash',
                value: this.isHardwareReady ? this.CANONICAL_HASH : '0xDIRTY_HASH',
                status: this.isHardwareReady ? 'success' : 'alert',
                highlight: true,
            },
            {
                id: 'status_reg',
                label: 'Status Reg (SR0)',
                value: `0x${this.statusReg.toString(16).padStart(4, '0').toUpperCase()} (RDY=${this.statusReg & 1})`,
            },
            {
                id: 'fifo_depth',
                label: 'FIFO Depth',
                value: `${this.fifoDepth} / 64 B`,
            },
            {
                id: 'state_drift',
                label: 'Residual Drift',
                value: '0.00% (Strictly Identical)',
            },
        ]);
    }
    onControlAction(actionId) {
        switch (actionId) {
            case 'reset_1x':
                this.executePeripheralReset(1);
                break;
            case 'reset_10x':
                this.executePeripheralReset(10);
                break;
            case 'perturb_state':
                this.perturbState();
                break;
            default:
                console.warn('Unknown action:', actionId);
        }
    }
    getHUDConfig() {
        return {
            title: 'BSP: I2C Peripheral Reset Idempotency',
            domain: 'Board Support Packages & Embedded Device Drivers',
            conceptSummary: 'In embedded hardware, the I2C peripheral reset routine must be strictly idempotent. Whether invoked once during boot, or ten times consecutively during error recovery, the chip silicon must settle into the exact same initial ready state with zero residual FIFO bytes, zero register drift, and zero memory leaks.',
            formula: 'bsp_reset(); bsp_reset() => HardwareState === CANONICAL_READY (Identical)',
            metrics: [
                { id: 'hardware_state', label: 'Chip FSM State', value: 'IDLE_READY' },
                { id: 'reset_calls', label: 'Reset Routine Invocations', value: 0 },
                { id: 'canonical_hash', label: 'State Consistency Hash', value: this.CANONICAL_HASH },
                { id: 'status_reg', label: 'Status Reg (SR0)', value: '0x0001 (RDY=1)' },
                { id: 'fifo_depth', label: 'FIFO Depth', value: '0 / 64 B' },
                { id: 'state_drift', label: 'Residual Drift', value: '0.00%' },
            ],
            buttons: [
                {
                    id: 'reset_1x',
                    label: 'Call bsp_i2c_reset() (1x)',
                    subLabel: 'Single reset routine',
                    variant: 'primary',
                    icon: '⚙️',
                },
                {
                    id: 'reset_10x',
                    label: 'Execute 10x Consecutive Loop',
                    subLabel: 'Verify zero residual drift',
                    variant: 'accent',
                    icon: '🔄',
                },
                {
                    id: 'perturb_state',
                    label: 'Perturb / Dirty Peripheral',
                    subLabel: 'Corrupt registers & fill FIFO',
                    variant: 'secondary',
                    icon: '⚡',
                },
            ],
            infoNotes: [
                'Notice how the 4 internal silicon register columns and the central green core settle into the exact same calibrated reference pose whether called 1x or 10x.',
                'The state hash remains 0x00A1_READY with 100% bit-for-bit repeatability.',
            ],
        };
    }
    getCameraPreset() {
        return {
            position: new THREE.Vector3(0, 7.5, 9.5),
            target: new THREE.Vector3(0, 0.8, 0),
        };
    }
}
//# sourceMappingURL=bsp-simulation.js.map