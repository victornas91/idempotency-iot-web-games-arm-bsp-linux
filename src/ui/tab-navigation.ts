import { SimulationId, TabDefinition } from '../core/types.js';
import { sound } from '../core/sound.js';

export const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'fullstack',
    title: 'Fullstack 3D',
    shortTitle: 'Fullstack',
    domain: 'Cloud & Web 3D',
    icon: '🌐',
    badge: 'API Deduplication',
    description: 'API asset load request with Idempotency-Key collapsing duplicate packets.',
    idempotencyRule: 'f(req) == f(f(req))',
  },
  {
    id: 'gamedev',
    title: 'Game Dev',
    shortTitle: 'Game Dev',
    domain: 'State Authority',
    icon: '🎮',
    badge: 'Loot Action',
    description: 'Player chest open command with network oscillation preventing duplicate rewards.',
    idempotencyRule: 'openChest() -> 1x Loot',
  },
  {
    id: 'iot',
    title: 'IoT',
    shortTitle: 'IoT',
    domain: 'Embedded Telemetry',
    icon: '💧',
    badge: 'Valve Actuator',
    description: 'Water valve turn-on signal keeping valve ON without toggling or jitter.',
    idempotencyRule: 'setValve(ON) -> Stable ON',
  },
  {
    id: 'bsp',
    title: 'Board Support',
    shortTitle: 'BSP',
    domain: 'Firmware Drivers',
    icon: '⚡',
    badge: 'I2C Reset',
    description: 'I2C peripheral reset routine leaving chip in identical ready state 1x or 10x.',
    idempotencyRule: 'bsp_reset() == READY',
  },
  {
    id: 'linux',
    title: 'Linux Kernel',
    shortTitle: 'Linux',
    domain: 'Kernel Internals',
    icon: '🐧',
    badge: 'MMIO Bitmask',
    description: 'MMIO interrupt register enable bitmask preserving all other controller bits.',
    idempotencyRule: '(R | M) | M == R | M',
  },
  {
    id: 'cpu',
    title: 'Computer Arch',
    shortTitle: 'CPU Arch',
    domain: 'Microarchitecture',
    icon: '🧠',
    badge: 'SETB Instruction',
    description: 'CPU SETB assembly instruction forcing bit to 1 with zero drift.',
    idempotencyRule: 'SETB(R.bit) == 1',
  },
];

export class TabNavigation {
  private container: HTMLElement;
  private onTabChange: (tabId: SimulationId) => void;
  private onRecenterCamera: () => void;
  private onToggleTheory: () => void;
  private onToggleAutoDemo: () => boolean;

  private activeTabId: SimulationId = 'fullstack';
  private tabButtons: Map<SimulationId, HTMLButtonElement> = new Map();
  private audioBtn: HTMLButtonElement | null = null;
  private autoDemoBtn: HTMLButtonElement | null = null;

  constructor(
    container: HTMLElement,
    onTabChange: (tabId: SimulationId) => void,
    onRecenterCamera: () => void,
    onToggleTheory: () => void,
    onToggleAutoDemo: () => boolean
  ) {
    this.container = container;
    this.onTabChange = onTabChange;
    this.onRecenterCamera = onRecenterCamera;
    this.onToggleTheory = onToggleTheory;
    this.onToggleAutoDemo = onToggleAutoDemo;

    this.render();
    this.setupKeyboardShortcuts();
  }

