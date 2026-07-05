import { Injectable, computed, signal } from '@angular/core';
import { Health } from './api.types';

const POLL_MS = 30_000;

/**
 * Polls /api/health every 30s. The endpoint takes ~2s, so an in-flight guard
 * prevents overlap, and stale data is NEVER blanked - a failed refresh keeps
 * the last payload and flips `stale` instead.
 */
@Injectable({ providedIn: 'root' })
export class HealthService {
  readonly health = signal<Health | null>(null);
  readonly lastUpdated = signal<Date | null>(null);
  readonly stale = signal(false);
  readonly loadError = signal<string | null>(null); // only set when there is no data at all

  readonly alerts = computed(() => this.health()?.alerts ?? []);
  readonly maxAlertSeverity = computed(() =>
    this.alerts().some(a => a.severity === 'critical') ? 'critical' : 'warning');

  private inFlight = false;

  constructor() {
    this.refresh();
    setInterval(() => {
      if (!document.hidden) this.refresh();
    }, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isStaleByAge()) this.refresh();
    });
  }

  private isStaleByAge(): boolean {
    const t = this.lastUpdated();
    return !t || Date.now() - t.getTime() > POLL_MS;
  }

  async refresh(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const r = await fetch('/api/health');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: Health = await r.json();
      this.health.set(d);
      this.lastUpdated.set(new Date());
      this.stale.set(false);
      this.loadError.set(null);
    } catch (e) {
      if (this.health()) {
        this.stale.set(true); // keep showing the last good payload
      } else {
        this.loadError.set(String(e));
      }
    } finally {
      this.inFlight = false;
    }
  }
}
