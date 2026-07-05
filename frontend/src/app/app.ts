import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HealthService } from './core/health.service';
import { AlertsStripComponent } from './cards/alerts-strip.component';
import { HostCardComponent } from './cards/host-card.component';
import { GpuCardComponent } from './cards/gpu-card.component';
import { StorageCardComponent } from './cards/storage-card.component';
import { GuestsCardComponent } from './cards/guests-card.component';
import { ContainersCardComponent } from './cards/containers-card.component';
import { ServicesCardComponent } from './cards/services-card.component';
import { DisksCardComponent } from './cards/disks-card.component';
import { AnomaliesCardComponent } from './cards/anomalies-card.component';
import { EventsCardComponent } from './cards/events-card.component';
import { ChatDockComponent } from './chat/chat-dock.component';
import { EntitySheetComponent } from './sheet/entity-sheet.component';
import { fmtTime } from './core/format';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AlertsStripComponent, HostCardComponent, GpuCardComponent, StorageCardComponent,
    GuestsCardComponent, ContainersCardComponent, ServicesCardComponent, DisksCardComponent,
    AnomaliesCardComponent, EventsCardComponent, ChatDockComponent, EntitySheetComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  readonly hs = inject(HealthService);
  readonly updatedText = computed(() => {
    const t = this.hs.lastUpdated();
    return t ? fmtTime(t) : 'nalagam…';
  });
}