  private render(): void {
    this.container.className = 'top-navbar';

    this.container.innerHTML = `
      <div class="nav-brand">
        <span class="nav-brand-icon">⚛️</span>
        <div class="nav-brand-text">
          <span class="nav-brand-title">IDEMPOTENCY 3D LAB</span>
          <span class="nav-brand-sub">Multi-Domain Interactive Simulations</span>
        </div>
      </div>

      <nav class="nav-tabs-container" role="tablist"></nav>

      <div class="nav-utilities">
        <button class="nav-util-btn" id="btn-auto-demo" title="Toggle Auto-Demo Loop (⚡)">
          <span class="util-icon">⚡</span>
          <span class="util-label" id="auto-demo-label">Auto-Demo: OFF</span>
        </button>
        <button class="nav-util-btn" id="btn-toggle-theory" title="Open Concept Theory Guide (📘)">
          <span class="util-icon">📘</span>
          <span class="util-label">Theory</span>
        </button>
        <button class="nav-util-btn" id="btn-recenter" title="Re-center 3D Camera (🎯)">
          <span class="util-icon">🎯</span>
          <span class="util-label">Camera</span>
        </button>
        <button class="nav-util-btn" id="btn-audio" title="Toggle Sound FX (🔊 / 🔇)">
          <span class="util-icon" id="audio-icon">🔊</span>
          <span class="util-label">Audio</span>
        </button>
      </div>
    `;

    const tabsContainer = this.container.querySelector('.nav-tabs-container')!;

    TAB_DEFINITIONS.forEach((tab, index) => {
      const btn = document.createElement('button');
      btn.className = `nav-tab-btn ${tab.id === this.activeTabId ? 'active' : ''}`;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', tab.id === this.activeTabId ? 'true' : 'false');
      btn.title = `Switch to ${tab.title} (Key: ${index + 1})`;

      btn.innerHTML = `
        <span class="tab-number">${index + 1}</span>
        <span class="tab-icon">${tab.icon}</span>
        <div class="tab-label-group">
          <span class="tab-title">${tab.title}</span>
          <span class="tab-badge">${tab.badge}</span>
        </div>
      `;

      btn.addEventListener('click', () => {
        if (this.activeTabId !== tab.id) {
          this.setActiveTab(tab.id);
        }
      });

      tabsContainer.appendChild(btn);
      this.tabButtons.set(tab.id, btn);
    });

    // Utility buttons
    this.autoDemoBtn = this.container.querySelector('#btn-auto-demo');
    if (this.autoDemoBtn) {
      this.autoDemoBtn.addEventListener('click', () => {
        const isNowOn = this.onToggleAutoDemo();
        const lbl = document.getElementById('auto-demo-label');
        if (lbl) {
          lbl.textContent = isNowOn ? 'Auto-Demo: ON' : 'Auto-Demo: OFF';
        }
        if (this.autoDemoBtn) {
          if (isNowOn) {
            this.autoDemoBtn.classList.add('btn-active-glow');
          } else {
            this.autoDemoBtn.classList.remove('btn-active-glow');
          }
        }
      });
    }

    const theoryBtn = this.container.querySelector('#btn-toggle-theory');
    if (theoryBtn) {
      theoryBtn.addEventListener('click', () => this.onToggleTheory());
    }

    const recenterBtn = this.container.querySelector('#btn-recenter');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => this.onRecenterCamera());
    }

    this.audioBtn = this.container.querySelector('#btn-audio');
    if (this.audioBtn) {
      this.audioBtn.addEventListener('click', () => {
        const isNowEnabled = sound.toggle();
        const iconEl = document.getElementById('audio-icon');
        if (iconEl) {
          iconEl.textContent = isNowEnabled ? '🔊' : '🔇';
        }
      });
    }
  }

  public setActiveTab(tabId: SimulationId): void {
    if (this.activeTabId === tabId) return;

    this.tabButtons.forEach((btn, id) => {
      if (id === tabId) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });

    this.activeTabId = tabId;
    sound.playPacketSend();
    this.onTabChange(tabId);
  }

  public getActiveTabId(): SimulationId {
    return this.activeTabId;
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      // Don't intercept if user is typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Keys 1 to 6 select tabs
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= TAB_DEFINITIONS.length) {
        const targetTab = TAB_DEFINITIONS[num - 1];
        if (targetTab) {
          this.setActiveTab(targetTab.id);
        }
      }
    });
  }
}

