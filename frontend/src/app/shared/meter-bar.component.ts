import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Threshold-colored horizontal meter; maps [min,max] to 0-100% width. */
@Component({
  selector: 'meter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="meter {{ cls() }}">
      <div [style.width.%]="pct()"></div>
    </div>`,
})
export class MeterBarComponent {
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(100);
  readonly warnAt = input(75);
  readonly critAt = input(90);

  readonly pct = computed(() => {
    const p = 100 * (this.value() - this.min()) / (this.max() - this.min());
    return Math.min(100, Math.max(0, p));
  });
  readonly cls = computed(() => {
    if (this.value() >= this.critAt()) return 'critical';
    if (this.value() >= this.warnAt()) return 'warning';
    return '';
  });
}
