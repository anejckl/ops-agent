import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Anomaly } from '../core/api.types';
import { IconComponent } from '../shared/icon.component';
import { fmtEventTime } from '../core/format';

@Component({
  selector: 'anomalies-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="card" style="--i: 8">
      <h2><ui-icon name="spark"/> Anomalije</h2>
      @for (a of anomalies(); track $index) {
        <div class="event-row">
          <span class="when">{{ fmtEventTime(a.time) }}</span>
          <span class="what critical"><b>{{ a.entity }}</b> · {{ a.metric.toUpperCase() }} {{ a.value }} {{ a.unit || '' }} (običajno ~{{ a.baseline_median }})</span>
        </div>
      }
    </div>`,
})
export class AnomaliesCardComponent {
  readonly anomalies = input.required<Anomaly[]>();
  readonly fmtEventTime = fmtEventTime;
}
