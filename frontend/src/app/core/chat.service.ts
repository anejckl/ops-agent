import { Injectable, signal } from '@angular/core';

export interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  pending?: string | null; // status line shown while streaming ("preverjam: ...")
}

/**
 * Chat backed by POST /api/chat/stream (SSE over fetch - ported verbatim from
 * the old app; iOS Safari safe) with fallback to POST /api/chat.
 *
 * `history` is OPAQUE server state: it contains a {"role":"context",...}
 * sentinel entry the backend depends on. It must round-trip byte-identical -
 * never map, filter, or retype it.
 */
@Injectable({ providedIn: 'root' })
export class ChatService {
  readonly messages = signal<ChatMsg[]>([]);
  readonly busy = signal(false);

  private history: unknown[] = [];

  hasHistory(): boolean {
    return this.history.length > 0 || this.messages().length > 0;
  }

  async send(text: string): Promise<void> {
    if (!text.trim() || this.busy()) return;
    this.busy.set(true);
    this.messages.update(m => [...m, { role: 'user', text }, { role: 'assistant', text: '', pending: '…' }]);
    try {
      await this.stream(text);
    } catch {
      // fall back to the non-streaming endpoint (older Safari, or a mid-stream failure)
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, history: this.history }),
        });
        const d = await r.json();
        this.history = d.history;
        this.setLast({ text: d.reply, pending: null });
      } catch (e2) {
        this.setLast({ text: 'Napaka: ' + e2, pending: null });
      }
    } finally {
      this.busy.set(false);
    }
  }

  private setLast(patch: Partial<ChatMsg>): void {
    this.messages.update(m => {
      const out = m.slice();
      out[out.length - 1] = { ...out[out.length - 1], ...patch };
      return out;
    });
  }

  /** SSE byte stream: frames separated by \n\n, "event:" + "data:" lines. */
  private async stream(text: string): Promise<void> {
    const r = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: this.history }),
    });
    if (!r.ok || !r.body) throw new Error('stream unavailable');
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let acc = '';
    let gotDone = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let ev = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event: ')) ev = line.slice(7);
          else if (line.startsWith('data: ')) data += line.slice(6);
        }
        if (!data) continue;
        const d = JSON.parse(data);
        if (ev === 'token') {
          acc += d;
          this.setLast({ text: acc, pending: null });
        } else if (ev === 'reset') {
          acc = '';
          this.setLast({ text: '', pending: '…' });
        } else if (ev === 'status') {
          if (!acc) this.setLast({ pending: `preverjam: ${d}…` });
        } else if (ev === 'done') {
          this.history = d.history;
          this.setLast({ text: d.reply, pending: null });
          gotDone = true;
        } else if (ev === 'error') {
          throw new Error(d);
        }
      }
    }
    if (!gotDone) throw new Error('stream ended without a reply');
  }
}
