import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { CameraPreset } from '../core/scene-manager.js';
import { HUDConfig, SimulationId } from '../core/types.js';
import { sound } from '../core/sound.js';

interface ElectricalPulse {
  mesh: THREE.Mesh;
  progress: number;
  speed: number;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
}

export class IoTSimulation extends BaseSimulation {
  public readonly id: SimulationId = 'iot';
  public readonly title = 'IoT: Water Valve Actuator Idempotency';
  public readonly domain = 'Embedded Systems & Industrial IoT Telemetry';

  // 3D Pipe & Valve Components
  private pipeGroup: THREE.Group = new THREE.Group();
  private valveHandle: THREE.Group = new THREE.Group();
  private actuatorLED: THREE.Mesh | null = null;
  private pressureNeedle: THREE.Group = new THREE.Group();
  private transparentTube: THREE.Mesh | null = null;
  private signalWirePath: THREE.Line | null = null;
  private antennaRing: THREE.Mesh | null = null;

  // Physical Valve State (Absolute state machine: ON | OFF)
  private isValveOn: boolean = false;
  private targetAngle: number = 0; // 0 = Closed (across), Math.PI / 2 = Open (aligned)
  private currentAngle: number = 0;
  private flowIntensity: number = 0; // 0 to 1
  private pressurePsi: number = 0;

  // Signal stats
  private totalSignalsReceived: number = 0;
  private signalsAbsorbed: number = 0;
  private stateTransitions: number = 0;
  private activePulses: ElectricalPulse[] = [];

  // Water particles inside pipe
  private waterFlowRate: number = 0;

  public async init(): Promise<void> {
    this.buildIndustrialEnvironment();
    this.buildPipeSystem();
    this.buildActuatorAndHandle();
    this.buildPressureGauge();
    this.buildSignalConduit();

    this.rootGroup.add(this.pipeGroup);

    this.log('info', 'IoT Valve Controller online. Actuator ready. Default state: CLOSED (OFF).', 'INIT');
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Ready. Transmitting "Turn On" sets state to ON without toggling or side effects.');
  }

