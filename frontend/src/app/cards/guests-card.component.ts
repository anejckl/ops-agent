import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Guest } from '../core/api.types';
import { SvcRowComponent } from '../shared/svc-row.component';
import { IconComponent } from '../shared/icon.component';
import { SheetService } from '../core/sheet.service';
import { fmtGB } from '../core/format';

@Component({
  selector: 'guests-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvcRowComponent, IconComponent],
  template: `
    <div class="card" style="--i: 4">
      <h2><ui-icon name="server"/> VM &amp; LXC</h2>
      @for (g of guests(); track g.vmid) {
        <svc-row icon="server" [name]="g.name" [sub]="sub(g)"
                 [badge]="g.status === 'running' ? 'good' : 'stopped'"
                 (pressed)="sheet.open('guest', '' + g.vmid, g.name)"/>
      }
    </div>`,
})
export class GuestsCardComponent {
  readonly guests = input.required<Guest[]>();
  readonly sheet = inject(SheetService);

  sub(g: Guest): string {
    const free = g.real_disk_free_gb !== undefined
      ? g.real_disk_free_gb
      : g.disk_max_gb - g.disk_used_gb;
    return `#${g.vmid} · CPU ${g.cpu_percent}% · ${fmtGB(free)} GB prosto`;
  }
}
