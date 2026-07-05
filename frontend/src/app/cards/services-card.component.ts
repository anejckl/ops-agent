import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ServicesStatus } from '../core/api.types';
import { SvcRowComponent } from '../shared/svc-row.component';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'services-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvcRowComponent, IconComponent],
  template: `
    <div class="card" style="--i: 6">
      <h2><ui-icon name="globe"/> Storitve · {{ svc().up }}/{{ svc().total }} dostopnih</h2>
      @for (s of downs(); track s.url) {
        <svc-row icon="globe" [name]="s.name" [sub]="s.url.replace('http://', '').replace('https://', '')" badge="down"/>
      }
      @if (ups().length) {
        <div class="svc-grid" [class.gap-top]="downs().length > 0">
          @for (s of ups(); track s.url) {
            <div class="svc-chip">
              <span class="dot"></span>
              <span class="nm">{{ s.name }}</span>
              @if (s.latency_ms != null) {
                <span class="ms">{{ s.latency_ms }} ms</span>
              }
            </div>
          }
        </div>
      }
    </div>`,
})
export class ServicesCardComponent {
  readonly svc = input.required<ServicesStatus>();
  readonly downs = computed(() => this.svc().services.filter(s => !s.up));
  readonly ups = computed(() => this.svc().services.filter(s => s.up));
}
