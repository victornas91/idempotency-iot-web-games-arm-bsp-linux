import * as THREE from 'three';
import { BaseSimulation } from './base-simulation.js';
import { CameraPreset } from '../core/scene-manager.js';
import { HUDConfig, SimulationId } from '../core/types.js';
import { sound } from '../core/sound.js';

interface CPUBitCell {
  index: number;
  group: THREE.Group;
  latchCube: THREE.Mesh;
  valText: THREE.Mesh;
  led: THREE.Mesh;
  currentY: number;
  targetY: number;
  targetAngle: number;
  currentAngle: number;
}

export class CPUSimulation extends BaseSimulation {
  public readonly id: SimulationId = 'cpu';
  public readonly title = 'Computer Architecture: CPU SETB Instruction';
  public readonly domain = 'CPU Microarchitecture & Assembly Instructions';

  // 3D Microarchitecture Components
  private cpuChassis: THREE.Group = new THREE.Group();
  private bitCells: CPUBitCell[] = [];
  private aluPointer: THREE.Group = new THREE.Group();
  private pipelineLED: THREE.Mesh | null = null;

  // CPU Register R1 State (8-bit)
  // Initial state: 10000010b = 0x82 (Bit 7=1, Bit 1=1, Bit 4=0)
  private registerR1: number = 0x82;
  private readonly TARGET_BIT = 4; // Bit 4
  private readonly TARGET_MASK = 1 << 4; // 0x10 = 00010000b

  // Execution stats
  private executionCycles: number = 0;
  private currentOpcode: string = 'SETB R1.4';
  private opcodeHex: string = '0xD2';
  private isIdempotentOperation: boolean = true;
  private otherBitsAlteredCount: number = 0;

  // Visual pulses
  private aluPulseIntensity: number = 0;

  public async init(): Promise<void> {
    this.buildCPUDieChassis();
    this.buildRegisterBitCells();
    this.buildALUExecutionPointer();

    this.rootGroup.add(this.cpuChassis);

    this.log('info', 'CPU core clocked. Instruction decoder ready: SETB R1.4 (Opcode: 0xD2).', 'INIT');
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Ready. SETB R1.4 forces Bit 4 to 1; executing it repeatedly leaves R1 identical.');
  }

