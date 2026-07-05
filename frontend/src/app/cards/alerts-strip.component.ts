import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HealthService } from '../core/health.service';
import { IconComponent } from '../shared/icon.component';
import { StatusBadgeComponent } from '../shared/status-badge.component';
import { fmtDateTime } from '../core/format';

@Component({
  selector: 'alerts-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, StatusBadgeComponent],
  template: `
    @if (hs.alerts().length) {
      <div class="card alert-strip" [class.critical]="hs.maxAlertSeverity() === 'critical'" style="--i: 0">
        <h2><ui-icon name="bell"/> Aktivni alarmi ({{ hs.alerts().length }})</h2>
        @for (a of hs.alerts(); track a.alertname) {
          <div class="alert-row">
            <div class="alert-head">
              <status-badge [state]="a.severity === 'critical' ? 'critical' : 'warning'"/>
              <b>{{ a.alertname || 'Alarm' }}</b>
            </div>
            @if (a.summary) {
              <div class="alert-summary">{{ a.summary }}</div>
            }
            @if (a.started) {
              <div class="alert-when">od {{ fmtDateTime(a.started) }}</div>
            }
          </div>
        }
      </div>
    }`,
})
export class AlertsStripComponent {
  readonly hs = inject(HealthService);
  readonly fmtDateTime = fmtDateTime;
}
