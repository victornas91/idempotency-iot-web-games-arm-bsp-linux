import {
  HUDConfig,
  MetricItem,
  EventLogEntry,
} from '../core/types.js';

export class HUDOverlay {
  private container: HTMLElement;
  private onActionCallback: (actionId: string, payload?: unknown) => void;

  // DOM sub-containers
  private headerEl: HTMLElement;
  private proofPanelEl: HTMLElement;
  private metricsGridEl: HTMLElement;
  private controlsGridEl: HTMLElement;
  private eventLogEl: HTMLElement;
  private theoryModalEl: HTMLElement;

  private isTheoryOpen: boolean = false;
  private currentConfig: HUDConfig | null = null;
  private logs: EventLogEntry[] = [];

  constructor(
    container: HTMLElement,
    onAction: (actionId: string, payload?: unknown) => void
  ) {
    this.container = container;
    this.onActionCallback = onAction;

    this.container.className = 'hud-overlay';

    // 1. Header
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'hud-header';
    this.container.appendChild(this.headerEl);

    // 2. Proof Status Panel (f(f(x)) = f(x))
    this.proofPanelEl = document.createElement('div');
    this.proofPanelEl.className = 'hud-proof-panel';
    this.container.appendChild(this.proofPanelEl);

    // 3. Middle split area: Metrics & Controls
    const middleSplit = document.createElement('div');
    middleSplit.className = 'hud-middle-split';

    this.controlsGridEl = document.createElement('div');
    this.controlsGridEl.className = 'hud-controls-panel';
    middleSplit.appendChild(this.controlsGridEl);

    this.metricsGridEl = document.createElement('div');
    this.metricsGridEl.className = 'hud-metrics-panel';
    middleSplit.appendChild(this.metricsGridEl);

    this.container.appendChild(middleSplit);

    // 4. Bottom Event Log Terminal
    this.eventLogEl = document.createElement('div');
    this.eventLogEl.className = 'hud-event-log';
    this.container.appendChild(this.eventLogEl);

    // 5. Theory Modal
    this.theoryModalEl = document.createElement('div');
    this.theoryModalEl.className = 'hud-theory-modal';
    this.theoryModalEl.style.display = 'none';
    this.container.appendChild(this.theoryModalEl);
  }

  public render(config: HUDConfig): void {
    this.currentConfig = config;
    this.logs = [];

    // Header
    this.headerEl.innerHTML = `
      <div class="hud-title-row">
        <span class="hud-domain-badge">${this.escapeHTML(config.domain)}</span>
        <h2 class="hud-title">${this.escapeHTML(config.title)}</h2>
      </div>
      <p class="hud-summary">${this.escapeHTML(config.conceptSummary)}</p>
    `;

    // Proof panel
    this.updateProofStatus(true, 'Idempotency invariant active: f(x) = f(f(x))');

    // Controls
    this.renderControls(config);

    // Metrics
    this.renderMetrics(config.metrics);

    // Event Log
    this.renderEventLog();

    // Theory Modal Content
    this.renderTheoryModal(config);
  }

  public updateProofStatus(isIdempotent: boolean, reason: string): void {
    const badgeClass = isIdempotent ? 'proof-badge-success' : 'proof-badge-warning';
    const statusText = isIdempotent ? 'IDEMPOTENT GUARANTEE: VERIFIED' : 'ATTENTION: NON-IDEMPOTENT CONTRAST';
    const formulaText = this.currentConfig ? this.currentConfig.formula : 'f(f(x)) == f(x)';

    this.proofPanelEl.innerHTML = `
      <div class="proof-content">
        <div class="proof-top">
          <div class="proof-badge ${badgeClass}">
            <span class="proof-dot"></span>
            ${statusText}
          </div>
          <div class="proof-formula"><code>${this.escapeHTML(formulaText)}</code></div>
        </div>
        <div class="proof-reason">${this.escapeHTML(reason)}</div>
      </div>
    `;
  }