  private buildCPUDieChassis(): void {
    // CPU Silicon Die stage
    const dieGeo = new THREE.BoxGeometry(13.5, 0.45, 4.5);
    const dieMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.95,
      roughness: 0.15,
    });
    const die = new THREE.Mesh(dieGeo, dieMat);
    die.position.y = 0.22;
    die.receiveShadow = true;
    this.cpuChassis.add(die);

    // Silicon gold interconnect trace lines
    const traceMat = new THREE.MeshBasicMaterial({ color: 0xd97706 });
    for (let i = 0; i < 8; i++) {
      const x = (3.5 - i) * 1.5;
      const traceGeo = new THREE.BoxGeometry(0.04, 0.02, 3.8);
      const trace = new THREE.Mesh(traceGeo, traceMat);
      trace.position.set(x, 0.46, 0);
      this.cpuChassis.add(trace);
    }

    // Pipeline Clock LED
    const clockHolderGeo = new THREE.BoxGeometry(1.2, 0.3, 0.5);
    const clockHolderMat = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
    const clockHolder = new THREE.Mesh(clockHolderGeo, clockHolderMat);
    clockHolder.position.set(0, 0.5, -1.8);
    this.cpuChassis.add(clockHolder);

    const ledGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    this.pipelineLED = new THREE.Mesh(ledGeo, ledMat);
    this.pipelineLED.position.set(0, 0.68, -1.8);
    this.cpuChassis.add(this.pipelineLED);
  }

  private buildRegisterBitCells(): void {
    for (let i = 7; i >= 0; i--) {
      const isTarget = i === this.TARGET_BIT;
      const xOffset = (3.5 - i) * 1.5;

      const group = new THREE.Group();
      group.position.set(xOffset, 0.45, 0);

      // Bistable mechanical latch block
      const cubeGeo = new THREE.BoxGeometry(1.15, 0.9, 1.2);
      const isBitActive = (this.registerR1 & (1 << i)) !== 0;
      const cubeMat = new THREE.MeshStandardMaterial({
        color: isTarget ? 0xd97706 : isBitActive ? 0x10b981 : 0x1e293b,
        metalness: 0.85,
        roughness: 0.2,
      });
      const latchCube = new THREE.Mesh(cubeGeo, cubeMat);
      latchCube.position.y = isBitActive ? 0.7 : 0.45;
      latchCube.castShadow = true;
      group.add(latchCube);

      // Value text display
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      this.drawDigit(ctx, isBitActive ? '1' : '0', isTarget);

      const valTexture = new THREE.CanvasTexture(canvas);
      const valMat = new THREE.MeshBasicMaterial({ map: valTexture, transparent: true });
      const valText = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), valMat);
      valText.position.set(0, isBitActive ? 0.7 : 0.45, 0.61);
      group.add(valText);

      // Status LED
      const ledGeo = new THREE.SphereGeometry(0.1, 16, 16);
      const ledMat = new THREE.MeshBasicMaterial({
        color: isBitActive ? 0x10b981 : 0x334155,
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0, isBitActive ? 1.2 : 0.95, 0);
      group.add(led);

      // Highlight bracket for Target Bit 4
      if (isTarget) {
        const ringGeo = new THREE.RingGeometry(0.7, 0.76, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        group.add(ring);
      }

      this.cpuChassis.add(group);

      this.bitCells[i] = {
        index: i,
        group,
        latchCube,
        valText,
        led,
        currentY: isBitActive ? 0.7 : 0.45,
        targetY: isBitActive ? 0.7 : 0.45,
        currentAngle: 0,
        targetAngle: 0,
      };
    }
  }

  private drawDigit(ctx: CanvasRenderingContext2D, char: string, isTarget: boolean): void {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = isTarget ? 'rgba(217, 119, 6, 0.9)' : 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 74px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, 64, 64);
  }

  private buildALUExecutionPointer(): void {
    const targetX = (3.5 - this.TARGET_BIT) * 1.5;
    this.aluPointer.position.set(targetX, 2.8, 0);

    // ALU pointer head / laser needle
    const needleGeo = new THREE.ConeGeometry(0.18, 0.7, 16);
    needleGeo.rotateX(Math.PI);
    const needleMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.1,
      emissive: 0xd97706,
      emissiveIntensity: 0.5,
    });
    const needle = new THREE.Mesh(needleGeo, needleMat);
    this.aluPointer.add(needle);

    // Vertical write laser beam down to bit
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 16);
    beamGeo.translate(0, -0.9, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.3,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.name = 'aluBeam';
    this.aluPointer.add(beam);

    this.cpuChassis.add(this.aluPointer);
  }

  /**
   * Executes the CPU instruction SETB R1.4 (Set Bit).
   * Strictly idempotent: Bit 4 is forced to 1. Repeated calls produce identical register state.
   */
  public executeSETB(cycleCount: number = 1): void {
    this.executionCycles += cycleCount;
    this.currentOpcode = 'SETB R1.4';
    this.opcodeHex = '0xD2 0x94';
    this.isIdempotentOperation = true;

    const oldVal = this.registerR1;
    const oldOtherBits = oldVal & ~this.TARGET_MASK;

    // CPU SETB logic: R1 |= (1 << 4)
    this.registerR1 |= this.TARGET_MASK;

    const bitChanged = (oldVal & this.TARGET_MASK) === 0;

    const newOtherBits = this.registerR1 & ~this.TARGET_MASK;
    if (oldOtherBits !== newOtherBits) {
      this.otherBitsAlteredCount++;
    }

    this.aluPulseIntensity = 1.0;
    this.updateBitCellVisual(this.TARGET_BIT, true);

    const targetX = (3.5 - this.TARGET_BIT) * 1.5;
    if (bitChanged) {
      sound.playBitFlip();
      this.particles.emit({
        count: 50,
        origin: new THREE.Vector3(targetX, 1.3, 0),
        spread: 0.35,
        color: 0xf59e0b,
        size: 0.35,
        life: 0.8,
        velocity: new THREE.Vector3(0, 0.8, 0),
      });

      this.log(
        'success',
        `CPU EXEC: SETB R1.4 (Cycle #${this.executionCycles}) -> Bit 4 locked to 1. R1 = 0x${this.registerR1.toString(16).toUpperCase()}`,
        'CPU_SETB'
      );
    } else {
      sound.playDeduplicateBlock();
      this.particles.emit({
        count: 15,
        origin: new THREE.Vector3(targetX, 1.3, 0),
        spread: 0.2,
        color: 0x38bdf8,
        size: 0.25,
        life: 0.4,
      });

      this.log(
        'blocked',
        `CPU EXEC (x${cycleCount}): SETB R1.4 -> Bit 4 already 1 (1 -> 1). Register state identical. Zero drift.`,
        'IDEMPOTENT_EXEC'
      );
    }

    this.updateHUDMetrics();
    this.setIdempotentStatus(
      true,
      `Idempotent CPU instruction: Executed ${this.executionCycles} cycles. R1 value remains perfectly stable at 0x${this.registerR1.toString(16).toUpperCase()}.`
    );
  }

  /**
   * Contrast Demo: Executes CPL R1.4 (Complement Bit / Toggle).
   * Demonstrates how non-idempotent instructions oscillate, highlighting why idempotency matters!
   */
  public executeCPL(): void {
    this.executionCycles++;
    this.currentOpcode = 'CPL R1.4 (Toggle)';
    this.opcodeHex = '0xB2 0x94';
    this.isIdempotentOperation = false;

    this.registerR1 ^= this.TARGET_MASK;
    const isNowActive = (this.registerR1 & this.TARGET_MASK) !== 0;

    this.aluPulseIntensity = 1.0;
    this.updateBitCellVisual(this.TARGET_BIT, isNowActive);
    sound.playBitFlip();

    const targetX = (3.5 - this.TARGET_BIT) * 1.5;
    this.particles.emit({
      count: 35,
      origin: new THREE.Vector3(targetX, 1.3, 0),
      spread: 0.3,
      color: 0xef4444, // Red for non-idempotent toggle
      size: 0.3,
      life: 0.6,
    });

    this.log(
      'warn',
      `NON-IDEMPOTENT CONTRAST: CPL R1.4 executed -> Bit 4 toggled to ${isNowActive ? '1' : '0'}. Repeated runs oscillate!`,
      'NON_IDEMPOTENT_CPL'
    );

    this.updateHUDMetrics();
    this.setIdempotentStatus(
      false,
      'Contrast mode: CPL (toggle) is NOT idempotent! Consecutive calls produce oscillating results.'
    );
  }

  /**
   * Clears Bit 4 to 0 (CLR R1.4) to reset scenario.
   */
  public clearBit4(): void {
    this.registerR1 &= ~this.TARGET_MASK;
    this.updateBitCellVisual(this.TARGET_BIT, false);
    sound.playBitFlip();

    this.log('hardware', `CLR R1.4 executed: Bit 4 forced to 0. R1 = 0x${this.registerR1.toString(16).toUpperCase()}`, 'CLR_BIT');
    this.updateHUDMetrics();
    this.setIdempotentStatus(true, 'Bit 4 cleared. Ready to execute SETB once or multiple times.');
  }

  /**
   * Randomizes the other bits of R1 to prove SETB only operates on Bit 4.
   */
  public randomizeOtherBits(): void {
    const randomMask = Math.floor(Math.random() * 256) & ~this.TARGET_MASK;
    const bit4State = this.registerR1 & this.TARGET_MASK;
    this.registerR1 = randomMask | bit4State;

    for (let i = 0; i < 8; i++) {
      if (i !== this.TARGET_BIT) {
        const isActive = (this.registerR1 & (1 << i)) !== 0;
        this.updateBitCellVisual(i, isActive);
      }
    }

    sound.playBitFlip();
    this.log('info', `Other register bits randomized. R1 = 0x${this.registerR1.toString(16).toUpperCase()}`, 'RANDOMIZE');
    this.updateHUDMetrics();
  }

  private updateBitCellVisual(index: number, isActive: boolean): void {
    const cell = this.bitCells[index];
    if (!cell) return;

    cell.targetY = isActive ? 0.7 : 0.45;
    const isTarget = index === this.TARGET_BIT;
    const color = isTarget ? 0xd97706 : isActive ? 0x10b981 : 0x1e293b;

    (cell.latchCube.material as THREE.MeshStandardMaterial).color.setHex(color);
    (cell.led.material as THREE.MeshBasicMaterial).color.setHex(isActive ? 0x10b981 : 0x334155);

    const canvas = (cell.valText.material as THREE.MeshBasicMaterial).map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    this.drawDigit(ctx, isActive ? '1' : '0', isTarget);
    (cell.valText.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
  }

  public override update(delta: number, elapsed: number): void {
    super.update(delta, elapsed);

    // ALU pointer hovering and pulse decay
    this.aluPointer.position.y = 2.8 + Math.sin(elapsed * 4.0) * 0.05;

    if (this.aluPulseIntensity > 0) {
      this.aluPulseIntensity = Math.max(0, this.aluPulseIntensity - delta * 4.0);
      const beam = this.aluPointer.getObjectByName('aluBeam');
      if (beam) {
        (beam as THREE.Mesh).scale.set(
          1 + this.aluPulseIntensity * 1.5,
          1,
          1 + this.aluPulseIntensity * 1.5
        );
        ((beam as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.3 + this.aluPulseIntensity * 0.6;
      }
    }

    // CPU clock signal pulses along bus interconnect traces
    if (Math.random() < 0.3) {
      const bitIdx = Math.floor(Math.random() * 8);
      this.particles.emit({
        count: 1,
        origin: new THREE.Vector3((3.5 - bitIdx) * 1.5, 0.48, -1.8),
        color: 0x00f0ff,
        size: 0.2,
        life: 0.45,
        velocity: new THREE.Vector3(0, 0, 3.8),
      });
    }

    // Pipeline clock LED blinking
    if (this.pipelineLED) {
      const clockBlink = Math.sin(elapsed * 12.0) > 0 ? 0x00f0ff : 0x0369a1;
      (this.pipelineLED.material as THREE.MeshBasicMaterial).color.setHex(clockBlink);
    }

    // Smooth mechanical cell heights with subtle active hover
    this.bitCells.forEach((cell) => {
      cell.currentY += (cell.targetY - cell.currentY) * Math.min(1.0, delta * 8.0);
      const isActive = (this.registerR1 & (1 << cell.index)) !== 0;
      const hover = isActive ? Math.sin(elapsed * 3.5 + cell.index * 0.8) * 0.03 : 0;

      cell.latchCube.position.y = cell.currentY + hover;
      cell.valText.position.y = cell.currentY + hover;
      cell.led.position.y = cell.currentY + hover + 0.5;
    });
  }

  private updateHUDMetrics(): void {
    const hex = `0x${this.registerR1.toString(16).padStart(2, '0').toUpperCase()}`;
    const bin = this.registerR1.toString(2).padStart(8, '0');
    const isBit4Set = (this.registerR1 & this.TARGET_MASK) !== 0;

    this.updateMetrics([
      {
        id: 'instruction_name',
        label: 'Current Instruction',
        value: this.currentOpcode,
        highlight: true,
      },
      {
        id: 'execution_cycles',
        label: 'Clock Cycles Executed',
        value: this.executionCycles,
      },
      {
        id: 'reg_hex',
        label: 'Register R1 (Hex)',
        value: hex,
        highlight: true,
      },
      {
        id: 'reg_bin',
        label: 'Register R1 (Binary)',
        value: `${bin.slice(0, 4)} ${bin.slice(4)}b`,
      },
      {
        id: 'bit4_state',
        label: 'Bit 4 State',
        value: isBit4Set ? '1 (LOCKED)' : '0 (CLEARED)',
        status: isBit4Set ? 'success' : 'alert',
      },
      {
        id: 'other_isolated',
        label: 'Other Bits Altered',
        value: `${this.otherBitsAlteredCount} (Zero Side Effects)`,
        status: this.otherBitsAlteredCount === 0 ? 'success' : 'alert',
      },
    ]);
  }

  public onControlAction(actionId: string): void {
    switch (actionId) {
      case 'exec_setb_1x':
        this.executeSETB(1);
        break;
      case 'exec_setb_10x':
        this.executeSETB(10);
        break;
      case 'exec_setb_50x':
        this.executeSETB(50);
        break;
      case 'clear_bit4':
        this.clearBit4();
        break;
      case 'exec_cpl':
        this.executeCPL();
        break;
      case 'randomize_others':
        this.randomizeOtherBits();
        break;
      default:
        console.warn('Unknown action:', actionId);
    }
  }

  public getHUDConfig(): HUDConfig {
    return {
      title: 'Computer Architecture: CPU SETB Instruction Idempotency',
      domain: 'CPU Microarchitecture & Low-Level Instruction Set Architecture (ISA)',
      conceptSummary:
        'In CPU assembly architectures (e.g. 8051, ARM BFI, RISC-V), the SETB (Set Bit) instruction forces a designated register bit to 1. Because setting an already-1 bit to 1 produces 1, running SETB 1 time or 50 times in sequence is strictly idempotent: the register value never drifts, never rolls over, and leaves all other register bits completely preserved.',
      formula: 'SETB(R, bit); SETB(R, bit) => R[bit] === 1 (Zero Drift)',
      metrics: [
        { id: 'instruction_name', label: 'Current Instruction', value: 'SETB R1.4' },
        { id: 'execution_cycles', label: 'Clock Cycles Executed', value: 0 },
        { id: 'reg_hex', label: 'Register R1 (Hex)', value: '0x82' },
        { id: 'reg_bin', label: 'Register R1 (Binary)', value: '1000 0010b' },
        { id: 'bit4_state', label: 'Bit 4 State', value: '0 (CLEARED)' },
        { id: 'other_isolated', label: 'Other Bits Altered', value: '0' },
      ],
      buttons: [
        {
          id: 'exec_setb_1x',
          label: 'Execute SETB R1.4 (1x)',
          subLabel: '1 Clock Cycle execution',
          variant: 'primary',
          icon: '⚡',
        },
        {
          id: 'exec_setb_10x',
          label: 'Run SETB Loop (10x Cycles)',
          subLabel: 'Consecutive instruction streak',
          variant: 'accent',
          icon: '🔁',
        },
        {
          id: 'exec_setb_50x',
          label: 'Stress Burst (50x Cycles)',
          subLabel: 'Prove absolute stability',
          variant: 'secondary',
          icon: '🚀',
        },
        {
          id: 'clear_bit4',
          label: 'Clear Bit 4: CLR R1.4',
          subLabel: 'Force Bit 4 to 0',
          variant: 'danger',
          icon: '0️⃣',
        },
        {
          id: 'exec_cpl',
          label: 'Contrast: CPL R1.4 (Toggle)',
          subLabel: 'Non-idempotent comparison',
          variant: 'secondary',
          icon: '🔀',
        },
        {
          id: 'randomize_others',
          label: 'Randomize Other Bits',
          subLabel: 'Test bit isolation',
          variant: 'secondary',
          icon: '🎲',
        },
      ],
      infoNotes: [
        'Notice how SETB snaps Bit 4 to 1 on the first cycle, and subsequent executions leave R1 completely identical.',
        'Try clicking "Contrast: CPL" to observe how a non-idempotent instruction toggles between 1 and 0 every time!',
      ],
    };
  }

  public override getCameraPreset(): CameraPreset {
    return {
      position: new THREE.Vector3(0, 5.2, 10.2),
      target: new THREE.Vector3(0, 0.7, 0),
    };
  }
}

