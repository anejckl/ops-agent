/**
 * Single ECharts registration point - always import echarts from HERE, never
 * from 'echarts' directly (that would defeat tree-shaking).
 */
import * as echarts from 'echarts/core';
import { GaugeChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([GaugeChart, LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export { echarts };

export const CHART_COLORS = {
  accent: '#5b8def',
  good: '#17c17a',
  warning: '#f0a93b',
  critical: '#ef6a6a',
  track: 'rgba(255,255,255,0.06)',
  ink: '#e8eaf0',
  muted: '#878b9a',
  gridline: 'rgba(255,255,255,0.05)',
};

/** Threshold color: blue below warn, amber below crit, red above. */
export function thresholdColor(value: number, warnAt = 75, critAt = 90): string {
  if (value >= critAt) return CHART_COLORS.critical;
  if (value >= warnAt) return CHART_COLORS.warning;
  return CHART_COLORS.accent;
}

export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
