import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Health } from '../core/api.types';
import { GaugeComponent } from '../shared/gauge.component';
import { AreaChartComponent } from '../shared/area-chart.component';
import { fmtGB, trendAvg } from '../core/format';

@Component({
  selector: 'host-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GaugeComponent, AreaChartComponent],
  template: `
    <div class="card" style="--i: 1">
      <h2>Proxmox gostitelj</h2>
      <div class="gauges">
        <ui-gauge [value]="d().node.cpu_percent" unit="%" label="CPU" icon="cpu"/>
        <ui-gauge [value]="ramPct()" unit="%" label="Pomnilnik" icon="memory" [sub]="ramSub()"/>
      </div>
      @if (d().cpu_trend || d().mem_trend) {
        <div class="trend-pair">
          <div>
            @if (d().cpu_trend; as t) {
              <area-chart [series]="t"/>
              <div class="spark-caption">4h · povp. {{ trendAvg(t) }}%</div>
            }
          </div>
          <div>
            @if (d().mem_trend; as t) {
              <area-chart [series]="t"/>
              <div class="spark-caption">4h · povp. {{ trendAvg(t) }}%</div>
            }
          </div>
        </div>
      }
      <div class="tile-sub">Aktiven {{ d().node.uptime_hours }}h</div>
    </div>`,
})
export class HostCardComponent {
  readonly d = input.required<Health>();
  readonly ramPct = computed(() =>
    Math.round(1000 * this.d().node.mem_used_gb / this.d().node.mem_total_gb) / 10);
  readonly ramSub = computed(() =>
    `${fmtGB(this.d().node.mem_used_gb)} / ${fmtGB(this.d().node.mem_total_gb)} GB`);
  readonly trendAvg = trendAvg;
}
