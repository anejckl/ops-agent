import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HealthEvent } from '../core/api.types';
import { IconComponent } from '../shared/icon.component';
import { fmtEventTime } from '../core/format';

@Component({
  selector: 'events-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="card" style="--i: 9">
      <h2><ui-icon name="clock"/> Nedavni dogodki</h2>
      @for (ev of events(); track $index) {
        <div class="event-row">
          <span class="when">{{ fmtEventTime(ev.time) }}</span>
          <span class="what" [class]="'what ' + cls(ev)"><b>{{ entityName(ev) }}</b> · {{ ev.change.replace('->', '→') }}</span>
        </div>
      } @empty {
        <div class="muted" style="padding: 0">Zadnjih 24 ur brez sprememb — vse stabilno.</div>
      }
    </div>`,
})
export class EventsCardComponent {
  readonly events = input.required<HealthEvent[]>();
  readonly fmtEventTime = fmtEventTime;

  entityName(ev: HealthEvent): string {
    return ev.entity.replace(/^(vm|container):/, '');
  }

  cls(ev: HealthEvent): string {
    if (/-> (running|healthy)$/.test(ev.change)) return 'good';
    if (/-> (stopped|unhealthy|exited)$/.test(ev.change)) return 'critical';
    return '';
  }
}
