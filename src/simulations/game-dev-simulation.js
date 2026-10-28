import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { sound } from '../core/sound.js';
export class GameDevSimulation extends BaseSimulation {
    id = 'gamedev';
    title = 'Game Dev: Non-Duplicated Loot Action';
    domain = 'Multiplayer Game Architecture & State Authority';
    // 3D Chest Model Elements
    chestGroup = new THREE.Group();
    chestBase = null;
    lidPivot = new THREE.Group();
    lockMesh = null;
    chestLight = null;
    altarPlatform = new THREE.Group();
    runeRing = null;
    lanternFires = [];
    lanternLights = [];
    // Single Reward Model (spawned exactly once!)
    rewardGroup = new THREE.Group();
    gemMesh = null;
    coinMeshes = [];
    isRewardActive = false;
    rewardScaleProgress = 0;
    // Chest Lid Physical State
    targetLidAngle = 0; // 0 = closed, ~1.85 rad = open
    currentLidAngle = 0;
    // Server state & Idempotency
    isChestOpened = false;
    rewardCount = 0;
    totalCommandsReceived = 0;
    duplicateCommandsBlocked = 0;
    playerGold = 0;
    playerGems = 0;
    processedTransactions = new Set();
    TRANSACTION_ID = 'tx_dungeon_chest_loot_77';
    // In-flight packets
    activePackets = [];
    async init() {
        this.buildAltarAndEnvironment();
        this.buildTreasureChest();
        this.buildRewardBundle();
        this.rootGroup.add(this.altarPlatform);
        this.rootGroup.add(this.chestGroup);
        this.rootGroup.add(this.rewardGroup);
        this.log('info', 'Game Server authority initialized. Chest locked, state machine ready.', 'INIT');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, 'Ready. Opening chest multiple times will not duplicate rewards.');
    }
    buildAltarAndEnvironment() {
        // Ancient stone dungeon altar
        const altarGeo = new THREE.CylinderGeometry(3.5, 4.0, 0.6, 8);
        const altarMat = new THREE.MeshStandardMaterial({
            color: 0x1f242d,
            roughness: 0.8,
            metalness: 0.2,
        });
        const altar = new THREE.Mesh(altarGeo, altarMat);
        altar.position.y = 0.3;
        altar.receiveShadow = true;
        this.altarPlatform.add(altar);
        // Glowing mystic rune ring
        const runeRingGeo = new THREE.RingGeometry(2.6, 2.75, 32);
        const runeRingMat = new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
        });
        const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
        runeRing.rotation.x = -Math.PI / 2;
        runeRing.position.y = 0.61;
        this.runeRing = runeRing;
        this.altarPlatform.add(runeRing);
        // 4 Corner stone lanterns
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2 + Math.PI / 4;
            const x = Math.cos(angle) * 3.2;
            const z = Math.sin(angle) * 3.2;
            const postGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
            const postMat = new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.9 });
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(x, 0.9, z);
            this.altarPlatform.add(post);
            const fireGeo = new THREE.SphereGeometry(0.15, 8, 8);
            const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
            const fire = new THREE.Mesh(fireGeo, fireMat);
            fire.position.set(x, 1.6, z);
            this.altarPlatform.add(fire);
            this.lanternFires.push(fire);
            const lanternLight = new THREE.PointLight(0xff8800, 0.8, 6);
            lanternLight.position.set(x, 1.7, z);
            this.altarPlatform.add(lanternLight);
            this.lanternLights.push(lanternLight);
        }
    }
    buildTreasureChest() {
        this.chestGroup.position.set(0, 0.6, 0);
        // 1. Chest Main Box (Bottom half)
        const baseWidth = 2.4;
        const baseHeight = 1.1;
        const baseDepth = 1.6;
        const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, baseDepth);
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x4a2c11,
            roughness: 0.7,
            metalness: 0.1,
        });
        this.chestBase = new THREE.Mesh(baseGeo, woodMat);
        this.chestBase.position.y = baseHeight / 2;
        this.chestBase.castShadow = true;
        this.chestBase.receiveShadow = true;
        this.chestGroup.add(this.chestBase);
        // Gold metal reinforcement bands
        const bandMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.85,
            roughness: 0.25,
        });
        [-0.8, 0.8].forEach((xOffset) => {
            const bandGeo = new THREE.BoxGeometry(0.18, baseHeight + 0.02, baseDepth + 0.04);
            const band = new THREE.Mesh(bandGeo, bandMat);
            band.position.set(xOffset, baseHeight / 2, 0);
            this.chestGroup.add(band);
        });
        // 2. Chest Lid (Hinged pivot at back-top edge)
        // Pivot located at back-top: y = baseHeight, z = -baseDepth / 2
        this.lidPivot.position.set(0, baseHeight, -baseDepth / 2);
        this.chestGroup.add(this.lidPivot);
        const lidHalfCylGeo = new THREE.CylinderGeometry(baseDepth / 2, baseDepth / 2, baseWidth, 24, 1, false, 0, Math.PI);
        lidHalfCylGeo.rotateZ(Math.PI / 2);
        lidHalfCylGeo.rotateY(Math.PI / 2);
        const lidMesh = new THREE.Mesh(lidHalfCylGeo, woodMat);
        lidMesh.position.set(0, 0, baseDepth / 2);
        lidMesh.castShadow = true;
        this.lidPivot.add(lidMesh);
        // Gold bands on lid
        [-0.8, 0.8].forEach((xOffset) => {
            const lidBandGeo = new THREE.CylinderGeometry(baseDepth / 2 + 0.02, baseDepth / 2 + 0.02, 0.18, 24, 1, false, 0, Math.PI);
            lidBandGeo.rotateZ(Math.PI / 2);
            lidBandGeo.rotateY(Math.PI / 2);
            const lidBand = new THREE.Mesh(lidBandGeo, bandMat);
            lidBand.position.set(xOffset, 0, baseDepth / 2);
            this.lidPivot.add(lidBand);
        });
        // 3. Golden front latch/lock
        const lockGeo = new THREE.BoxGeometry(0.35, 0.45, 0.15);
        this.lockMesh = new THREE.Mesh(lockGeo, bandMat);
        this.lockMesh.position.set(0, -0.15, baseDepth + 0.05);
        this.lidPivot.add(this.lockMesh);
        // 4. Interior golden ambient glow light
        this.chestLight = new THREE.PointLight(0xffd700, 0, 8);
        this.chestLight.position.set(0, baseHeight + 0.2, 0);
        this.chestGroup.add(this.chestLight);
    }
    buildRewardBundle() {
        this.rewardGroup.position.set(0, 2.5, 0);
        // Large floating mythic gem
        const gemGeo = new THREE.OctahedronGeometry(0.65, 0);
        const gemMat = new THREE.MeshStandardMaterial({
            color: 0x9333ea,
            emissive: 0x7e22ce,
            emissiveIntensity: 0.8,
            roughness: 0.1,
            metalness: 0.9,
        });
        this.gemMesh = new THREE.Mesh(gemGeo, gemMat);
        this.rewardGroup.add(this.gemMesh);
        // Orbiting gold coins
        const coinGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 16);
        const coinMat = new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            metalness: 0.95,
            roughness: 0.2,
            emissive: 0xd97706,
            emissiveIntensity: 0.3,
        });
        const numCoins = 8;
        for (let i = 0; i < numCoins; i++) {
            const coin = new THREE.Mesh(coinGeo, coinMat);
            coin.rotation.x = Math.PI / 2;
            this.rewardGroup.add(coin);
            this.coinMeshes.push(coin);
        }
        // Hide reward initially
        this.rewardGroup.scale.set(0.0001, 0.0001, 0.0001);
        this.isRewardActive = false;
    }
    /**
     * Sends player command to open the chest.
     */
    sendOpenCommand(delayMs = 0) {
        setTimeout(() => {
            this.totalCommandsReceived++;
            // Create command packet traveling from player camera/left side to chest
            const packetGroup = new THREE.Group();
            const packetSphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
            packetGroup.add(packetSphere);
            packetGroup.position.set(-6, 3.5, 4);
            this.rootGroup.add(packetGroup);
            const packet = {
                id: `cmd_${Date.now()}_${Math.random()}`,
                mesh: packetGroup,
                startPos: new THREE.Vector3(-6, 3.5, 4),
                targetPos: new THREE.Vector3(0, 1.8, 0),
                progress: 0,
                speed: 1.1,
                txId: this.TRANSACTION_ID,
            };
            this.activePackets.push(packet);
            sound.playPacketSend();
            this.log('info', `Player Client: Sent CMD_OPEN_CHEST [TxID: ${this.TRANSACTION_ID}]`, 'NETWORK_CMD');
            this.updateHUDMetrics();
        }, delayMs);
    }
    /**
     * Simulates connection oscillation: sends the open command twice in rapid succession.
     */
    simulateNetworkOscillation() {
        this.log('warn', 'Simulating network oscillation: dispatching 2 duplicate OPEN packets 280ms apart...', 'OSCILLATION');
        this.sendOpenCommand(0);
        this.sendOpenCommand(280);
    }
    /**
     * Stress-test with 5 rapid commands.
     */
    spamCommands() {
        this.log('warn', 'Simulating severe connection stutter: firing 5 repeated commands...', 'STORM');
        for (let i = 0; i < 5; i++) {
            this.sendOpenCommand(i * 150);
        }
    }
    /**
     * Executes when a command packet physically reaches the chest.
     */
    onCommandArrival(packet) {
        const tx = packet.txId;
        if (!this.processedTransactions.has(tx)) {
            // 1. First execution: Chest is opened and reward granted!
            this.processedTransactions.add(tx);
            this.isChestOpened = true;
            this.targetLidAngle = -1.9; // Swing lid backwards ~110 degrees
            // Activate interior chest light
            if (this.chestLight) {
                this.chestLight.intensity = 2.8;
            }
            // Spawn reward
            this.isRewardActive = true;
            this.rewardScaleProgress = 0;
            this.rewardCount = 1;
            this.playerGold = 500;
            this.playerGems = 1;
            // Golden spark particles
            this.particles.emit({
                count: 80,
                origin: new THREE.Vector3(0, 1.8, 0),
                spread: 0.6,
                color: 0xffd700,
                size: 0.4,
                life: 1.5,
                velocity: new THREE.Vector3(0, 1.2, 0),
            });
            sound.playSuccess();
            this.log('success', `Game Server: Transaction [${tx}] verified. Chest OPENED! Granted +500 Gold, +1 Soul Gem (Loot Count: 1)`, 'LOOT_GRANTED');
        }
        else {
            // 2. Duplicate execution due to oscillation: Recognized and safely rejected!
            this.duplicateCommandsBlocked++;
            sound.playDeduplicateBlock();
            // Translucent deflection shield effect at chest
            this.particles.emit({
                count: 40,
                origin: new THREE.Vector3(0, 2.0, 0),
                spread: 0.8,
                color: 0xef4444, // Red deflection
                size: 0.35,
                life: 0.8,
                velocity: new THREE.Vector3(-0.8, 0.6, 0.8),
            });
            this.log('blocked', `Game Server: ALREADY_PROCESSED! Duplicate TxID [${tx}] ignored. Zero duplicate reward spawned.`, 'IDEMPOTENT_IGNORE');
        }
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, `Idempotency verified: ${this.totalCommandsReceived} command(s) arrived, reward granted strictly 1 time.`);
    }
    resetChest() {
        this.isChestOpened = false;
        this.targetLidAngle = 0;
        this.rewardCount = 0;
        this.playerGold = 0;
        this.playerGems = 0;
        this.isRewardActive = false;
        this.rewardScaleProgress = 0;
        this.rewardGroup.scale.set(0.0001, 0.0001, 0.0001);
        if (this.chestLight) {
            this.chestLight.intensity = 0;
        }
        this.activePackets.forEach((p) => this.sceneManager.disposeObject(p.mesh));
        this.activePackets = [];
        this.processedTransactions.clear();
        this.totalCommandsReceived = 0;
        this.duplicateCommandsBlocked = 0;
        sound.playHardwareReset();
        this.log('hardware', 'Chest closed, locked and refilled. State machine reset.', 'RESET');
        this.updateHUDMetrics();
        this.setIdempotentStatus(true, 'Ready. Opening chest multiple times will not duplicate rewards.');
    }
    update(delta, elapsed) {
        super.update(delta, elapsed);
        // Continuous idle ambiance
        if (this.runeRing) {
            this.runeRing.rotation.z += delta * 0.25;
        }
        // Lantern torch flickering
        this.lanternFires.forEach((fire, i) => {
            const sY = 1.0 + Math.sin(elapsed * 14.0 + i) * 0.28;
            const sXZ = 1.0 + Math.cos(elapsed * 11.0 + i) * 0.2;
            fire.scale.set(sXZ, sY, sXZ);
        });
        this.lanternLights.forEach((light, i) => {
            light.intensity = 0.8 + Math.sin(elapsed * 16.0 + i * 2) * 0.35;
        });
        // Chest subtle breathing bob
        this.chestGroup.position.y = 0.6 + Math.sin(elapsed * 2.2) * 0.03;
        // Ambient floating embers
        if (Math.random() < 0.25) {
            const idx = Math.floor(Math.random() * 4);
            const angle = (idx * Math.PI) / 2 + Math.PI / 4;
            const x = Math.cos(angle) * 3.2;
            const z = Math.sin(angle) * 3.2;
            this.particles.emit({
                count: 1,
                origin: new THREE.Vector3(x, 1.7, z),
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2),
                color: 0xffaa00,
                size: 0.2,
                life: 1.2,
            });
        }
        // Smooth physical lid rotation
        this.currentLidAngle += (this.targetLidAngle - this.currentLidAngle) * Math.min(1.0, delta * 6.0);
        this.lidPivot.rotation.x = this.currentLidAngle;
        // Animate active packets
        for (let i = this.activePackets.length - 1; i >= 0; i--) {
            const p = this.activePackets[i];
            p.progress += delta * p.speed;
            if (p.progress >= 1.0) {
                this.onCommandArrival(p);
                this.sceneManager.disposeObject(p.mesh);
                this.activePackets.splice(i, 1);
                continue;
            }
            // Linear flight with slight arc
            const t = p.progress;
            p.mesh.position.lerpVectors(p.startPos, p.targetPos, t);
            p.mesh.position.y += Math.sin(t * Math.PI) * 1.2;
            if (Math.random() < 0.4) {
                this.particles.emit({
                    count: 1,
                    origin: p.mesh.position,
                    spread: 0.05,
                    color: 0xffaa00,
                    size: 0.2,
                    life: 0.35,
                });
            }
        }
        // Animate reward gem & orbiting coins
        if (this.isRewardActive) {
            if (this.rewardScaleProgress < 1.0) {
                this.rewardScaleProgress = Math.min(1.0, this.rewardScaleProgress + delta * 2.0);
                const s = this.rewardScaleProgress;
                this.rewardGroup.scale.set(s, s, s);
            }
            if (this.gemMesh) {
                this.gemMesh.rotation.y += delta * 1.5;
                this.gemMesh.rotation.z = Math.sin(elapsed * 2) * 0.2;
            }
            // Orbit coins around gem
            const orbitRadius = 1.35;
            for (let i = 0; i < this.coinMeshes.length; i++) {
                const angle = elapsed * 2.2 + (i * 2 * Math.PI) / this.coinMeshes.length;
                const c = this.coinMeshes[i];
                c.position.set(Math.cos(angle) * orbitRadius, Math.sin(elapsed * 3 + i) * 0.15, Math.sin(angle) * orbitRadius);
                c.rotation.y += delta * 3;
            }
            this.rewardGroup.position.y = 2.5 + Math.sin(elapsed * 2.8) * 0.15;
        }
    }
    updateHUDMetrics() {
        this.updateMetrics([
            {
                id: 'chest_status',
                label: 'Chest Physical State',
                value: this.isChestOpened ? 'OPENED' : 'LOCKED',
                status: this.isChestOpened ? 'success' : 'nominal',
                highlight: true,
            },
            {
                id: 'commands_recvd',
                label: 'Open Commands Arrived',
                value: this.totalCommandsReceived,
            },
            {
                id: 'duplicates_blocked',
                label: 'Duplicate Commands Blocked',
                value: this.duplicateCommandsBlocked,
                status: this.duplicateCommandsBlocked > 0 ? 'success' : 'nominal',
            },
            {
                id: 'reward_count',
                label: 'Reward Spawns Granted',
                value: `${this.rewardCount}x (Strictly Single)`,
                highlight: true,
                status: this.rewardCount === 1 ? 'success' : 'nominal',
            },
            {
                id: 'player_inventory',
                label: 'Player Balance',
                value: `${this.playerGold} Gold | ${this.playerGems} Gem`,
            },
        ]);
    }
    onControlAction(actionId) {
        switch (actionId) {
            case 'open_1x':
                this.sendOpenCommand(0);
                break;
            case 'oscillate_2x':
                this.simulateNetworkOscillation();
                break;
            case 'spam_5x':
                this.spamCommands();
                break;
            case 'reset_chest':
                this.resetChest();
                break;
            default:
                console.warn('Unknown action:', actionId);
        }
    }
    getHUDConfig() {
        return {
            title: 'Game Dev: Loot Command Idempotency',
            domain: 'Multiplayer Game Architecture & Exploitation Prevention',
            conceptSummary: 'In online multiplayer games, erratic network packet echoes can send the "open chest" RPC twice. Idempotency guarantees that the authoritative game server records transaction state: the chest opens once, and the reward is granted strictly once, preventing infinite-gold duplication exploits.',
            formula: 'openChest(tx_01) -> [Reward x1]; openChest(tx_01) -> [NO-OP]',
            metrics: [
                { id: 'chest_status', label: 'Chest Physical State', value: 'LOCKED' },
                { id: 'commands_recvd', label: 'Open Commands Arrived', value: 0 },
                { id: 'duplicates_blocked', label: 'Duplicate Commands Blocked', value: 0 },
                { id: 'reward_count', label: 'Reward Spawns Granted', value: '0x' },
                { id: 'player_inventory', label: 'Player Balance', value: '0 Gold | 0 Gem' },
            ],
            buttons: [
                {
                    id: 'open_1x',
                    label: 'Open Chest (1x)',
                    subLabel: 'Normal player interaction',
                    variant: 'primary',
                    icon: '🗝️',
                },
                {
                    id: 'oscillate_2x',
                    label: 'Simulate Oscillation (2x Packets)',
                    subLabel: 'Network lag echo test',
                    variant: 'accent',
                    icon: '⚡',
                },
                {
                    id: 'spam_5x',
                    label: 'Spam Retransmit (5x Bursts)',
                    subLabel: 'Duplication exploit attempt',
                    variant: 'secondary',
                    icon: '💥',
                },
                {
                    id: 'reset_chest',
                    label: 'Lock & Refill Chest',
                    subLabel: 'Reset state machine',
                    variant: 'danger',
                    icon: '🔄',
                },
            ],
            infoNotes: [
                'Watch the second packet bounce off the chest: The authoritative server recognizes transaction tx_dungeon_chest_loot_77 has already been fulfilled.',
                'Player inventory is locked at 500 gold; no item duplication is possible.',
            ],
        };
    }
    getCameraPreset() {
        return {
            position: new THREE.Vector3(0, 6, 12),
            target: new THREE.Vector3(0, 1.6, 0),
        };
    }
}
//# sourceMappingURL=game-dev-simulation.js.map