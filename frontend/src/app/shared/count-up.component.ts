import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';

const REDUCED = typeof matchMedia !== 'undefined'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** rAF number tween (~450ms) with tabular numerals. */
@Component({
  selector: 'count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ display() }}`,
  styles: [':host { font-variant-numeric: tabular-nums; }'],
})
export class CountUpComponent {
  readonly value = input.required<number | null>();
  readonly decimals = input(0);

  readonly display = signal('–');
  private current = 0;
  private raf = 0;

  constructor() {
    effect(() => {
      const target = this.value();
      if (target == null || isNaN(target)) {
        this.display.set('–');
        return;
      }
      if (REDUCED || this.display() === '–') {
        this.current = target;
        this.display.set(this.fmt(target));
        return;
      }
      this.tween(this.current, target);
    });
  }

  private fmt(v: number): string {
    return v.toFixed(this.decimals()).replace(/\.0$/, '');
  }

  private tween(from: number, to: number): void {
    cancelAnimationFrame(this.raf);
    if (from === to) { this.display.set(this.fmt(to)); return; }
    const t0 = performance.now();
    const dur = 450;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      this.current = from + (to - from) * eased;
      this.display.set(this.fmt(this.current));
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
}
