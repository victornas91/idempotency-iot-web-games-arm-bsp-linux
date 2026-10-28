import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { CameraPreset } from '../core/scene-manager.js';
import { HUDConfig, SimulationId } from '../core/types.js';
import { sound } from '../core/sound.js';

interface RequestPacket {
  id: string;
  mesh: THREE.Group;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  curveControl: THREE.Vector3;
  progress: number;
  speed: number;
  isDuplicate: boolean;
  key: string;
}

export class FullstackSimulation extends BaseSimulation {
  public readonly id: SimulationId = 'fullstack';
  public readonly title = 'Fullstack 3D: Request Deduplication';
  public readonly domain = 'Fullstack Web 3D & API Architecture';

  // 3D Visual elements
  private clientGroup: THREE.Group = new THREE.Group();
  private serverGroup: THREE.Group = new THREE.Group();
  private networkHighway: THREE.Group = new THREE.Group();
  private assetPedestal: THREE.Group = new THREE.Group();
  private assetContainer: THREE.Group = new THREE.Group();
  private serverShield: THREE.Mesh | null = null;
  private clientRing: THREE.Mesh | null = null;
  private clientScreen: THREE.Mesh | null = null;
  private stageRing1: THREE.Mesh | null = null;
  private stageRing2: THREE.Mesh | null = null;
  private serverLeds: THREE.Mesh[] = [];

  // Active instantiated 3D asset (only one allowed!)
  private activeAsset: THREE.Group | null = null;
  private assetScaleProgress: number = 0;
  private isAssetLoading: boolean = false;

  // Network and idempotency state
  private activePackets: RequestPacket[] = [];
  private totalRequestsSent: number = 0;
  private duplicatesBlocked: number = 0;
  private serverCache: Map<string, { status: string; assetId: string; timestamp: number }> = new Map();
  private readonly IDEMPOTENCY_KEY = 'req_quantum_core_9801';

  public async init(): Promise<void> {
    this.buildClientTerminal();
    this.buildServerMonolith();
    this.buildNetworkHighway();
    this.buildAssetStage();

    this.rootGroup.add(this.clientGroup);
    this.rootGroup.add(this.serverGroup);
    this.rootGroup.add(this.networkHighway);
    this.rootGroup.add(this.assetPedestal);
    this.rootGroup.add(this.assetContainer);

    this.log('info', 'Fullstack 3D simulation initialized. Idempotent API ready.', 'INIT');
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Ready. Firing requests with same Idempotency-Key guarantees single asset.');
  }

