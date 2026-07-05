import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';
import { StatusBadgeComponent } from './status-badge.component';

@Component({
  selector: 'svc-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, StatusBadgeComponent],
  template: `
    <div class="svc-row" (click)="pressed.emit()">
      <div class="svc-left">
        <div class="svc-icon"><ui-icon [name]="icon()"/></div>
        <div class="svc-text">
          <div class="svc-name">{{ name() }}</div>
          <div class="svc-sub">{{ sub() }}</div>
        </div>
      </div>
      <status-badge [state]="badge()"/>
    </div>`,
})
export class SvcRowComponent {
  readonly icon = input.required<string>();
  readonly name = input.required<string>();
  readonly sub = input('');
  readonly badge = input.required<string>();
  readonly pressed = output<void>();
}
