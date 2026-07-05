import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Health, StoragePool } from '../core/api.types';
import { MeterBarComponent } from '../shared/meter-bar.component';
import { IconComponent } from '../shared/icon.component';
import { fmtGB } from '../core/format';

@Component({
  selector: 'storage-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeterBarComponent, IconComponent],
  template: `
    <div class="card" style="--i: 3">
      <h2><ui-icon name="disk"/> Shramba</h2>
      @for (s of pools(); track s.storage) {
        <div class="stat-row">
          <span class="label"><ui-icon name="disk"/> {{ s.storage }}</span>
          <span class="value">{{ fmtGB(s.used_gb) }}<span class="unit"> / {{ fmtGB(s.total_gb) }} GB</span></span>
        </div>
        <meter-bar [value]="s.percent_used"/>
        @if (forecastText(s); as fc) {
          <div class="spark-caption" style="margin: -12px 0 16px">{{ fc }}</div>
        }
      }
    </div>`,
})
export class StorageCardComponent {
  readonly d = input.required<Health>();
  readonly pools = computed(() => this.d().storage.filter(s => s.total_gb));
  readonly fmtGB = fmtGB;

  forecastText(s: StoragePool): string | null {
    const fc = this.d().forecasts?.[s.storage];
    if (!fc || fc.days_left == null || fc.days_left > 90) return null;
    return `polno čez ~${Math.round(fc.days_left)} dni (${fc.gb_per_day} GB/dan)`;
  }
}
