import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy,
  afterNextRender, effect, input, viewChild,
} from '@angular/core';
import type { EChartsType } from 'echarts/core';
import { echarts, CHART_COLORS, thresholdColor, rgba } from '../core/charts';
import { TrendPoint } from '../core/api.types';

/**
 * Single-series gradient area chart with a glowing line. Dashboard minis hide
 * axes; sheet charts (detail=true) show a minimal time axis + tooltip.
 * Threshold coloring is applied from the LAST value, and only when the series
 * is a true 0-100% scale (thresholds() = true).
 */
@Component({
  selector: 'area-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div [class]="detail() ? 'sheet-chart' : 'trend-chart'" #canvas></div>`,
})
export class AreaChartComponent implements OnDestroy {
  readonly series = input.required<TrendPoint[] | null>();
  readonly detail = input(false);
  readonly thresholds = input(true);
  readonly warnAt = input(75);
  readonly critAt = input(90);
  readonly unit = input('%');

  private canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');
  private chart: EChartsType | null = null;
  private ro: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => {
      const el = this.canvas().nativeElement;
      this.chart = echarts.init(el, undefined, { renderer: 'canvas' });
      this.ro = new ResizeObserver(() => this.chart?.resize());
      this.ro.observe(el);
      this.apply();
    });
    effect(() => {
      this.series(); // track
      this.apply();
    });
  }

  private apply(): void {
    if (!this.chart) return;
    const pts = this.series();
    if (!pts || pts.length < 2) return;
    const data = pts.map(p => [p[0] * 1000, p[1]]);
    const last = pts[pts.length - 1][1];
    const color = this.thresholds()
      ? thresholdColor(last, this.warnAt(), this.critAt())
      : CHART_COLORS.accent;
    const det = this.detail();
    this.chart.setOption({
      animationDuration: 500,
      grid: { left: det ? 34 : 2, right: 4, top: 6, bottom: det ? 18 : 4 },
      tooltip: det ? {
        trigger: 'axis',
        backgroundColor: '#191920',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: CHART_COLORS.ink, fontSize: 11 },
        valueFormatter: (v: unknown) => `${Math.round(Number(v))} ${this.unit()}`,
        axisPointer: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
      } : { show: false },
      xAxis: {
        type: 'time',
        show: det,
        axisLabel: { color: CHART_COLORS.muted, fontSize: 10, hideOverlap: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        show: det,
        min: 0,
        splitNumber: 2,
        axisLabel: { color: CHART_COLORS.muted, fontSize: 10 },
        splitLine: { show: det, lineStyle: { color: CHART_COLORS.gridline } },
      },
      series: [{
        type: 'line',
        smooth: 0.3,
        symbol: 'none',
        data,
        lineStyle: { width: 2, color, shadowBlur: 8, shadowColor: rgba(color, 0.5) },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: rgba(color, 0.32) },
            { offset: 1, color: rgba(color, 0) },
          ]),
        },
      }],
    });
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.chart?.dispose();
  }
}
