import { Injectable, signal } from '@angular/core';
import { EntityDetail } from './api.types';

export interface SheetEntity {
  type: 'guest' | 'container';
  id: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class SheetService {
  readonly entity = signal<SheetEntity | null>(null);
  readonly hours = signal<4 | 24 | 168>(4);
  readonly detail = signal<EntityDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  open(type: 'guest' | 'container', id: string, name: string): void {
    this.entity.set({ type, id, name });
    this.hours.set(4);
    this.load();
  }

  close(): void {
    this.entity.set(null);
    this.detail.set(null);
    this.error.set(null);
  }

  setHours(h: 4 | 24 | 168): void {
    this.hours.set(h);
    this.load();
  }

  private async load(): Promise<void> {
    const ent = this.entity();
    if (!ent) return;
    this.loading.set(true);
    this.error.set(null);
    this.detail.set(null);
    try {
      const r = await fetch(
        `/api/entity?type=${ent.type}&id=${encodeURIComponent(ent.id)}&hours=${this.hours()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: EntityDetail = await r.json();
      // ignore stale responses after the sheet was closed or switched
      const cur = this.entity();
      if (!cur || cur.id !== ent.id || cur.type !== ent.type) return;
      this.detail.set(d);
    } catch (e) {
      this.error.set(String(e));
    } finally {
      this.loading.set(false);
    }
  }
}
