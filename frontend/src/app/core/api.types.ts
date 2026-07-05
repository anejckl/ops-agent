/** Shapes returned by the FastAPI backend (/api/health, /api/entity, /api/chat*). */

export type TrendPoint = [number, number]; // [unix seconds, value]

export interface NodeStatus {
  cpu_percent: number;
  mem_used_gb: number;
  mem_total_gb: number;
  uptime_hours: number;
}

export interface StoragePool {
  storage: string;
  used_gb: number;
  total_gb: number;
  percent_used: number;
}

export interface Guest {
  vmid: number;
  name: string;
  status: string;
  cpu_percent: number;
  disk_max_gb: number;
  disk_used_gb: number;
  real_disk_free_gb?: number;
}

export interface Container {
  name: string;
  state: string;
  health: string | null;
  status: string;
}

export interface GpuStatus {
  utilization_percent: number | null;
  temperature_c: number | null;
  mem_used_gb: number | null;
  mem_total_gb: number | null;
}

export interface HealthEvent {
  time: string;
  entity: string;
  change: string;
}

export interface Anomaly {
  time: string;
  entity: string;
  metric: string;
  value: number;
  unit?: string;
  baseline_median: number;
}

export interface Forecast {
  days_left: number | null;
  gb_per_day: number;
}

export interface Alert {
  alertname: string | null;
  severity: string | null;
  summary: string | null;
  started: string | null;
}

export interface ServiceProbe {
  name: string;
  url: string;
  up: boolean;
  latency_ms: number | null;
}

export interface ServicesStatus {
  up: number;
  total: number;
  services: ServiceProbe[];
}

export interface DiskDefects {
  reallocated: number;
  pending: number;
  uncorrectable: number;
}

export interface DiskNvme {
  percentage_used: number | null;
  available_spare: number | null;
  media_errors: number;
}

export interface Disk {
  device: string;
  model: string | null;
  status: 'healthy' | 'warning' | 'critical';
  smart_passed: boolean;
  temp_c: number | null;
  power_on_days: number | null;
  defects: DiskDefects | null;
  nvme: DiskNvme | null;
}

export interface Health {
  node: NodeStatus;
  storage: StoragePool[];
  guests: Guest[];
  containers: Container[];
  cpu_trend: TrendPoint[] | null;
  mem_trend: TrendPoint[] | null;
  gpu: GpuStatus | null;
  events: HealthEvent[];
  anomalies: Anomaly[];
  forecasts: Record<string, Forecast>;
  alerts: Alert[];
  services: ServicesStatus | null;
  disks: { disks: Disk[] } | null;
}

export interface EntityDetail {
  type: 'guest' | 'container';
  id: string;
  name: string;
  hours: number;
  cpu: { series: TrendPoint[]; unit: string };
  mem: { series: TrendPoint[]; unit: string };
  events: HealthEvent[];
}
