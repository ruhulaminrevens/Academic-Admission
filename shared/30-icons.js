// Inline SVG icon set (24x24, stroke based). No external requests, so it works under a strict CSP.

const iconPaths = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zM4 19a2 2 0 0 1 2-2h13',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2.5.6 4 2.5 4 5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.5-7 8-7s8 3 8 7',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  bookmark: 'M6 3h12v18l-6-4-6 4V3z',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  comment: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  check: 'M5 12l5 5L20 7',
  pin: 'M12 17v5M8 3h8l-1 6 3 3H6l3-3-1-6z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  rss: 'M5 19v.01M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18v.01',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'M6 9l6 6 6-6',
  refresh: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  mail: 'M3 5h18v14H3zM3 7l9 7 9-7',
  phone: 'M7 3h10v18H7zM11 18h2',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2 2M9 2h6',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  play: 'M7 4l13 8-13 8V4z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
};

export function icon(name, size = 18, extra = '') {
  const path = iconPaths[name] || iconPaths.info;
  return `<svg class="icon ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function logoMark(size = 36) {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
<defs><linearGradient id="lm-g" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#10e6a1"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
<rect width="48" height="48" rx="14" fill="url(#lm-g)"/>
<path d="M24 11L8.5 19 24 27l15.500-8L24 11z" fill="#05110d" opacity=".92"/>
<path d="M15 24v7.500c0 2.200 4 4.500 9 4.500s9-2.300 9-4.500V24l-9 4.600L15 24z" fill="#05110d" opacity=".78"/>
<path d="M39.500 19v10" stroke="#05110d" stroke-width="2.200" stroke-linecap="round" opacity=".92"/>
</svg>`;
}
