import { SceneManager } from './core/scene-manager.js';
import { SimulationId, SimulationStateUpdate } from './core/types.js';
import { BaseSimulation } from './simulations/base-simulation.js';
import { FullstackSimulation } from './simulations/fullstack-simulation.js';
import { GameDevSimulation } from './simulations/game-dev-simulation.js';
import { IoTSimulation } from './simulations/iot-simulation.js';
import { BSPSimulation } from './simulations/bsp-simulation.js';
import { LinuxSimulation } from './simulations/linux-simulation.js';
import { CPUSimulation } from './simulations/cpu-simulation.js';
import { HUDOverlay } from './ui/hud-overlay.js';
import { TabNavigation } from './ui/tab-navigation.js';

class App {
  private sceneManager: SceneManager;
  private hudOverlay: HUDOverlay;
  private tabNav: TabNavigation;

  private currentSimulation: BaseSimulation | null = null;
  private activeTabId: SimulationId = 'fullstack';
  private autoDemoTimer: number | null = null;
  private isAutoDemoActive: boolean = false;

  // Factory map for clean on-demand simulation instantiation
  private simulationConstructors: Record<SimulationId, new (sm: SceneManager) => BaseSimulation> = {
    fullstack: FullstackSimulation,
    gamedev: GameDevSimulation,
    iot: IoTSimulation,
    bsp: BSPSimulation,
    linux: LinuxSimulation,
    cpu: CPUSimulation,
  };

  constructor() {
    const canvasContainer = document.getElementById('canvas-container')!;
    const navContainer = document.getElementById('nav-container')!;
    const hudContainer = document.getElementById('hud-container')!;

    // 1. Initialize 3D Engine
    this.sceneManager = new SceneManager(canvasContainer);

    // 2. Initialize HUD Overlay
    this.hudOverlay = new HUDOverlay(hudContainer, (actionId, payload) => {
      if (this.currentSimulation) {
        this.currentSimulation.onControlAction(actionId, payload);
      }
    });

    // 3. Initialize Tab Navigation
    this.tabNav = new TabNavigation(
      navContainer,
      (tabId) => this.switchTab(tabId),
      () => this.recenterCamera(),
      () => this.toggleTheory(),
      () => this.toggleAutoDemo()
    );

    // 4. Mount initial simulation
    this.switchTab('fullstack');

    // 5. Setup Spacebar shortcut to fire primary action
    this.setupGlobalShortcuts();

    // 6. Gentle initial activation 800ms after load so the simulation moves right away!
    setTimeout(() => {
      if (this.currentSimulation && this.activeTabId === 'fullstack') {
        const config = this.currentSimulation.getHUDConfig();
        const primaryBtn = config.buttons[0];
        if (primaryBtn) {
          this.currentSimulation.onControlAction(primaryBtn.id);
        }
      }
    }, 800);
  }

  public toggleAutoDemo(): boolean {
    this.isAutoDemoActive = !this.isAutoDemoActive;

    if (this.autoDemoTimer !== null) {
      clearInterval(this.autoDemoTimer);
      this.autoDemoTimer = null;
    }

    if (this.isAutoDemoActive) {
      let step = 0;
      this.autoDemoTimer = window.setInterval(() => {
        if (!this.currentSimulation) return;
        const config = this.currentSimulation.getHUDConfig();
        step++;
        if (step % 4 === 1) {
          // Primary 1x
          this.currentSimulation.onControlAction(config.buttons[0]?.id || '');
        } else if (step % 4 === 2) {
          // Burst / retry (idempotent duplicate test!)
          this.currentSimulation.onControlAction(config.buttons[1]?.id || config.buttons[0]?.id || '');
        } else if (step % 4 === 3) {
          // 3rd action if available
          this.currentSimulation.onControlAction(config.buttons[2]?.id || config.buttons[1]?.id || '');
        }
      }, 2400);
    }

    return this.isAutoDemoActive;
  }

  private async switchTab(tabId: SimulationId): Promise<void> {
    this.activeTabId = tabId;

    // A. Cleanly unmount previous simulation to avoid memory leaks
    if (this.currentSimulation) {
      this.currentSimulation.dispose();
      this.currentSimulation = null;
    }

    // B. Reclaim WebGL scene objects (geometries, textures, materials)
    this.sceneManager.clearSceneSimulationObjects(true);

    // C. Instantiate new simulation
    const SimClass = this.simulationConstructors[tabId];
    if (!SimClass) {
      console.error(`Unknown simulation tab: ${tabId}`);
      return;
    }

    const sim = new SimClass(this.sceneManager);
    this.currentSimulation = sim;

    // D. Connect state updates to HUD
    sim.setStateUpdateCallback((update: SimulationStateUpdate) => {
      if (update.metrics) {
        this.hudOverlay.updateMetrics(update.metrics);
      }
      if (update.logEntry) {
        this.hudOverlay.addLogEntry(update.logEntry);
      }
      if (update.idempotentStatus) {
        this.hudOverlay.updateProofStatus(
          update.idempotentStatus.isIdempotent,
          update.idempotentStatus.reason
        );
      }
    });

    // E. Initialize simulation
    await sim.init();

    // F. Hook per-frame animation tick
    this.sceneManager.onUpdate((delta, elapsed) => {
      if (this.currentSimulation === sim) {
        sim.update(delta, elapsed);
      }
    });

    // G. Reset Camera Preset for this domain
    this.sceneManager.setCameraPreset(sim.getCameraPreset());

    // H. Render HUD
    const hudConfig = sim.getHUDConfig();
    this.hudOverlay.render(hudConfig);
  }

  private recenterCamera(): void {
    if (this.currentSimulation) {
      this.sceneManager.setCameraPreset(this.currentSimulation.getCameraPreset());
    }
  }

  private toggleTheory(): void {
    this.hudOverlay.toggleTheoryModal();
  }

  private setupGlobalShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        // Trigger the primary action of the current simulation
        if (this.currentSimulation) {
          const config = this.currentSimulation.getHUDConfig();
          const primaryBtn = config.buttons[0];
          if (primaryBtn) {
            this.currentSimulation.onControlAction(primaryBtn.id);
          }
        }
      } else if (e.code === 'KeyR') {
        this.recenterCamera();
      }
    });
  }
}

// Bootstrap once DOM is ready or immediately if already loaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    new App();
  });
} else {
  new App();
}
