import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SheetService } from '../core/sheet.service';
import { AreaChartComponent } from '../shared/area-chart.component';
import { fmtEventTime, trendAvg, trendMax } from '../core/format';
import { HealthEvent } from '../core/api.types';

const RANGE_LABELS: Record<number, string> = { 4: '4 ure', 24: '24 ur', 168: '7 dni' };

@Component({
  selector: 'entity-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AreaChartComponent],
  template: `
    <div id="sheet-backdrop" [class.open]="sheet.entity()" (click)="sheet.close()"></div>
    <div id="sheet" [class.open]="sheet.entity()">
      <div class="sheet-handle"></div>
      @if (sheet.entity(); as ent) {
        <div class="sheet-title"><span class="name">{{ sheet.detail()?.name || ent.name }}</span></div>
        <div class="chips">
          @for (h of hoursOptions; track h) {
            <button class="chip" [class.active]="sheet.hours() === h" (click)="sheet.setHours(h)">
              {{ rangeLabel(h) }}
            </button>
          }
        </div>
        @if (sheet.loading()) {
          <div class="muted">Nalagam…</div>
        } @else if (sheet.error()) {
          <div class="muted">Napaka pri nalaganju: {{ sheet.error() }}</div>
        } @else if (sheet.detail(); as d) {
          @if (d.cpu.series.length > 1) {
            <div class="sheet-section">Procesor</div>
            <area-chart [series]="d.cpu.series" [detail]="true"
                        [thresholds]="d.type !== 'container'" [unit]="cpuUnit(d.type)"/>
            <div class="spark-caption">povp. {{ trendAvg(d.cpu.series) }}{{ cpuUnit(d.type) }} · maks. {{ trendMax(d.cpu.series) }}{{ cpuUnit(d.type) }}</div>
          }
          @if (d.mem.series.length > 1) {
            <div class="sheet-section">Pomnilnik</div>
            <area-chart [series]="d.mem.series" [detail]="true"
                        [thresholds]="d.mem.unit !== 'MB'" [unit]="d.mem.unit"/>
            <div class="spark-caption">povp. {{ trendAvg(d.mem.series) }} {{ d.mem.unit }} · maks. {{ trendMax(d.mem.series) }} {{ d.mem.unit }}</div>
          }
          @if (d.cpu.series.length < 2 && d.mem.series.length < 2) {
            <div class="muted" style="padding: 8px 0">Ni podatkov za izbrano obdobje.</div>
          }
          <div class="sheet-section">Dogodki (7 dni)</div>
          @for (ev of d.events.slice(0, 20); track $index) {
            <div class="event-row">
              <span class="when">{{ fmtEventTime(ev.time) }}</span>
              <span [class]="'what ' + evCls(ev)"><b>{{ evName(ev) }}</b> · {{ ev.change.replace('->', '→') }}</span>
            </div>
          } @empty {
            <div class="muted" style="padding: 0 0 6px">Ni zabeleženih dogodkov.</div>
          }
        }
      }
    </div>`,
})
export class EntitySheetComponent {
  readonly sheet = inject(SheetService);
  readonly hoursOptions: (4 | 24 | 168)[] = [4, 24, 168];
  readonly trendAvg = trendAvg;
  readonly trendMax = trendMax;
  readonly fmtEventTime = fmtEventTime;

  rangeLabel(h: number): string {
    return RANGE_LABELS[h];
  }

  cpuUnit(type: string): string {
    return type === 'container' ? '% jedra' : '%';
  }

  evName(ev: HealthEvent): string {
    return ev.entity.replace(/^(vm|container):/, '');
  }

  evCls(ev: HealthEvent): string {
    if (/-> (running|healthy)$/.test(ev.change)) return 'good';
    if (/-> (stopped|unhealthy|exited)$/.test(ev.change)) return 'critical';
    return '';
  }
}
