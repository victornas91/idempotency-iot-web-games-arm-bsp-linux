export type SimulationId = 'fullstack' | 'gamedev' | 'iot' | 'bsp' | 'linux' | 'cpu';

export interface TabDefinition {
  id: SimulationId;
  title: string;
  shortTitle: string;
  domain: string;
  icon: string;
  badge: string;
  description: string;
  idempotencyRule: string;
}

export interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  highlight?: boolean;
  status?: 'nominal' | 'success' | 'warning' | 'alert';
  unit?: string;
}

export interface ControlButton {
  id: string;
  label: string;
  subLabel?: string;
  variant?: 'primary' | 'secondary' | 'accent' | 'danger';
  icon?: string;
  shortcut?: string;
}

export interface ControlSlider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface HUDConfig {
  title: string;
  domain: string;
  conceptSummary: string;
  formula: string;
  metrics: MetricItem[];
  buttons: ControlButton[];
  sliders?: ControlSlider[];
  infoNotes?: string[];
}

export interface EventLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warn' | 'blocked' | 'hardware';
  message: string;
  tag?: string;
}

export interface SimulationStateUpdate {
  metrics?: MetricItem[];
  logEntry?: EventLogEntry;
  idempotentStatus?: {
    isIdempotent: boolean;
    reason: string;
  };
}

