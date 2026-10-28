import * as THREE from 'three';
import { SceneManager, CameraPreset } from '../core/scene-manager.js';
import { ParticleEngine } from '../core/particle-system.js';
import {
  SimulationId,
  HUDConfig,
  SimulationStateUpdate,
  MetricItem,
  EventLogEntry,
} from '../core/types.js';

export abstract class BaseSimulation {
  public abstract readonly id: SimulationId;
  public abstract readonly title: string;
  public abstract readonly domain: string;

  protected sceneManager: SceneManager;
  protected scene: THREE.Scene;
  protected camera: THREE.PerspectiveCamera;
  protected rootGroup: THREE.Group;
  protected particles: ParticleEngine;

  private stateUpdateCallback: ((update: SimulationStateUpdate) => void) | null = null;
  private logCounter: number = 0;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.camera = sceneManager.camera;
    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.particles = new ParticleEngine(800);
    this.rootGroup.add(this.particles.points);
  }

  public setStateUpdateCallback(callback: (update: SimulationStateUpdate) => void): void {
    this.stateUpdateCallback = callback;
  }

  protected notifyStateUpdate(update: SimulationStateUpdate): void {
    if (this.stateUpdateCallback) {
      this.stateUpdateCallback(update);
    }
  }

  protected log(
    type: EventLogEntry['type'],
    message: string,
    tag?: string
  ): void {
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

  protected updateMetrics(metrics: MetricItem[]): void {
    this.notifyStateUpdate({ metrics });
  }

  protected setIdempotentStatus(isIdempotent: boolean, reason: string): void {
    this.notifyStateUpdate({
      idempotentStatus: { isIdempotent, reason },
    });
  }

  /**
   * Called when simulation becomes active.
   */
  public abstract init(): Promise<void> | void;

  /**
   * Per-frame animation tick.
   */
  public update(delta: number, elapsed: number): void {
    this.particles.update(delta);
  }

  /**
   * Handle user action from the HUD buttons or sliders.
   */
  public abstract onControlAction(actionId: string, payload?: unknown): void;

  /**
   * Return initial HUD configuration.
   */
  public abstract getHUDConfig(): HUDConfig;

  /**
   * Camera preset for this specific simulation domain.
   */
  public getCameraPreset(): CameraPreset {
    return {
      position: new THREE.Vector3(0, 7, 14),
      target: new THREE.Vector3(0, 1.5, 0),
    };
  }

  /**
   * Clean unmounting and memory reclamation.
   */
  public dispose(): void {
    this.particles.dispose();
    this.sceneManager.disposeObject(this.rootGroup);
    this.stateUpdateCallback = null;
  }
}