  private renderControls(config: HUDConfig): void {
    this.controlsGridEl.innerHTML = `
      <div class="panel-section-title">
        <span>🎮 INTERACTIVE ACTIONS</span>
      </div>
      <div class="controls-button-group"></div>
    `;

    const btnGroup = this.controlsGridEl.querySelector('.controls-button-group')!;

    config.buttons.forEach((btn) => {
      const buttonEl = document.createElement('button');
      buttonEl.className = `action-btn btn-${btn.variant || 'primary'}`;
      buttonEl.innerHTML = `
        <span class="btn-icon">${btn.icon || '⚡'}</span>
        <div class="btn-text-col">
          <span class="btn-label">${this.escapeHTML(btn.label)}</span>
          ${btn.subLabel ? `<span class="btn-sub">${this.escapeHTML(btn.subLabel)}</span>` : ''}
        </div>
      `;

      buttonEl.addEventListener('click', () => {
        buttonEl.classList.add('btn-clicked');
        setTimeout(() => buttonEl.classList.remove('btn-clicked'), 200);
        this.onActionCallback(btn.id);
      });

      btnGroup.appendChild(buttonEl);
    });
  }

  public renderMetrics(metrics: MetricItem[]): void {
    let html = `
      <div class="panel-section-title">
        <span>📊 REAL-TIME INVARIANTS & TELEMETRY</span>
      </div>
      <div class="metrics-grid">
    `;

    metrics.forEach((m) => {
      const highlightClass = m.highlight ? 'metric-highlight' : '';
      const statusClass = m.status ? `metric-status-${m.status}` : '';

      html += `
        <div class="metric-card ${highlightClass} ${statusClass}" id="metric_${m.id}">
          <span class="metric-label">${this.escapeHTML(m.label)}</span>
          <span class="metric-value">${this.escapeHTML(String(m.value))}</span>
        </div>
      `;
    });

    html += `</div>`;
    this.metricsGridEl.innerHTML = html;
  }

  public updateMetrics(metrics: MetricItem[]): void {
    metrics.forEach((m) => {
      const card = this.metricsGridEl.querySelector(`#metric_${m.id}`);
      if (card) {
        const valEl = card.querySelector('.metric-value');
        if (valEl) {
          valEl.textContent = String(m.value);
        }
        if (m.status) {
          card.className = `metric-card ${m.highlight ? 'metric-highlight' : ''} metric-status-${m.status}`;
        }
      } else {
        // Fallback to full re-render
        this.renderMetrics(metrics);
      }
    });
  }

  public addLogEntry(entry: EventLogEntry): void {
    this.logs.unshift(entry);
    if (this.logs.length > 50) {
      this.logs.pop();
    }
    this.renderEventLog();
  }

  private renderEventLog(): void {
    let logRows = '';
    this.logs.slice(0, 15).forEach((entry) => {
      logRows += `
        <div class="log-row log-${entry.type}">
          <span class="log-time">${entry.timestamp}</span>
          ${entry.tag ? `<span class="log-tag">[${this.escapeHTML(entry.tag)}]</span>` : ''}
          <span class="log-msg">${this.escapeHTML(entry.message)}</span>
        </div>
      `;
    });

    if (this.logs.length === 0) {
      logRows = `<div class="log-empty">System ready. Waiting for user interaction...</div>`;
    }

    this.eventLogEl.innerHTML = `
      <div class="log-header">
        <span class="log-title">🖥️ BUS & SYSTEM EVENT LOG STREAM</span>
        <button class="log-clear-btn" title="Clear log">Clear</button>
      </div>
      <div class="log-stream-body">
        ${logRows}
      </div>
    `;

    const clearBtn = this.eventLogEl.querySelector('.log-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.logs = [];
        this.renderEventLog();
      });
    }
  }

  private renderTheoryModal(config: HUDConfig): void {
    const notesHtml = (config.infoNotes || [])
      .map((note) => `<li>${this.escapeHTML(note)}</li>`)
      .join('');

    this.theoryModalEl.innerHTML = `
      <div class="theory-card">
        <div class="theory-header">
          <h3>📘 ${this.escapeHTML(config.title)}: Architectural Theory</h3>
          <button class="theory-close-btn">&times;</button>
        </div>
        <div class="theory-body">
          <p><strong>Domain:</strong> ${this.escapeHTML(config.domain)}</p>
          <p><strong>Idempotency Law:</strong> <code>${this.escapeHTML(config.formula)}</code></p>
          <p>${this.escapeHTML(config.conceptSummary)}</p>
          ${notesHtml ? `<h4>Key Visual Cues to Observe:</h4><ul>${notesHtml}</ul>` : ''}
        </div>
      </div>
    `;

    const closeBtn = this.theoryModalEl.querySelector('.theory-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.toggleTheoryModal(false));
    }
  }

  public toggleTheoryModal(forceState?: boolean): void {
    this.isTheoryOpen = forceState !== undefined ? forceState : !this.isTheoryOpen;
    this.theoryModalEl.style.display = this.isTheoryOpen ? 'flex' : 'none';
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

