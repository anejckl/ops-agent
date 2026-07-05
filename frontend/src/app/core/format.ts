/** Slovenian formatting helpers, ported from the old single-file app. */

const timeFmt = new Intl.DateTimeFormat('sl-SI', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('sl-SI', {
  day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit',
});

export function fmtTime(d: Date): string {
  return timeFmt.format(d);
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

/** Old app's fmtGB: one decimal, trailing .0 dropped. */
export function fmtGB(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

/** "07-04 15:32" style entity-event timestamps come pre-formatted; keep old slice(5). */
export function fmtEventTime(t: string): string {
  return t.slice(5);
}

export function trendAvg(points: [number, number][]): number {
  return Math.round(points.reduce((s, p) => s + p[1], 0) / points.length);
}

export function trendMax(points: [number, number][]): number {
  return Math.round(Math.max(...points.map(p => p[1])));
}
