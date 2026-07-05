import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Container } from '../core/api.types';
import { SvcRowComponent } from '../shared/svc-row.component';
import { IconComponent } from '../shared/icon.component';
import { SheetService } from '../core/sheet.service';
import { iconForContainer } from '../core/icons';

@Component({
  selector: 'containers-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvcRowComponent, IconComponent],
  template: `
    <div class="card" style="--i: 5">
      <h2><ui-icon name="box"/> Docker (docker-vm)</h2>
      @for (c of containers(); track c.name) {
        <svc-row [icon]="iconForContainer(c.name)" [name]="c.name" [sub]="c.status"
                 [badge]="badge(c)" (pressed)="sheet.open('container', c.name, c.name)"/>
      }
    </div>`,
})
export class ContainersCardComponent {
  readonly containers = input.required<Container[]>();
  readonly sheet = inject(SheetService);
  readonly iconForContainer = iconForContainer;

  badge(c: Container): string {
    if (c.health === 'unhealthy') return 'unhealthy';
    if (c.health === 'healthy') return 'healthy';
    if (c.state === 'running') return 'good';
    return 'stopped';
  }
}