  private buildIndustrialEnvironment(): void {
    // Industrial metal mounting frame
    const frameGeo = new THREE.BoxGeometry(14, 0.4, 4);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1b2028,
      metalness: 0.8,
      roughness: 0.3,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0.2;
    frame.receiveShadow = true;
    this.pipeGroup.add(frame);

    // Hazard yellow/black warning stripes along frame edges
    const stripeGeo = new THREE.PlaneGeometry(13.8, 0.2);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.41, 1.8);
    this.pipeGroup.add(stripe);
  }

  private buildPipeSystem(): void {
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.9,
      roughness: 0.25,
    });

    // Inflow Pipe (Left, -6 to -1.5)
    const inPipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.5, 32);
    inPipeGeo.rotateZ(Math.PI / 2);
    const inPipe = new THREE.Mesh(inPipeGeo, pipeMat);
    inPipe.position.set(-3.75, 2.0, 0);
    this.pipeGroup.add(inPipe);

    // Pipe Flange Rings
    [-5.8, -1.6, 1.6, 5.8].forEach((x) => {
      const flangeGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.15, 32);
      flangeGeo.rotateZ(Math.PI / 2);
      const flange = new THREE.Mesh(flangeGeo, pipeMat);
      flange.position.set(x, 2.0, 0);
      this.pipeGroup.add(flange);
    });

    // Outflow Pipe (Right, 1.5 to 6)
    const outPipeGeo = new THREE.CylinderGeometry(0.5, 0.5, 4.5, 32);
    outPipeGeo.rotateZ(Math.PI / 2);
    const outPipe = new THREE.Mesh(outPipeGeo, pipeMat);
    outPipe.position.set(3.75, 2.0, 0);
    this.pipeGroup.add(outPipe);

    // Transparent Flow Tube (Center inspection window, -1.5 to 1.5)
    const tubeGeo = new THREE.CylinderGeometry(0.48, 0.48, 3.0, 32);
    tubeGeo.rotateZ(Math.PI / 2);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      transmission: 0.85,
      opacity: 0.4,
      transparent: true,
      roughness: 0.1,
      metalness: 0.1,
      ior: 1.33,
    });
    this.transparentTube = new THREE.Mesh(tubeGeo, tubeMat);
    this.transparentTube.position.set(0, 2.0, 0);
    this.pipeGroup.add(this.transparentTube);
  }

  private buildActuatorAndHandle(): void {
    // Valve body central sphere/housing
    const housingGeo = new THREE.SphereGeometry(0.85, 32, 16);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      metalness: 0.7,
      roughness: 0.3,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(0, 2.0, 0);
    this.pipeGroup.add(housing);

    // Actuator motor box on top
    const motorGeo = new THREE.BoxGeometry(1.2, 1.1, 1.0);
    const motorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.2,
    });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(0, 3.1, 0);
    this.pipeGroup.add(motor);

    // Status LED on Actuator
    const ledGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // Red = OFF
    this.actuatorLED = new THREE.Mesh(ledGeo, ledMat);
    this.actuatorLED.position.set(0, 3.5, 0.52);
    this.pipeGroup.add(this.actuatorLED);

    // Actuator Rotary Valve Handle / Lever
    // Pivot at (0, 3.8, 0)
    this.valveHandle.position.set(0, 3.8, 0);
    this.pipeGroup.add(this.valveHandle);

    // Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.y = -0.15;
    this.valveHandle.add(shaft);

    // Quarter-turn lever arm
    const leverGeo = new THREE.BoxGeometry(0.18, 0.15, 1.6);
    const leverMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.85,
      roughness: 0.25,
    });
    const lever = new THREE.Mesh(leverGeo, leverMat);
    lever.position.set(0, 0.1, 0.6);
    this.valveHandle.add(lever);

    // Lever knob
    const knobGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xb45309 });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, 0.1, 1.4);
    this.valveHandle.add(knob);

    // Initial orientation: perpendicular to pipe = 0 rad
    this.valveHandle.rotation.y = 0;
  }

  private buildPressureGauge(): void {
    const gaugeGroup = new THREE.Group();
    gaugeGroup.position.set(-2.0, 2.9, 0.4);

    // Dial dial plate
    const dialGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 32);
    dialGeo.rotateX(Math.PI / 2);
    const dialMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const dial = new THREE.Mesh(dialGeo, dialMat);
    gaugeGroup.add(dial);

    // Face
    const faceGeo = new THREE.CircleGeometry(0.38, 32);
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.position.z = 0.06;
    gaugeGroup.add(face);

    // Needle pivot
    this.pressureNeedle.position.set(0, 0, 0.08);
    const needleGeo = new THREE.BoxGeometry(0.04, 0.3, 0.01);
    needleGeo.translate(0, 0.12, 0);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });
    const needleMesh = new THREE.Mesh(needleGeo, needleMat);
    this.pressureNeedle.add(needleMesh);
    gaugeGroup.add(this.pressureNeedle);

    this.pipeGroup.add(gaugeGroup);
  }

  private buildSignalConduit(): void {
    // Control wire path from left IoT antenna module to actuator
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-6, 4.0, 0),
      new THREE.Vector3(-4, 4.0, 0),
      new THREE.Vector3(-2, 3.8, 0),
      new THREE.Vector3(0, 3.6, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(30));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    this.signalWirePath = new THREE.Line(lineGeo, lineMat);
    this.pipeGroup.add(this.signalWirePath);

    // Antenna mast at (-6, 2.0, 0)
    const mastGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.2, 16);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(-6, 3.1, 0);
    this.pipeGroup.add(mast);

    // Antenna emitter tip
    const tipGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(-6, 4.2, 0);
    this.pipeGroup.add(tip);

    // Wireless radar wave pulse ring
    const radarGeo = new THREE.RingGeometry(0.2, 0.28, 32);
    const radarMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    this.antennaRing = new THREE.Mesh(radarGeo, radarMat);
    this.antennaRing.rotation.x = -Math.PI / 2;
    this.antennaRing.position.set(-6, 4.2, 0);
    this.pipeGroup.add(this.antennaRing);
  }

  /**
   * Transmits electrical "TURN ON" command to the valve actuator.
   */
  public sendTurnOnSignal(delayMs: number = 0): void {
    setTimeout(() => {
      this.totalSignalsReceived++;

      // Create glowing electrical pulse mesh
      const pulseGeo = new THREE.SphereGeometry(0.18, 16, 16);
      const pulseMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
      pulseMesh.position.set(-6, 4.2, 0);
      this.pipeGroup.add(pulseMesh);

      const pulse: ElectricalPulse = {
        mesh: pulseMesh,
        progress: 0,
        speed: 1.4,
        startPos: new THREE.Vector3(-6, 4.2, 0),
        targetPos: new THREE.Vector3(0, 3.6, 0),
      };

      this.activePulses.push(pulse);
      sound.playPacketSend();

      this.log('info', 'IoT Gateway -> Signal: SET_VALVE_STATE(state=ON)', 'SIGNAL_TX');
      this.updateHUDMetrics();
    }, delayMs);
  }

  /**
   * Simulates lossy wireless RF retransmitting the signal 5 times in a burst.
   */
  public retransmitBurst(count: number = 5): void {
    this.log(
      'warn',
      `RF Mesh Retransmission: Sending ${count} duplicate electrical signals due to lossy channel...`,
      'RF_RETRANSMIT'
    );
    for (let i = 0; i < count; i++) {
      this.sendTurnOnSignal(i * 140);
    }
  }

  /**
   * High repetition retransmission loop (10x).
   */
  public retransmitLoop10x(): void {
    this.retransmitBurst(10);
  }

  /**
   * When electrical signal arrives at the actuator solenoid.
   */
  private onSignalArrival(pulse: ElectricalPulse): void {
    if (!this.isValveOn) {
      // 1. Initial execution: Valve switches from OFF to ON!
      this.isValveOn = true;
      this.targetAngle = Math.PI / 2; // 90 degrees (open along pipe axis)
      this.stateTransitions++;

      if (this.actuatorLED) {
        (this.actuatorLED.material as THREE.MeshBasicMaterial).color.setHex(0x10b981); // Bright green
      }

      sound.playValveAction();
      this.log(
        'success',
        'Actuator: State changed: OFF -> ON. Solenoid energized, valve rotated to 90.0° (OPEN).',
        'STATE_ON'
      );
    } else {
      // 2. Subsequent retransmissions: State is ALREADY ON!
      // Absolute assignment: valve.state = ON. No toggling, no flicker!
      this.signalsAbsorbed++;
      sound.playDeduplicateBlock();

      // Harmless grounding spark at actuator terminal
      this.particles.emit({
        count: 25,
        origin: new THREE.Vector3(0, 3.6, 0),
        spread: 0.3,
        color: 0x38bdf8,
        size: 0.25,
        life: 0.6,
        velocity: new THREE.Vector3(0, 0.4, 0),
      });

      this.log(
        'blocked',
        'Actuator: Signal absorbed harmlessly (State already target: ON). No toggle, zero flicker.',
        'IDEMPOTENT_ABSORB'
      );
    }

    this.updateHUDMetrics();
    this.setIdempotentStatus(
      true,
      `Idempotency preserved: ${this.totalSignalsReceived} electrical signals arrived; valve remains stably ON (no oscillation).`
    );
  }

  /**
   * Explicitly resets the valve to OFF.
   */
  public resetToOff(): void {
    this.isValveOn = false;
    this.targetAngle = 0;
    this.totalSignalsReceived = 0;
    this.signalsAbsorbed = 0;
    this.stateTransitions = 0;

    if (this.actuatorLED) {
      (this.actuatorLED.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
    }

    this.activePulses.forEach((p) => this.sceneManager.disposeObject(p.mesh));
    this.activePulses = [];

    sound.playHardwareReset();
    this.log('hardware', 'Valve manually closed: State set to OFF (0.0°). System ready for retransmission testing.', 'MANUAL_OFF');
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Ready. Transmitting "Turn On" sets state to ON without toggling or side effects.');
  }

  public override update(delta: number, elapsed: number): void {
    super.update(delta, elapsed);

    // Antenna wireless radar pulse wave animation
    if (this.antennaRing) {
      const radarCycle = (elapsed * 1.5) % 1.0;
      const s = 1.0 + radarCycle * 5.0;
      this.antennaRing.scale.set(s, s, s);
      (this.antennaRing.material as THREE.MeshBasicMaterial).opacity = (1.0 - radarCycle) * 0.75;
    }

    // Actuator status LED breathing
    if (this.actuatorLED) {
      const ledPulse = 1.0 + Math.sin(elapsed * 5.0) * 0.12;
      this.actuatorLED.scale.set(ledPulse, ledPulse, ledPulse);
    }

    // Standby fluid particles when closed
    if (this.flowIntensity <= 0.05 && Math.random() < 0.15) {
      this.particles.emit({
        count: 1,
        origin: new THREE.Vector3(-1.8, 2.0 + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2),
        color: 0x38bdf8,
        size: 0.18,
        life: 0.6,
        velocity: new THREE.Vector3(0.2, 0, 0),
      });
    }

    // Smooth mechanical servo handle rotation
    this.currentAngle += (this.targetAngle - this.currentAngle) * Math.min(1.0, delta * 5.0);
    this.valveHandle.rotation.y = this.currentAngle;

    // Physical fluid flow interpolation based on valve angle
    const openFraction = this.currentAngle / (Math.PI / 2);
    this.flowIntensity += (openFraction - this.flowIntensity) * Math.min(1.0, delta * 4.0);
    this.waterFlowRate = Math.round(this.flowIntensity * 120); // 0 to 120 L/min
    this.pressurePsi = Math.round(this.flowIntensity * 65); // 0 to 65 PSI

    // Gauge needle rotation: 0 PSI = 2.4 rad, 65 PSI = -2.4 rad
    const needleAngle = 2.2 - this.flowIntensity * 4.4;
    this.pressureNeedle.rotation.z = needleAngle;

    // Emit water stream particles through transparent pipe chamber when flowing
    if (this.flowIntensity > 0.05) {
      const emitCount = Math.floor(this.flowIntensity * 4);
      for (let k = 0; k < emitCount; k++) {
        this.particles.emit({
          count: 1,
          origin: new THREE.Vector3(-1.4, 2.0 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4),
          spread: 0.1,
          color: 0x38bdf8,
          size: 0.28,
          life: 0.8,
          velocity: new THREE.Vector3(4.5 * this.flowIntensity, 0, 0),
        });
      }
    }

    // Animate active electrical pulses
    for (let i = this.activePulses.length - 1; i >= 0; i--) {
      const p = this.activePulses[i];
      p.progress += delta * p.speed;

      if (p.progress >= 1.0) {
        this.onSignalArrival(p);
        this.sceneManager.disposeObject(p.mesh);
        this.activePulses.splice(i, 1);
        continue;
      }

      p.mesh.position.lerpVectors(p.startPos, p.targetPos, p.progress);
    }
  }

  private updateHUDMetrics(): void {
    const angleDeg = ((this.currentAngle * 180) / Math.PI).toFixed(1);
    this.updateMetrics([
      {
        id: 'valve_state',
        label: 'Valve Physical State',
        value: this.isValveOn ? 'ON (OPEN)' : 'OFF (CLOSED)',
        status: this.isValveOn ? 'success' : 'nominal',
        highlight: true,
      },
      {
        id: 'handle_angle',
        label: 'Handle Angle',
        value: `${angleDeg}°`,
      },
      {
        id: 'signals_received',
        label: 'Signals Transmitted',
        value: this.totalSignalsReceived,
      },
      {
        id: 'signals_absorbed',
        label: 'Retransmissions Absorbed',
        value: this.signalsAbsorbed,
        status: this.signalsAbsorbed > 0 ? 'success' : 'nominal',
      },
      {
        id: 'water_flow',
        label: 'Water Flow Rate',
        value: `${this.waterFlowRate} L/min`,
      },
      {
        id: 'state_transitions',
        label: 'State Transitions',
        value: `${this.stateTransitions} (Strictly 1)`,
        highlight: true,
      },
    ]);
  }

  public onControlAction(actionId: string): void {
    switch (actionId) {
      case 'signal_1x':
        this.sendTurnOnSignal(0);
        break;
      case 'retransmit_5x':
        this.retransmitBurst(5);
        break;
      case 'retransmit_10x':
        this.retransmitLoop10x();
        break;
      case 'reset_off':
        this.resetToOff();
        break;
      default:
        console.warn('Unknown action:', actionId);
    }
  }

  public getHUDConfig(): HUDConfig {
    return {
      title: 'IoT: Remote Water Valve Idempotency',
      domain: 'Industrial Internet of Things & Telemetry Actuation',
      conceptSummary:
        'In flaky wireless mesh networks, the control command "Turn ON Water Valve" is frequently retransmitted. An idempotent actuator treats this command as an absolute state assignment: setValveState(ON). Whether 1 or 10 signals arrive, the valve turns ON once and stays solidly ON — with zero flicker, zero toggling, and zero side effects.',
      formula: 'setValveState(ON); setValveState(ON) => state === ON (No Toggle)',
      metrics: [
        { id: 'valve_state', label: 'Valve Physical State', value: 'OFF (CLOSED)' },
        { id: 'handle_angle', label: 'Handle Angle', value: '0.0°' },
        { id: 'signals_received', label: 'Signals Transmitted', value: 0 },
        { id: 'signals_absorbed', label: 'Retransmissions Absorbed', value: 0 },
        { id: 'water_flow', label: 'Water Flow Rate', value: '0 L/min' },
        { id: 'state_transitions', label: 'State Transitions', value: '0' },
      ],
      buttons: [
        {
          id: 'signal_1x',
          label: 'Send "Turn On" Signal (1x)',
          subLabel: 'Standard RF command',
          variant: 'primary',
          icon: '⚡',
        },
        {
          id: 'retransmit_5x',
          label: 'Retransmit Burst (5x Pulses)',
          subLabel: 'Simulate RF mesh packet bounce',
          variant: 'accent',
          icon: '📡',
        },
        {
          id: 'retransmit_10x',
          label: 'Retransmit Storm (10x Loop)',
          subLabel: 'Stress-test physical stability',
          variant: 'secondary',
          icon: '🌊',
        },
        {
          id: 'reset_off',
          label: 'Reset Valve to OFF',
          subLabel: 'Close valve to re-test',
          variant: 'danger',
          icon: '🔄',
        },
      ],
      infoNotes: [
        'Notice how subsequent signals are absorbed with a blue grounding spark at the terminal without toggling the valve back to off.',
        'Contrast this with a non-idempotent "toggleValve()" command, which would cause dangerous valve chatter and water hammer damage!',
      ],
    };
  }

  public override getCameraPreset(): CameraPreset {
    return {
      position: new THREE.Vector3(0, 5.5, 11),
      target: new THREE.Vector3(0, 2.2, 0),
    };
  }
}

