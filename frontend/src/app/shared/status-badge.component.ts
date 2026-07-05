import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Dot + Slovenian label - status is never conveyed by color alone. */
const MAP: Record<string, [string, string]> = {
  good:      ['good', 'Aktiven'],
  healthy:   ['good', 'Zdrav'],
  warning:   ['warning', 'Opozorilo'],
  unhealthy: ['critical', 'Ni zdrav'],
  stopped:   ['critical', 'Ustavljen'],
  critical:  ['critical', 'Kritično'],
  down:      ['critical', 'Nedosegljiv'],
  neutral:   ['neutral', 'Ni podatka'],
};

@Component({
  selector: 'status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="status {{ cls() }}"><span class="dot"></span>{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly state = input.required<string>();
  private entry = computed(() => MAP[this.state()] || MAP['neutral']);
  readonly cls = computed(() => this.entry()[0]);
  readonly label = computed(() => this.entry()[1]);
}
