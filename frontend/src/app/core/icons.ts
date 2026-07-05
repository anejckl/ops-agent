/** Minimal single-color line icon set (viewBox 0 0 24 24), ported from the old app. */

export const ICON_PATHS: Record<string, string> = {
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  memory: '<rect x="4" y="7" width="16" height="4.5" rx="1.2"/><rect x="4" y="12.5" width="16" height="4.5" rx="1.2"/>',
  disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12a8 3 0 0 0 16 0V6"/><path d="M4 12a8 3 0 0 0 16 0"/>',
  gpu: '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M17.5 9.5v5"/>',
  box: '<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r="1"/><circle cx="7" cy="16.5" r="1"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><circle cx="12" cy="13" r="3.4"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.7l6 3.3-6 3.3z" fill="currentColor" stroke="none"/>',
  spark: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.4"/><path d="M21 16.5l-5-5-4 4-3-3-6 6"/>',
  chart: '<rect x="4" y="12" width="4" height="8" rx="0.8"/><rect x="10" y="7" width="4" height="13" rx="0.8"/><rect x="16" y="15" width="4" height="5" rx="0.8"/>',
  flame: '<path d="M12 2.5c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1.6-.7-2.6-1-3 1.2.6 2 2 2 3.7a5 5 0 0 1-10 0c0-5.6 4.5-6.2 6-9.7z"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/>',
  cloud: '<path d="M7.5 18a4 4 0 1 1 .8-7.93A5 5 0 0 1 18 11a3.5 3.5 0 0 1-.5 7H7.5z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.7-4.7"/>',
  download: '<path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 19h16"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  message: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5z"/><path d="M10 18.5a2 2 0 0 0 4 0"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.4 2.3 3.7 5.2 3.7 8.5s-1.3 6.2-3.7 8.5c-2.4-2.3-3.7-5.2-3.7-8.5s1.3-6.2 3.7-8.5z"/>',
};

const CONTAINER_ICONS: [RegExp, string][] = [
  [/frigate/, 'camera'],
  [/jellyfin|plex/, 'play'],
  [/ollama/, 'spark'],
  [/open-webui/, 'message'],
  [/comfyui/, 'image'],
  [/grafana/, 'chart'],
  [/prometheus/, 'flame'],
  [/adguard/, 'shield'],
  [/nextcloud/, 'cloud'],
  [/prowlarr|radarr|sonarr/, 'search'],
  [/qbittorrent/, 'download'],
  [/homarr/, 'grid'],
  [/node-exporter/, 'cpu'],
  [/pve-exporter/, 'server'],
  [/cadvisor/, 'box'],
  [/gpu-exporter/, 'gpu'],
];

export function iconForContainer(name: string): string {
  const n = name.toLowerCase();
  for (const [re, ic] of CONTAINER_ICONS) if (re.test(n)) return ic;
  return 'box';
}