  private buildClientTerminal(): void {
    this.clientGroup.position.set(-7, 0, 0);

    // Terminal base
    const baseGeo = new THREE.CylinderGeometry(1.6, 2.0, 0.4, 32);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.85,
      roughness: 0.25,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    base.receiveShadow = true;
    this.clientGroup.add(base);

    // Holographic emitter ring
    const ringGeo = new THREE.TorusGeometry(1.4, 0.05, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.42;
    this.clientGroup.add(ring);
    this.clientRing = ring;

    // Hologram screen plate
    const screenGeo = new THREE.PlaneGeometry(1.8, 1.2);
    const screenMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.8, 0);
    this.clientGroup.add(screen);
    this.clientScreen = screen;

    // Client label pillar
    const pillarGeo = new THREE.BoxGeometry(0.3, 1.4, 0.3);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.2 });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 0.9;
    this.clientGroup.add(pillar);
  }

  private buildServerMonolith(): void {
    this.serverGroup.position.set(7, 0, 0);

    // Server rack base
    const baseGeo = new THREE.CylinderGeometry(2.0, 2.4, 0.4, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.2 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.2;
    base.castShadow = true;
    this.serverGroup.add(base);

    // Dual server towers
    for (let i = -1; i <= 1; i += 2) {
      const towerGeo = new THREE.BoxGeometry(0.8, 3.2, 1.2);
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.9,
        roughness: 0.1,
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.set(i * 0.9, 1.8, 0);
      tower.castShadow = true;
      this.serverGroup.add(tower);

      // Blinking rack LED strips
      for (let j = 0; j < 6; j++) {
        const ledGeo = new THREE.BoxGeometry(0.05, 0.1, 0.9);
        const ledMat = new THREE.MeshBasicMaterial({
          color: j % 2 === 0 ? 0x00ff88 : 0x00d2ff,
        });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(i * 0.9 + (i > 0 ? -0.41 : 0.41), 0.8 + j * 0.35, 0);
        this.serverGroup.add(led);
        this.serverLeds.push(led);
      }
    }

    // Deduplication Shield / Gateway Ring
    const shieldGeo = new THREE.SphereGeometry(1.6, 32, 16);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      roughness: 0.1,
    });
    this.serverShield = new THREE.Mesh(shieldGeo, shieldMat);
    this.serverShield.position.set(0, 2.0, 0);
    this.serverGroup.add(this.serverShield);
  }

  private buildNetworkHighway(): void {
    // Elegant curved glowing transmission arcs
    const points: THREE.Vector3[] = [];
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-7, 1.8, 0),
      new THREE.Vector3(0, 4.2, -1.5),
      new THREE.Vector3(7, 2.0, 0)
    );
    const curvePoints = curve.getPoints(50);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.4,
    });
    const highwayLine = new THREE.Line(lineGeo, lineMat);
    this.networkHighway.add(highwayLine);
  }

  private buildAssetStage(): void {
    this.assetPedestal.position.set(0, 0, 1.5);

    // Glowing circular pedestal
    const stageGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.3, 48);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0x0a1122,
      metalness: 0.8,
      roughness: 0.2,
    });
    const stage = new THREE.Mesh(stageGeo, stageMat);
    stage.position.y = 0.15;
    stage.receiveShadow = true;
    this.assetPedestal.add(stage);

    // Concentric neon rings on the floor
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 1.9, 48),
      new THREE.MeshBasicMaterial({ color: 0x7c3aed, side: THREE.DoubleSide })
    );
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.31;
    this.assetPedestal.add(ring1);
    this.stageRing1 = ring1;

    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.26, 48),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide })
    );
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.31;
    this.assetPedestal.add(ring2);
    this.stageRing2 = ring2;

    this.assetContainer.position.set(0, 2.2, 1.5);
  }

  /**
   * Spawns an expressive, high-tech procedural 3D Quantum Core.
   */
  private instantiateUniqueAsset(): void {
    if (this.activeAsset) {
      // Hard idempotency guarantee: If already instantiated, ignore!
      return;
    }

    const group = new THREE.Group();

    // 1. Core faceted crystalline energy sphere
    const coreGeo = new THREE.IcosahedronGeometry(0.85, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a3ff,
      emissiveIntensity: 0.7,
      roughness: 0.1,
      metalness: 0.9,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.name = 'coreMesh';
    group.add(coreMesh);

    // 2. Outer holographic cage
    const cageGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const cageMat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      wireframe: true,
      roughness: 0.2,
      metalness: 1.0,
      emissive: 0x7c3aed,
      emissiveIntensity: 0.5,
    });
    const cageMesh = new THREE.Mesh(cageGeo, cageMat);
    cageMesh.name = 'cageMesh';
    group.add(cageMesh);

    // 3. Dual orbiting gyro rings
    const ringGeo1 = new THREE.TorusGeometry(1.6, 0.04, 16, 64);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
    const ringMesh1 = new THREE.Mesh(ringGeo1, ringMat1);
    ringMesh1.name = 'ring1';
    group.add(ringMesh1);

    const ringGeo2 = new THREE.TorusGeometry(1.9, 0.04, 16, 64);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xff0077 });
    const ringMesh2 = new THREE.Mesh(ringGeo2, ringMat2);
    ringMesh2.rotation.x = Math.PI / 3;
    ringMesh2.name = 'ring2';
    group.add(ringMesh2);

    // Beacon point light
    const assetLight = new THREE.PointLight(0x00f0ff, 2.5, 8);
    assetLight.position.set(0, 0, 0);
    group.add(assetLight);

    // Start with scale 0 and animate into scene
    group.scale.set(0.001, 0.001, 0.001);
    this.assetContainer.add(group);
    this.activeAsset = group;
    this.assetScaleProgress = 0;
    this.isAssetLoading = true;

    // Burst of spawn particles
    this.particles.emit({
      count: 90,
      origin: this.assetContainer.position,
      spread: 0.8,
      color: 0x00f0ff,
      size: 0.45,
      life: 1.4,
      velocity: new THREE.Vector3(0, 0.8, 0),
    });

    sound.playSuccess();
    this.log('success', 'Asset "QuantumCore#9801" successfully instantiated into 3D scene (Instance Count: 1)', 'INSTANTIATED');
  }

  /**
   * Fires an API request to load the 3D asset.
   */
  public fireRequest(delayMs: number = 0): void {
    setTimeout(() => {
      this.totalRequestsSent++;
      const packetGroup = new THREE.Group();

      // Glowing data sphere
      const sphereGeo = new THREE.SphereGeometry(0.24, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      packetGroup.add(sphere);

      // Trailing glow halo
      const haloGeo = new THREE.RingGeometry(0.3, 0.4, 16);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x7c3aed,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.rotation.x = Math.PI / 2;
      packetGroup.add(halo);

      packetGroup.position.set(-7, 1.8, 0);
      this.rootGroup.add(packetGroup);

      const isDuplicate = this.serverCache.has(this.IDEMPOTENCY_KEY);

      const packet: RequestPacket = {
        id: `pkt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        mesh: packetGroup,
        startPos: new THREE.Vector3(-7, 1.8, 0),
        targetPos: new THREE.Vector3(7, 2.0, 0),
        curveControl: new THREE.Vector3(0, 4.2 + (Math.random() - 0.5) * 0.8, -1.5),
        progress: 0,
        speed: 0.75 + (Math.random() - 0.5) * 0.1,
        isDuplicate,
        key: this.IDEMPOTENCY_KEY,
      };

      this.activePackets.push(packet);
      sound.playPacketSend();

      this.log(
        'info',
        `Client -> POST /api/v1/assets/load [Idempotency-Key: ${this.IDEMPOTENCY_KEY}]`,
        'REQUEST_SENT'
      );
      this.updateHUDMetrics();
    }, delayMs);
  }

  /**
   * Simulates rapid-fire lag bursts (e.g. 3 requests sent consecutively).
   */
  public fireRapidBurst(count: number = 3): void {
    this.log('warn', `Network lag simulation: firing ${count} rapid retransmissions...`, 'BURST_TRIGGER');
    for (let i = 0; i < count; i++) {
      this.fireRequest(i * 180); // Staggered by 180ms
    }
  }

  /**
   * Resets the entire scene, clears server cache and unloads asset.
   */
  public resetAssetScene(): void {
    if (this.activeAsset) {
      this.sceneManager.disposeObject(this.activeAsset);
      this.activeAsset = null;
    }
    this.activePackets.forEach((p) => {
      this.sceneManager.disposeObject(p.mesh);
    });
    this.activePackets = [];
    this.serverCache.clear();
    this.totalRequestsSent = 0;
    this.duplicatesBlocked = 0;

    this.log('hardware', 'Server cache cleared & 3D asset unloaded. Ready for new requests.', 'RESET');
    sound.playHardwareReset();
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Ready. Firing requests with same Idempotency-Key guarantees single asset.');
  }

  private onPacketArrival(packet: RequestPacket): void {
    const key = packet.key;

    if (!this.serverCache.has(key)) {
      // First arrival: Cache miss -> process and create asset!
      this.serverCache.set(key, {
        status: 'RESOLVED',
        assetId: 'quantum-core-9801',
        timestamp: Date.now(),
      });

      // Pulse server shield in green
      if (this.serverShield) {
        (this.serverShield.material as THREE.MeshStandardMaterial).color.setHex(0x00ff88);
        setTimeout(() => {
          if (this.serverShield) {
            (this.serverShield.material as THREE.MeshStandardMaterial).color.setHex(0x00ffff);
          }
        }, 300);
      }

      this.instantiateUniqueAsset();
      this.log('success', 'Server: 201 Created. Cache saved [Idempotency-Key verified].', 'CACHE_MISS');
    } else {
      // Duplicate arrival: Server collapses it!
      this.duplicatesBlocked++;
      sound.playDeduplicateBlock();

      // Pulse server shield amber
      if (this.serverShield) {
        (this.serverShield.material as THREE.MeshStandardMaterial).color.setHex(0xffaa00);
        setTimeout(() => {
          if (this.serverShield) {
            (this.serverShield.material as THREE.MeshStandardMaterial).color.setHex(0x00ffff);
          }
        }, 300);
      }

      // Visual fizzle out: particle dissolution at server gateway
      this.particles.emit({
        count: 45,
        origin: new THREE.Vector3(7, 2.0, 0),
        spread: 0.6,
        color: 0xffaa00,
        size: 0.35,
        life: 0.9,
        velocity: new THREE.Vector3(-1.2, 0.4, 0),
      });

      this.log(
        'blocked',
        `Server: 200 OK (CACHED). Duplicate packet merged & fizzled. Asset untouched!`,
        'IDEMPOTENT_MERGE'
      );
    }

    this.updateHUDMetrics();
    this.setIdempotentStatus(
      true,
      `Idempotency preserved: ${this.totalRequestsSent} request(s) resulted in strictly 1 asset instance.`
    );
  }

  public override update(delta: number, elapsed: number): void {
    super.update(delta, elapsed);

    // Animate active packets along Bezier curve
    for (let i = this.activePackets.length - 1; i >= 0; i--) {
      const p = this.activePackets[i];
      p.progress += delta * p.speed;

      if (p.progress >= 1.0) {
        this.onPacketArrival(p);
        this.sceneManager.disposeObject(p.mesh);
        this.activePackets.splice(i, 1);
        continue;
      }

      // Compute quadratic bezier point
      const t = p.progress;
      const x = (1 - t) * (1 - t) * p.startPos.x + 2 * (1 - t) * t * p.curveControl.x + t * t * p.targetPos.x;
      const y = (1 - t) * (1 - t) * p.startPos.y + 2 * (1 - t) * t * p.curveControl.y + t * t * p.targetPos.y;
      const z = (1 - t) * (1 - t) * p.startPos.z + 2 * (1 - t) * t * p.curveControl.z + t * t * p.targetPos.z;

      p.mesh.position.set(x, y, z);
      p.mesh.rotation.z += delta * 4;

      // Small trail particles
      if (Math.random() < 0.35) {
        this.particles.emit({
          count: 1,
          origin: p.mesh.position,
          spread: 0.05,
          color: p.isDuplicate ? 0xffaa00 : 0x00f0ff,
          size: 0.2,
          life: 0.4,
        });
      }
    }

    // Animate asset entrance & gyro spin
    if (this.activeAsset) {
      if (this.isAssetLoading) {
        this.assetScaleProgress = Math.min(1.0, this.assetScaleProgress + delta * 2.2);
        const s = this.easeOutBack(this.assetScaleProgress);
        this.activeAsset.scale.set(s, s, s);
        if (this.assetScaleProgress >= 1.0) {
          this.isAssetLoading = false;
        }
      }

      const core = this.activeAsset.getObjectByName('coreMesh');
      if (core) {
        core.rotation.y += delta * 1.2;
        core.rotation.x += delta * 0.6;
      }

      const cage = this.activeAsset.getObjectByName('cageMesh');
      if (cage) {
        cage.rotation.y -= delta * 0.8;
        cage.rotation.z += delta * 0.5;
      }

      const ring1 = this.activeAsset.getObjectByName('ring1');
      if (ring1) {
        ring1.rotation.z += delta * 1.5;
      }

      const ring2 = this.activeAsset.getObjectByName('ring2');
      if (ring2) {
        ring2.rotation.y += delta * 1.8;
      }

      // Gentle vertical floating bob
      this.assetContainer.position.y = 2.2 + Math.sin(elapsed * 2.5) * 0.12;
    }

    // Rotate server shield
    if (this.serverShield) {
      this.serverShield.rotation.y += delta * 0.8;
      const pulse = 1.0 + Math.sin(elapsed * 3.0) * 0.05;
      this.serverShield.scale.set(pulse, pulse, pulse);
    }

    // Continuous idle animations across the scene
    if (this.clientRing) {
      this.clientRing.rotation.z += delta * 1.2;
    }
    if (this.clientScreen) {
      this.clientScreen.position.y = 1.8 + Math.sin(elapsed * 2.5) * 0.06;
    }
    if (this.stageRing1) {
      this.stageRing1.rotation.z += delta * 0.4;
    }
    if (this.stageRing2) {
      this.stageRing2.rotation.z -= delta * 0.3;
    }

    // Blinking server LEDs
    this.serverLeds.forEach((led, idx) => {
      const blink = Math.sin(elapsed * 8.0 + idx * 1.5) > 0.2;
      (led.material as THREE.MeshBasicMaterial).color.setHex(blink ? (idx % 2 === 0 ? 0x00ff88 : 0x00d2ff) : 0x0f172a);
    });

    // Ambient floating data particles
    if (Math.random() < 0.2) {
      this.particles.emit({
        count: 1,
        origin: new THREE.Vector3(-7 + (Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5),
        velocity: new THREE.Vector3(0, 0.6, 0),
        spread: 0.1,
        color: 0x00f0ff,
        size: 0.25,
        life: 1.5,
      });
    }
    if (Math.random() < 0.2) {
      this.particles.emit({
        count: 1,
        origin: new THREE.Vector3(0 + (Math.random() - 0.5) * 2.0, 0.3, 1.5 + (Math.random() - 0.5) * 2.0),
        velocity: new THREE.Vector3(0, 0.5, 0),
        spread: 0.1,
        color: 0x7c3aed,
        size: 0.25,
        life: 1.8,
      });
    }
  }

  private easeOutBack(x: number): number {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  private updateHUDMetrics(): void {
    this.updateMetrics([
      {
        id: 'req_sent',
        label: 'Requests Sent',
        value: this.totalRequestsSent,
        highlight: true,
      },
      {
        id: 'in_flight',
        label: 'Packets In Flight',
        value: this.activePackets.length,
      },
      {
        id: 'duplicates_absorbed',
        label: 'Duplicates Blocked/Merged',
        value: this.duplicatesBlocked,
        status: this.duplicatesBlocked > 0 ? 'success' : 'nominal',
      },
      {
        id: 'asset_instances',
        label: 'Asset Instances in Scene',
        value: this.activeAsset ? '1 (Unique)' : '0 (None)',
        highlight: true,
        status: this.activeAsset ? 'success' : 'nominal',
      },
      {
        id: 'idempotency_key',
        label: 'Idempotency-Key',
        value: this.IDEMPOTENCY_KEY,
      },
    ]);
  }

  public onControlAction(actionId: string): void {
    switch (actionId) {
      case 'fire_1x':
        this.fireRequest(0);
        break;
      case 'rapid_fire_3x':
        this.fireRapidBurst(3);
        break;
      case 'rapid_fire_5x':
        this.fireRapidBurst(5);
        break;
      case 'reset_scene':
        this.resetAssetScene();
        break;
      default:
        console.warn('Unknown action:', actionId);
    }
  }

  public getHUDConfig(): HUDConfig {
    return {
      title: 'Fullstack 3D: API Request Deduplication',
      domain: 'Cloud Services & 3D Web Graphics',
      conceptSummary:
        'When an unstable network retransmits the asset creation request 3 times, an idempotent API uses a unique Idempotency-Key. The server fulfills the first request and safely collapses all subsequent retries, guaranteeing exactly 1 asset is instantiated in the 3D scene.',
      formula: 'f(req_key) == f(f(req_key)) => SceneInstances = 1',
      metrics: [
        { id: 'req_sent', label: 'Requests Sent', value: 0 },
        { id: 'in_flight', label: 'Packets In Flight', value: 0 },
        { id: 'duplicates_absorbed', label: 'Duplicates Blocked/Merged', value: 0 },
        { id: 'asset_instances', label: 'Asset Instances in Scene', value: '0 (None)' },
        { id: 'idempotency_key', label: 'Idempotency-Key', value: this.IDEMPOTENCY_KEY },
      ],
      buttons: [
        {
          id: 'fire_1x',
          label: 'Fire Request (1x)',
          subLabel: 'Normal API call',
          variant: 'primary',
          icon: '⚡',
        },
        {
          id: 'rapid_fire_3x',
          label: 'Rapid Fire (3x Lag Burst)',
          subLabel: 'Simulate connection retry loop',
          variant: 'accent',
          icon: '🚀',
        },
        {
          id: 'rapid_fire_5x',
          label: 'Burst Storm (5x Retries)',
          subLabel: 'Stress-test idempotency collapse',
          variant: 'secondary',
          icon: '🌪️',
        },
        {
          id: 'reset_scene',
          label: 'Unload & Clear Cache',
          subLabel: 'Reset scenario state',
          variant: 'danger',
          icon: '🔄',
        },
      ],
      infoNotes: [
        'Watch the packet trail: Duplicate packets reaching the server hit the Deduplication Gateway and visibly fizzle into amber particles.',
        'The server returns a cached 200 OK without re-running the asset instantiation factory.',
      ],
    };
  }

  public override getCameraPreset(): CameraPreset {
    return {
      position: new THREE.Vector3(0, 7.5, 15),
      target: new THREE.Vector3(0, 1.8, 0),
    };
  }
}

