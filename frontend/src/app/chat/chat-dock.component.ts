import {
  ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect,
  inject, signal, viewChild,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatService, ChatMsg } from '../core/chat.service';
import { renderMarkdownish } from '../core/markdown';

const SUGGESTIONS = [
  'Kateri container porabi največ pomnilnika?',
  'So kakšni aktivni alarmi?',
  'Kaj se je spremenilo zadnjih 24 ur?',
  'Kakšno je stanje Frigate containerja?',
  'Kako obremenjen je GPU?',
];

@Component({
  selector: 'chat-dock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="chat">
      <div id="msgs" #msgs [class.show]="chat.messages().length">
        @for (m of chat.messages(); track $index) {
          <div class="msg {{ m.role }}">
            @if (m.pending && !m.text) {
              <span class="pending">{{ m.pending }}</span>
            } @else {
              <span [innerHTML]="render(m)"></span>
            }
          </div>
        }
      </div>
      @if (!chat.hasHistory()) {
        <div class="chips">
          @for (s of suggestions; track s) {
            <button class="chip" (click)="sendSuggestion(s)">{{ s }}</button>
          }
        </div>
      }
      <div id="inputRow">
        <input id="q" [value]="draft()" (input)="draft.set(q.value)" #q
               placeholder="Vprašaj kaj o homelabu..." autocomplete="off"
               (keydown.enter)="send()">
        <button id="send" [disabled]="chat.busy()" (click)="send()">Pošlji</button>
      </div>
    </div>`,
})
export class ChatDockComponent {
  readonly chat = inject(ChatService);
  readonly suggestions = SUGGESTIONS;
  readonly draft = signal('');
  private sanitizer = inject(DomSanitizer);
  private msgsEl = viewChild.required<ElementRef<HTMLDivElement>>('msgs');

  constructor() {
    // keep scrolled to the newest message while streaming
    afterRenderEffect(() => {
      this.chat.messages();
      const el = this.msgsEl().nativeElement;
      el.scrollTop = el.scrollHeight;
    });
  }

  render(m: ChatMsg): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(renderMarkdownish(m.text));
  }

  send(): void {
    const text = this.draft().trim();
    if (!text || this.chat.busy()) return;
    this.draft.set('');
    this.chat.send(text);
  }

  sendSuggestion(s: string): void {
    if (this.chat.busy()) return;
    this.chat.send(s);
  }
}
