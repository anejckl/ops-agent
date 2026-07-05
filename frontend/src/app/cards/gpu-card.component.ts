import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GpuStatus } from '../core/api.types';
import { GaugeComponent } from '../shared/gauge.component';
import { MeterBarComponent } from '../shared/meter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { fmtGB } from '../core/format';

@Component({
  selector: 'gpu-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GaugeComponent, MeterBarComponent, IconComponent],
  template: `
    <div class="card" style="--i: 2">
      <h2><ui-icon name="gpu"/> GPU (RTX 3060)</h2>
      <div class="gauges">
        <ui-gauge [value]="gpu().utilization_percent" unit="%" label="Obremenitev" icon="gpu"/>
        <ui-gauge [value]="gpu().temperature_c" unit="°C" label="Temperatura" icon="flame"
                  [min]="30" [max]="95" [warnAt]="80" [critAt]="88"/>
      </div>
      <div class="stat-row" style="margin-top: 14px">
        <span class="label"><ui-icon name="memory"/> VRAM</span>
        <span class="value">{{ vramText() }}</span>
      </div>
      <meter-bar [value]="vramPct()"/>
    </div>`,
})
export class GpuCardComponent {
  readonly gpu = input.required<GpuStatus>();
  readonly vramPct = computed(() => {
    const g = this.gpu();
    return g.mem_total_gb && g.mem_used_gb != null ? 100 * g.mem_used_gb / g.mem_total_gb : 0;
  });
  readonly vramText = computed(() => {
    const g = this.gpu();
    if (g.mem_used_gb == null || g.mem_total_gb == null) return '–';
    return `${fmtGB(g.mem_used_gb)} / ${fmtGB(g.mem_total_gb)} GB`;
  });
}
