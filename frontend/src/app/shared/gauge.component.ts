import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy,
  afterNextRender, effect, input, viewChild,
} from '@angular/core';
import type { EChartsType } from 'echarts/core';
import { echarts, CHART_COLORS, thresholdColor, rgba } from '../core/charts';
import { CountUpComponent } from './count-up.component';
import { IconComponent } from './icon.component';

/**
 * Needle-less radial gauge (progress arc, threshold-colored, glowing).
 * The center number is an HTML CountUp overlay, not ECharts text.
 */
@Component({
  selector: 'ui-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CountUpComponent, IconComponent],
  template: `
    <div class="gauge-tile">
      <div class="g-canvas" #canvas></div>
      <div class="g-center">
        <div class="g-value"><count-up [value]="value()" [decimals]="decimals()"/><span class="unit">{{ unit() }}</span></div>
      </div>
      <div class="g-label"><ui-icon [name]="icon()"/>{{ label() }}</div>
      @if (sub()) {
        <div class="gauge-sub">{{ sub() }}</div>
      }
    </div>`,
})
export class GaugeComponent implements OnDestroy {
  readonly value = input.required<number | null>();
  readonly min = input(0);
  readonly max = input(100);
  readonly warnAt = input(75);
  readonly critAt = input(90);
  readonly unit = input('%');
  readonly label = input('');
  readonly icon = input('cpu');
  readonly decimals = input(0);
  readonly sub = input('');

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
      this.value(); // track
      this.apply();
    });
  }

  private apply(): void {
    if (!this.chart) return;
    const v = this.value();
    const val = v == null || isNaN(v) ? this.min() : v;
    const color = thresholdColor(val, this.warnAt(), this.critAt());
    this.chart.setOption({
      animationDurationUpdate: 600,
      animationEasingUpdate: 'cubicOut',
      series: [{
        type: 'gauge',
        startAngle: 210,
        endAngle: -30,
        min: this.min(),
        max: this.max(),
        radius: '100%',
        center: ['50%', '60%'],
        pointer: { show: false },
        progress: {
          show: true,
          roundCap: true,
          width: 9,
          itemStyle: { color, shadowBlur: 12, shadowColor: rgba(color, 0.45) },
        },
        axisLine: { roundCap: true, lineStyle: { width: 9, color: [[1, CHART_COLORS.track]] } },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        detail: { show: false },
        data: [{ value: Math.min(this.max(), Math.max(this.min(), val)) }],
      }],
    });
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.chart?.dispose();
  }
}
