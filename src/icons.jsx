/* Instrument logo + inline icon set (no external icon dependency). */

export function Logo(p) {
  const sz = p.s || 28;
  return (
    <svg width={sz} height={sz} viewBox="0 0 40 40" fill="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="lgBg" x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#0b1220" />
          <stop offset="1" stopColor="#1a2236" />
        </linearGradient>
        <linearGradient id="lgCurve" x1="0" y1="40" x2="40" y2="0">
          <stop stopColor="#38bdf8" />
          <stop offset=".5" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx={sz * 0.26} fill="url(#lgBg)" stroke="rgba(56,189,248,.35)" strokeWidth="0.6" />
      <g stroke="rgba(125,211,252,.12)" strokeWidth="0.5">
        <line x1="8" y1="14" x2="32" y2="14" />
        <line x1="8" y1="20" x2="32" y2="20" />
        <line x1="8" y1="26" x2="32" y2="26" />
        <line x1="14" y1="8" x2="14" y2="32" />
        <line x1="20" y1="8" x2="20" y2="32" />
        <line x1="26" y1="8" x2="26" y2="32" />
      </g>
      <path d="M8 32 L32 32 M8 8 L8 32" stroke="rgba(125,211,252,.5)" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M8 12 Q20 12 24 16 Q28 20 30 32" stroke="url(#lgCurve)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="24" cy="16" r="1.5" fill="#fbbf24" stroke="#fff" strokeWidth="0.5" />
    </svg>
  );
}

function SI(ch, p) {
  return (
    <svg
      width={p.s || 16}
      height={p.s || 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={p.c || "currentColor"}
      strokeWidth={p.w || 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={p.st || {}}
    >
      {ch}
    </svg>
  );
}

export const Ic = {
  Home: (p) => SI(<><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>, p),
  Act: (p) => SI(<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />, p),
  Up: (p) => SI(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></>, p),
  Bar3: (p) => SI(<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>, p),
  Upl: (p) => SI(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>, p),
  Chv: (p) => SI(<><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></>, p),
  Sun: (p) => SI(<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>, p),
  Moon: (p) => SI(<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />, p),
  Out: (p) => SI(<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>, p),
  Snd: (p) => SI(<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>, p),
  Bot: (p) => SI(<><path d="M12 8V4H8" /><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" /></>, p),
  Xx: (p) => SI(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, p),
  Plus: (p) => SI(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, p),
  File: (p) => SI(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></>, p),
  Book: (p) => SI(<><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></>, p),
  Rad: (p) => SI(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>, p),
  Search: (p) => SI(<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, p),
  Info: (p) => SI(<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>, p),
  Dl: (p) => SI(<><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>, p),
  Chart: (p) => SI(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>, p),
  Target: (p) => SI(<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>, p),
  Play: (p) => SI(<polygon points="5 3 19 12 5 21 5 3" />, p),
  Table: (p) => SI(<><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></>, p),
  Arrow: (p) => SI(<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>, p),
  Eye: (p) => SI(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>, p),
};
