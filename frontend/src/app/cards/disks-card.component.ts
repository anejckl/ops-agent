import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Disk } from '../core/api.types';
import { MeterBarComponent } from '../shared/meter-bar.component';
import { StatusBadgeComponent } from '../shared/status-badge.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'disks-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MeterBarComponent, StatusBadgeComponent, IconComponent],
  template: `
    <div class="card" style="--i: 7">
      <h2><ui-icon name="disk"/> Zdravje diskov</h2>
      @for (dsk of disks(); track dsk.device; let last = $last) {
        <div class="stat-row">
          <span class="label"><ui-icon name="disk"/> <b>{{ dsk.device }}</b>{{ modelText(dsk) }}</span>
          <status-badge [state]="dsk.status"/>
        </div>
        @if (dsk.temp_c != null) {
          <div class="stat-row">
            <span class="label">Temperatura</span>
            <span class="value">{{ dsk.temp_c }}<span class="unit"> °C</span></span>
          </div>
          <meter-bar [value]="dsk.temp_c" [min]="25" [max]="75" [warnAt]="55" [critAt]="65"/>
        }
        <div class="disk-note" [class.gap]="!last">
          @if (hasDefects(dsk)) {
            <span class="warn">Realoc. sektorji: {{ dsk.defects!.reallocated }} · Čakajoči: {{ dsk.defects!.pending }} · Nepopravljivi: {{ dsk.defects!.uncorrectable }}</span><br>
          }
          @if (dsk.nvme) {
            <span [class.warn]="dsk.status !== 'healthy'">Obraba: {{ dsk.nvme.percentage_used ?? '–' }} % · Rezerva: {{ dsk.nvme.available_spare ?? '–' }} %</span><br>
          }
          @if (dsk.power_on_days != null) {
            Vklopljen: {{ dsk.power_on_days }} dni
          }
        </div>
      }
    </div>`,
})
export class DisksCardComponent {
  readonly disks = input.required<Disk[]>();

  modelText(d: Disk): string {
    if (!d.model) return '';
    const m = d.model.length > 28 ? d.model.slice(0, 27) + '…' : d.model;
    return ` · ${m}`;
  }

  hasDefects(d: Disk): boolean {
    return !!d.defects && (d.defects.reallocated > 0 || d.defects.pending > 0 || d.defects.uncorrectable > 0);
  }
}
