import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { sound } from '../core/sound.js';
export class LinuxSimulation extends BaseSimulation {
    id = 'linux';
    title = 'Linux Kernel: MMIO Interrupt Register Bitmask';
    domain = 'Kernel Internals & Memory-Mapped I/O (MMIO)';
    // 3D Visual Components
    mmioBoard = new THREE.Group();
    bitCells = [];
    laserBeam = null;
    busLine = null;
    // 8-bit Register State (Address: 0xFFFF_0204)
    // Default: Bit 0 (Timer) = 1, Bit 5 (NVMe) = 1, other bits = 0
    // Initial register value: 00100001b = 0x21
    registerValue = 0x21;
    TARGET_BIT = 3; // ETH_RX_IRQ
    TARGET_MASK = 1 << 3; // 0x08 = 00001000b
    // Stats
    totalWritesApplied = 0;
    targetBitChanges = 0;
    otherBitsAltered = 0;
    lastWrittenHex = '0x21';
    // Animation
    laserIntensity = 0;
    async init() {
        this.buildMMIOChassis();
        this.build8BitRegisterCells();
        this.buildMMIOWriteHead();
        this.rootGroup.add(this.mmioBoard);
        this.log('info', 'Linux MMIO driver attached to IRQ_ENABLE_REG at 0xFFFF_0204.', 'INIT');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, 'Ready. Writing mask |= (1 << 3) sets Bit 3 to 1 without altering other bits.');
    }
    buildMMIOChassis() {
        // Silicon substrate for MMIO register bank
        const chassisGeo = new THREE.BoxGeometry(13, 0.4, 4.2);
        const chassisMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.9,
            roughness: 0.2,
        });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        chassis.position.y = 0.2;
        chassis.receiveShadow = true;
        this.mmioBoard.add(chassis);
        // Glowing bus bar along the back of the register
        const busPoints = [new THREE.Vector3(-6, 0.5, -1.4), new THREE.Vector3(6, 0.5, -1.4)];
        const busGeo = new THREE.BufferGeometry().setFromPoints(busPoints);
        const busMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
        this.busLine = new THREE.Line(busGeo, busMat);
        this.mmioBoard.add(this.busLine);
    }
    build8BitRegisterCells() {
        const bitLabels = [
            'TIMER', // Bit 0
            'GPIO', // Bit 1
            'UART', // Bit 2
            'ETH_RX', // Bit 3 (Target)
            'USB', // Bit 4
            'NVMe', // Bit 5
            'DMA', // Bit 6
            'IPC', // Bit 7
        ];
        // Build 8 cells from index 7 (left) to 0 (right)
        for (let i = 7; i >= 0; i--) {
            const isTarget = i === this.TARGET_BIT;
            const xOffset = (3.5 - i) * 1.45; // Spaced evenly
            const group = new THREE.Group();
            group.position.set(xOffset, 0.4, 0);
            // Bit cell mechanical cube
            const cubeGeo = new THREE.BoxGeometry(1.15, 0.9, 1.3);
            const isBitActive = (this.registerValue & (1 << i)) !== 0;
            const baseColor = isTarget ? 0x0284c7 : isBitActive ? 0x10b981 : 0x1e293b;
            const cubeMat = new THREE.MeshStandardMaterial({
                color: baseColor,
                metalness: 0.8,
                roughness: 0.25,
            });
            const cube = new THREE.Mesh(cubeGeo, cubeMat);
            cube.position.y = isBitActive ? 0.65 : 0.45;
            cube.castShadow = true;
            group.add(cube);
            // Bit value display digit canvas texture
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            this.drawBitCanvas(ctx, isBitActive ? '1' : '0', isTarget);
            const valTexture = new THREE.CanvasTexture(canvas);
            const valMat = new THREE.MeshBasicMaterial({ map: valTexture, transparent: true });
            const valPlateGeo = new THREE.PlaneGeometry(0.8, 0.8);
            const valText = new THREE.Mesh(valPlateGeo, valMat);
            valText.position.set(0, isBitActive ? 0.65 : 0.45, 0.66);
            group.add(valText);
            // Top status LED
            const ledGeo = new THREE.SphereGeometry(0.12, 16, 16);
            const ledMat = new THREE.MeshBasicMaterial({
                color: isBitActive ? 0x10b981 : 0x475569,
            });
            const led = new THREE.Mesh(ledGeo, ledMat);
            led.position.set(0, isBitActive ? 1.15 : 0.95, 0);
            group.add(led);
            // Target bit highlight ring on floor
            if (isTarget) {
                const ringGeo = new THREE.RingGeometry(0.7, 0.78, 32);
                const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.rotation.x = -Math.PI / 2;
                ring.position.y = 0.02;
                group.add(ring);
            }
            this.mmioBoard.add(group);
            this.bitCells[i] = {
                index: i,
                label: bitLabels[i],
                group,
                cube,
                valText,
                led,
                currentY: isBitActive ? 0.65 : 0.45,
                targetY: isBitActive ? 0.65 : 0.45,
                targetColor: baseColor,
                currentColor: new THREE.Color(baseColor),
            };
        }
    }
    drawBitCanvas(ctx, char, isTarget) {
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = isTarget ? 'rgba(2, 132, 199, 0.9)' : 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 74px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 64, 64);
    }
    buildMMIOWriteHead() {
        // Laser beam projector positioned directly above target Bit 3
        const targetX = (3.5 - this.TARGET_BIT) * 1.45;
        const laserGeo = new THREE.CylinderGeometry(0.04, 0.08, 4.0, 16);
        laserGeo.translate(0, 2.0, 0);
        const laserMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0,
        });
        this.laserBeam = new THREE.Mesh(laserGeo, laserMat);
        this.laserBeam.position.set(targetX, 1.2, 0);
        this.mmioBoard.add(this.laserBeam);
    }
    /**
     * Applies the bitmask *irq_enable |= (1 << 3)
     */
    applyBitmask(loopCount = 1) {
        this.totalWritesApplied += loopCount;
        const oldVal = this.registerValue;
        const oldOtherBits = oldVal & ~this.TARGET_MASK;
        // C kernel bitwise OR operation: reg |= MASK
        this.registerValue |= this.TARGET_MASK;
        const targetChanged = (oldVal & this.TARGET_MASK) !== (this.registerValue & this.TARGET_MASK);
        if (targetChanged) {
            this.targetBitChanges++;
        }
        const newOtherBits = this.registerValue & ~this.TARGET_MASK;
        if (oldOtherBits !== newOtherBits) {
            this.otherBitsAltered++;
        }
        // Trigger MMIO laser beam flash
        this.laserIntensity = 1.0;
        if (this.laserBeam) {
            this.laserBeam.material.opacity = 0.9;
        }
        // Update 3D target bit cell
        this.updateBitCellVisual(this.TARGET_BIT, true);
        // Particle FX
        const targetX = (3.5 - this.TARGET_BIT) * 1.45;
        if (targetChanged) {
            // First change: energetic snap
            sound.playBitFlip();
            this.particles.emit({
                count: 50,
                origin: new THREE.Vector3(targetX, 1.2, 0),
                spread: 0.4,
                color: 0x10b981,
                size: 0.35,
                life: 0.8,
                velocity: new THREE.Vector3(0, 0.8, 0),
            });
            this.log('success', `MMIO WRITE: *IRQ_ENABLE_REG |= 0x08 -> Bit 3 locked to 1 (ENABLED). Register: 0x${this.registerValue.toString(16).toUpperCase()}`, 'MMIO_BIT_SET');
        }
        else {
            // Already 1: Idempotent no-op
            sound.playDeduplicateBlock();
            this.particles.emit({
                count: 20,
                origin: new THREE.Vector3(targetX, 1.2, 0),
                spread: 0.25,
                color: 0x38bdf8,
                size: 0.25,
                life: 0.5,
            });
            this.log('blocked', `MMIO WRITE (x${loopCount}): Bit 3 already 1 (1 | 1 = 1). Zero change, all other 7 bits preserved.`, 'IDEMPOTENT_WRITE');
        }
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, `Idempotent MMIO: Applied mask ${this.totalWritesApplied} time(s). Bit 3 is ENABLED. Zero other bits modified.`);
    }
    /**
     * Clears target bit 3 (*irq_enable &= ~(1 << 3)) so user can test applying mask again.
     */
    clearTargetBit() {
        this.registerValue &= ~this.TARGET_MASK;
        this.updateBitCellVisual(this.TARGET_BIT, false);
        sound.playBitFlip();
        this.log('warn', `Bit 3 cleared to 0 (*reg &= ~0x08). Register: 0x${this.registerValue.toString(16).toUpperCase()}`, 'BIT_CLEARED');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, 'Target bit is 0. Apply bitmask once or 10x to test idempotency.');
    }
    /**
     * Toggles one of the non-target bits to demonstrate concurrent kernel activity.
     */
    toggleArbitraryBit(index) {
        if (index === this.TARGET_BIT)
            return;
        this.registerValue ^= (1 << index);
        const isNowActive = (this.registerValue & (1 << index)) !== 0;
        this.updateBitCellVisual(index, isNowActive);
        sound.playBitFlip();
        this.log('info', `Concurrent OS IRQ Driver: Toggled Bit ${index} (${this.bitCells[index].label}) -> ${isNowActive ? '1' : '0'}. Register: 0x${this.registerValue.toString(16).toUpperCase()}`, 'OS_DRIVER_EVENT');
        this.updateHUDMetrics();
    }
    updateBitCellVisual(index, isActive) {
        const cell = this.bitCells[index];
        if (!cell)
            return;
        cell.targetY = isActive ? 0.65 : 0.45;
        cell.targetColor = index === this.TARGET_BIT ? 0x0284c7 : isActive ? 0x10b981 : 0x1e293b;
        cell.led.material.color.setHex(isActive ? 0x10b981 : 0x475569);
        const canvas = cell.valText.material.map.image;
        const ctx = canvas.getContext('2d');
        this.drawBitCanvas(ctx, isActive ? '1' : '0', index === this.TARGET_BIT);
        cell.valText.material.map.needsUpdate = true;
    }
    update(delta, elapsed) {
        super.update(delta, elapsed);
        // Laser beam fade out or standby targeting glow
        if (this.laserIntensity > 0) {
            this.laserIntensity = Math.max(0, this.laserIntensity - delta * 3.5);
            if (this.laserBeam) {
                this.laserBeam.material.opacity = this.laserIntensity * 0.85;
            }
        }
        else if (this.laserBeam) {
            // Standby targeting beam
            this.laserBeam.material.opacity = 0.14 + Math.sin(elapsed * 4.0) * 0.06;
        }
        // MMIO bus electric pulse
        if (Math.random() < 0.25) {
            this.particles.emit({
                count: 1,
                origin: new THREE.Vector3(-6 + Math.random() * 12, 0.52, -1.4),
                color: 0x00f0ff,
                size: 0.2,
                life: 0.5,
                velocity: new THREE.Vector3(1.5, 0, 0),
            });
        }
        // Smooth mechanical cell heights and color transitions
        this.bitCells.forEach((cell) => {
            cell.currentY += (cell.targetY - cell.currentY) * Math.min(1.0, delta * 8.0);
            const isBitActive = (this.registerValue & (1 << cell.index)) !== 0;
            const hover = isBitActive ? Math.sin(elapsed * 3.0 + cell.index * 0.8) * 0.03 : 0;
            cell.cube.position.y = cell.currentY + hover;
            cell.valText.position.y = cell.currentY + hover;
            cell.led.position.y = cell.currentY + hover + 0.5;
            cell.currentColor.lerp(new THREE.Color(cell.targetColor), Math.min(1.0, delta * 6.0));
            cell.cube.material.color.copy(cell.currentColor);
        });
    }
    updateHUDMetrics() {
        const hex = `0x${this.registerValue.toString(16).padStart(2, '0').toUpperCase()}`;
        const bin = this.registerValue.toString(2).padStart(8, '0');
        const isTargetSet = (this.registerValue & this.TARGET_MASK) !== 0;
        this.updateMetrics([
            {
                id: 'reg_hex',
                label: 'Register Hex (MMIO)',
                value: hex,
                highlight: true,
            },
            {
                id: 'reg_bin',
                label: 'Register Binary [7..0]',
                value: `${bin.slice(0, 4)} ${bin.slice(4)}b`,
            },
            {
                id: 'target_bit',
                label: 'Bit 3 (ETH_RX)',
                value: isTargetSet ? '1 (ENABLED)' : '0 (DISABLED)',
                status: isTargetSet ? 'success' : 'alert',
                highlight: true,
            },
            {
                id: 'writes_applied',
                label: 'Mask Writes (*reg |= 0x08)',
                value: this.totalWritesApplied,
            },
            {
                id: 'other_altered',
                label: 'Other Bits Altered',
                value: `${this.otherBitsAltered} (Strict Bit Isolation)`,
                status: this.otherBitsAltered === 0 ? 'success' : 'alert',
            },
        ]);
    }
    onControlAction(actionId) {
        switch (actionId) {
            case 'apply_mask_1x':
                this.applyBitmask(1);
                break;
            case 'apply_mask_10x':
                this.applyBitmask(10);
                break;
            case 'clear_bit3':
                this.clearTargetBit();
                break;
            case 'toggle_timer':
                this.toggleArbitraryBit(0);
                break;
            case 'toggle_nvme':
                this.toggleArbitraryBit(5);
                break;
            default:
                console.warn('Unknown action:', actionId);
        }
    }
    getHUDConfig() {
        return {
            title: 'Linux Kernel: MMIO Interrupt Bitmask Idempotency',
            domain: 'Operating System Kernels & Memory-Mapped Hardware Registers',
            conceptSummary: 'In the Linux kernel interrupt controller driver, enabling an IRQ line is performed via a bitwise OR mask on a Memory-Mapped I/O register: *irq_enable |= (1 << 3). Because the bitwise OR is mathematically idempotent (x | 1 = 1, and x | 0 = x), executing this operation once or ten times guarantees the interrupt stays enabled while all other controller bits remain completely untouched.',
            formula: '(REG | MASK) | MASK == REG | MASK (Idempotent Bitmask)',
            metrics: [
                { id: 'reg_hex', label: 'Register Hex (MMIO)', value: '0x21' },
                { id: 'reg_bin', label: 'Register Binary [7..0]', value: '0010 0001b' },
                { id: 'target_bit', label: 'Bit 3 (ETH_RX)', value: '0 (DISABLED)' },
                { id: 'writes_applied', label: 'Mask Writes (*reg |= 0x08)', value: 0 },
                { id: 'other_altered', label: 'Other Bits Altered', value: '0' },
            ],
            buttons: [
                {
                    id: 'apply_mask_1x',
                    label: 'Write Mask: *reg |= (1 << 3) (1x)',
                    subLabel: 'Standard kernel IRQ enable',
                    variant: 'primary',
                    icon: '⚡',
                },
                {
                    id: 'apply_mask_10x',
                    label: 'Spam Mask Write (10x Loop)',
                    subLabel: 'Verify bit stability & isolation',
                    variant: 'accent',
                    icon: '🔁',
                },
                {
                    id: 'clear_bit3',
                    label: 'Clear Bit 3: *reg &= ~0x08',
                    subLabel: 'Reset target bit to 0',
                    variant: 'danger',
                    icon: '0️⃣',
                },
                {
                    id: 'toggle_timer',
                    label: 'Toggle Bit 0 (Timer IRQ)',
                    subLabel: 'Simulate concurrent driver',
                    variant: 'secondary',
                    icon: '⏱️',
                },
                {
                    id: 'toggle_nvme',
                    label: 'Toggle Bit 5 (NVMe IRQ)',
                    subLabel: 'Simulate concurrent disk I/O',
                    variant: 'secondary',
                    icon: '💾',
                },
            ],
            infoNotes: [
                'Observe the focused MMIO write laser targeting Bit 3 exclusively: on repeated execution, Bit 3 stays 1 without moving, while bits 0, 1, 2, 4, 5, 6, 7 are 100% isolated.',
                'Binary mathematical identity: (R | M) | M = R | M.',
            ],
        };
    }
    getCameraPreset() {
        return {
            position: new THREE.Vector3(0, 5.5, 10.5),
            target: new THREE.Vector3(0, 0.8, 0),
        };
    }
}
//# sourceMappingURL=linux-simulation.js.map