import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
  ReferenceDot, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Brush,
} from "recharts";

import { mkT, C8 } from "./theme.js";
import { Logo, Ic } from "./icons.jsx";
import {
  calcMetrics, buildSampleDataset, extractIV, computeEfficiency,
  metricsToRows, rowsToCsv,
} from "./lib/ivAnalysis.js";
import { getUserData, saveUserData } from "./persistence.js";
import { ChartTip, Toggles, VLookup, RawDataViewer } from "./components/shared.jsx";
import { ProfileGate } from "./components/ProfileGate.jsx";
import { TourOverlay } from "./components/Tour.jsx";
import { Assistant } from "./components/Assistant.jsx";
import { AboutPage } from "./components/AboutPage.jsx";

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [session, setSession] = useState(null); // {id, name, isGuest} | null
  const [dark, setDark] = useState(true);
  const [sideOpen, setSideOpen] = useState(true);
  const [page, setPage] = useState("home");
  const [vizTab, setVizTab] = useState("iv");
  const [chatOpen, setChatOpen] = useState(false);
  const [datasets, setDatasets] = useState([buildSampleDataset()]);
  const [activeDs, setActiveDs] = useState(0);
  const [selConds, setSelConds] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [sheetPicker, setSheetPicker] = useState(null);
  const [cellArea, setCellArea] = useState("");
  const [irradiance, setIrradiance] = useState("");
  const [lookupV, setLookupV] = useState(null);
  const [tourStep, setTourStep] = useState(-1);
  const [showTourPrompt, setShowTourPrompt] = useState(true);
  const fileRef = useRef(null);
  const t = mkT(dark);
  const ds = datasets[activeDs] || null;
  const isGuest = !session || session.isGuest;

  // Restore a named operator's saved library on login.
  useEffect(() => {
    if (session && !session.isGuest) {
      const ud = getUserData(session.id);
      if (ud.datasets && ud.datasets.length > 0) {
        const restored = ud.datasets.map((d) => ({ name: d.name, conditions: d.conditions, ivData: d.ivData }));
        if (restored.length > 0) setDatasets((prev) => prev.concat(restored));
      }
      if (ud.tourDone) setShowTourPrompt(false);
    }
  }, [session]);

  // Persist a named operator's uploaded datasets (everything beyond the sample).
  useEffect(() => {
    if (session && !session.isGuest && datasets.length > 1) {
      const ud = getUserData(session.id);
      ud.datasets = datasets.slice(1).map((d) => ({ name: d.name, conditions: d.conditions, ivData: d.ivData }));
      saveUserData(session.id, ud);
    }
  }, [datasets, session]);

  useEffect(() => {
    if (ds) { const s = {}; ds.conditions.forEach((c) => (s[c] = true)); setSelConds(s); }
  }, [activeDs, datasets.length]);

  const allM = useMemo(() => {
    if (!ds) return {};
    const m = {};
    ds.conditions.forEach((c) => { const pts = ds.ivData[c]; if (pts) m[c] = calcMetrics(pts); });
    return m;
  }, [ds]);

  const activeConds = useMemo(() => (ds ? ds.conditions.filter((c) => selConds[c]) : []), [ds, selConds]);

  // I-V chart: signed current in µA → curve correctly crosses zero at Voc.
  const ivChart = useMemo(() => {
    if (!ds) return [];
    const f = ds.ivData[ds.conditions[0]];
    if (!f) return [];
    return f.map((pt, i) => {
      const row = { voltage: pt.voltage };
      activeConds.forEach((c) => { const pts = ds.ivData[c]; if (pts && pts[i]) row[c] = pts[i].rawCurrent * 1e6; });
      return row;
    });
  }, [ds, activeConds]);

  // P-V chart: signed power in nW.
  const pvChart = useMemo(() => {
    if (!ds) return [];
    const f = ds.ivData[ds.conditions[0]];
    if (!f) return [];
    return f.map((pt, i) => {
      const row = { voltage: pt.voltage };
      activeConds.forEach((c) => { const pts = ds.ivData[c]; if (pts && pts[i]) row[c] = pts[i].voltage * pts[i].rawCurrent * 1e9; });
      return row;
    });
  }, [ds, activeConds]);

  const radarD = useMemo(() => {
    if (!ds || !Object.keys(allM).length) return [];
    const mx = { isc: 0, voc: 0, pmax: 0, ff: 0 };
    ds.conditions.forEach((c) => { const m = allM[c]; if (m) ["isc", "voc", "pmax", "ff"].forEach((k) => { if (m[k] > mx[k]) mx[k] = m[k]; }); });
    return ["Isc", "Voc", "Pmax", "FF"].map((label) => {
      const row = { metric: label };
      const k = label.toLowerCase();
      ds.conditions.forEach((c) => { const m = allM[c]; if (m) row[c] = mx[k] > 0 ? (m[k] / mx[k]) * 100 : 0; });
      return row;
    });
  }, [ds, allM]);

  const efficiency = useMemo(() => {
    if (!ds) return null;
    const r = {};
    let any = false;
    ds.conditions.forEach((c) => {
      const m = allM[c];
      if (m) { const e = computeEfficiency(m.pmax, cellArea, irradiance); if (e != null) { r[c] = e; any = true; } }
    });
    return any ? r : null;
  }, [cellArea, irradiance, ds, allM]);

  const library = useMemo(() => datasets.slice(1).map((d, i) => ({ name: d.name, idx: i + 1, conditions: d.conditions.length })), [datasets]);

  const handleFile = useCallback((f) => {
    if (!f) return;
    f.arrayBuffer().then((buf) => {
      const wb = XLSX.read(buf, { type: "array" });
      const sh = {};
      wb.SheetNames.forEach((n) => { sh[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null }); });
      const valid = Object.keys(sh).filter((s) => { const d = extractIV(sh[s]); return d && d.conditions.length > 0; });
      if (!valid.length) { alert("No valid I-V data found. Expected voltage in column A and current sweeps in columns B+."); return; }
      if (valid.length > 1) { setSheetPicker({ file: f, sheets: sh, valid }); return; }
      doLoad(f.name, sh, valid[0]);
    }).catch((e) => alert("Error reading file: " + e.message));
  }, [datasets.length]);

  function doLoad(fn, sh, sn) {
    const parsed = extractIV(sh[sn]);
    if (!parsed) return;
    setDatasets((prev) => prev.concat([{ name: fn.replace(/\.xlsx?$/i, "") + (sn ? " (" + sn + ")" : ""), conditions: parsed.conditions, ivData: parsed.ivData }]));
    setActiveDs(datasets.length);
    setSheetPicker(null);
    setPage("home");
  }

  function doExportCSV() {
    const csv = rowsToCsv(metricsToRows(ds, allM, efficiency));
    download(new Blob([csv], { type: "text/csv" }), "solar_iv_metrics.csv");
  }
  function doExportXLSX() {
    const rows = metricsToRows(ds, allM, efficiency);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Metrics");
    XLSX.writeFile(wb, "solar_iv_metrics.xlsx");
  }

  function dismissTour() {
    setTourStep(-1); setShowTourPrompt(false);
    if (session && !session.isGuest) { const ud = getUserData(session.id); ud.tourDone = true; saveUserData(session.id, ud); }
  }

  if (!session) return <ProfileGate onEnter={setSession} />;

  const nav = [
    { id: "home", I: Ic.Home, label: "Home" },
    { id: "viz", I: Ic.Chart, label: "Visualizations" },
    { id: "metrics", I: Ic.Bar3, label: "Metrics & Export" },
    { id: "upload", I: Ic.Upl, label: "Import Data" },
  ];
  if (!isGuest) nav.push({ id: "library", I: Ic.Book, label: "Library" });
  nav.push({ id: "about", I: Ic.Info, label: "About" });
  const vizTabs = [{ id: "iv", label: "I-V" }, { id: "pv", label: "P-V" }, { id: "radar", label: "Radar" }, { id: "compare", label: "Compare" }];
  const curNav = nav.find((n) => n.id === page) || nav[0];

  return (
    <div style={{ display: "flex", height: "100vh", background: t.bg, color: t.text, overflow: "hidden" }}>
      {/* Sidebar */}
      <nav style={{ width: sideOpen ? 208 : 50, minWidth: sideOpen ? 208 : 50, background: t.sidebar, borderRight: "1px solid " + t.border, display: "flex", flexDirection: "column", transition: "width .3s cubic-bezier(.4,0,.2,1)", zIndex: 50 }}>
        <div style={{ padding: sideOpen ? "14px 14px 12px" : "14px 8px 12px", borderBottom: "1px solid " + t.border }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo s={sideOpen ? 32 : 26} />
            {sideOpen && <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: "-.01em" }}>SolarVine</div>
              <div className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", marginTop: 1 }}>v3.0.0</div>
            </div>}
          </div>
          {sideOpen && <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, padding: "5px 8px", borderRadius: 6, background: t.inputBg, border: "1px solid " + t.border, fontSize: 9, color: t.textM, letterSpacing: ".06em" }}>
            <span className="statusdot" /><span style={{ color: t.success, fontWeight: 600 }}>ONLINE</span><span style={{ marginLeft: "auto", color: t.textD }}>SMU-2400</span>
          </div>}
        </div>
        {sideOpen && <div className="mono" style={{ padding: "10px 14px 4px", fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600 }}>NAVIGATION</div>}
        <div style={{ flex: 1, padding: "5px 6px", overflow: "auto" }}>{nav.map((n) => {
          const a = page === n.id;
          return (
            <button key={n.id} onClick={() => setPage(n.id)} title={n.label} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: sideOpen ? "8px 10px" : "8px 0", borderRadius: 7, border: "none", background: a ? t.accentS : "transparent", color: a ? t.accent : t.textM, fontSize: 11.5, fontWeight: a ? 600 : 500, marginBottom: 1, justifyContent: sideOpen ? "flex-start" : "center", position: "relative" }}>
              {a && <span style={{ position: "absolute", left: 0, top: "22%", bottom: "22%", width: 2, borderRadius: 2, background: t.accent, boxShadow: "0 0 8px " + t.accent }} />}
              <n.I s={15} />{sideOpen && <span>{n.label}</span>}
              {sideOpen && n.id === "library" && library.length > 0 && <span className="mono" style={{ marginLeft: "auto", fontSize: 8, color: t.textD, padding: "1px 5px", borderRadius: 4, background: t.inputBg, border: "1px solid " + t.border }}>{library.length}</span>}
            </button>
          );
        })}</div>
        <div style={{ padding: "6px 6px 4px", borderTop: "1px solid " + t.border }}>
          <button onClick={() => setChatOpen(!chatOpen)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: sideOpen ? "9px 10px" : "9px 0", borderRadius: 7, border: "1px solid " + (chatOpen ? t.accent + "33" : "transparent"), background: chatOpen ? "linear-gradient(135deg," + t.accent + "18," + t.accent2 + "10)" : t.accentS, color: t.accent, fontSize: 11.5, fontWeight: 600, justifyContent: sideOpen ? "flex-start" : "center" }}><Ic.Bot s={15} />{sideOpen && <span>Lab Assistant</span>}{sideOpen && <span className="statusdot" style={{ marginLeft: "auto" }} />}</button>
        </div>
        <button onClick={() => setSideOpen(!sideOpen)} className="mono" style={{ borderTop: "1px solid " + t.border, background: "none", border: "none", padding: "9px 10px", color: t.textD, display: "flex", alignItems: "center", justifyContent: sideOpen ? "space-between" : "center", gap: 5, fontSize: 9, width: "100%", letterSpacing: ".1em" }}>{sideOpen && <span>COLLAPSE</span>}<Ic.Chv s={12} st={{ transform: sideOpen ? "rotate(180deg)" : "none", transition: "transform .3s" }} /></button>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", marginRight: chatOpen ? 370 : 0, transition: "margin-right .35s cubic-bezier(.4,0,.2,1)" }}>
        <header style={{ padding: "10px 18px", borderBottom: "1px solid " + t.border, background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
          <div style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent," + t.accent + "33 30%," + t.accent2 + "22 70%,transparent)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".18em", fontWeight: 600 }}>{page === "viz" ? "02 / VISUALIZATIONS" : page === "home" ? "01 / DASHBOARD" : page === "metrics" ? "03 / METRICS" : page === "upload" ? "04 / IMPORT" : page === "library" ? "05 / LIBRARY" : "06 / ABOUT"}</div>
            <div style={{ width: 1, height: 14, background: t.border }} />
            <h1 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: "-.01em" }}>{page === "viz" ? "Visualizations" : curNav.label}</h1>
            {ds && page !== "upload" && page !== "about" && <>
              <div style={{ width: 1, height: 14, background: t.border }} />
              <div className="mono" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: t.textM }}><span className="statusdot" /><span>{ds.name}</span><span style={{ color: t.textD }}>· {ds.conditions.length}ch</span></div>
            </>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setDark(!dark)} title={dark ? "Light mode" : "Dark mode"} style={{ background: t.inputBg, border: "1px solid " + t.border, borderRadius: 7, padding: "5px 9px", color: t.text, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>{dark ? <Ic.Sun s={12} /> : <Ic.Moon s={12} />}</button>
            <div style={{ padding: "5px 10px", borderRadius: 7, background: t.inputBg, border: "1px solid " + t.border, fontSize: 10, color: t.text, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>{(isGuest ? "G" : session.name.charAt(0)).toUpperCase()}</div>
              <span style={{ fontWeight: 500 }}>{isGuest ? "Guest" : session.name}</span>
            </div>
            <button onClick={() => setSession(null)} title="Sign out" style={{ background: "none", border: "1px solid " + t.border, borderRadius: 7, padding: 5, color: t.textM }}><Ic.Out s={12} /></button>
          </div>
        </header>

        {page === "viz" && <div style={{ display: "flex", gap: 4, padding: "8px 18px", borderBottom: "1px solid " + t.border, background: t.cardAlt, flexShrink: 0, alignItems: "center" }}>
          <span className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginRight: 6 }}>VIEW ▸</span>
          {vizTabs.map((vt) => { const a = vizTab === vt.id; return <button key={vt.id} onClick={() => setVizTab(vt.id)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid " + (a ? t.accent + "55" : "transparent"), background: a ? "linear-gradient(135deg," + t.accent + "22," + t.accent2 + "15)" : "transparent", color: a ? t.accent : t.textM, fontSize: 10.5, fontWeight: a ? 600 : 500 }}>{vt.label}</button>; })}
        </div>}

        <main style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {/* HOME */}
          {page === "home" && ds && <div className="fadein">
            {showTourPrompt && <div className="slideup corners" style={{ background: "linear-gradient(135deg," + t.accent + "0c," + t.accent2 + "08)", borderRadius: 10, border: "1px solid " + t.accent + "22", padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
              <div className="scanline" />
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 0 24px " + t.accentG }}><Ic.Play s={14} c="#fff" /></div>
                <div><div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>First time here? Take the guided walkthrough.</div><div style={{ fontSize: 11, color: t.textM, lineHeight: 1.5 }}>A short tour through the instrument panel — uploads, I-V analysis, parameter extraction, and the lab assistant.</div></div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 16 }}>
                <button onClick={() => setShowTourPrompt(false)} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid " + t.border, background: "none", color: t.textM, fontSize: 10, fontWeight: 500 }}>Dismiss</button>
                <button onClick={() => { setTourStep(0); setShowTourPrompt(false); }} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, boxShadow: "0 4px 16px " + t.accentG }}><Ic.Play s={11} />Begin Tour</button>
              </div>
            </div>}

            <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 6 }}>SESSION ▸ {new Date().toISOString().slice(0, 10)}</div>
                <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 5, lineHeight: 1.1 }}><span style={{ background: t.grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>Measurement Dashboard</span></h2>
                <p style={{ fontSize: 12, color: t.textM }}>{ds.name} · {ds.conditions.length} conditions · {(ds.ivData[ds.conditions[0]] || []).length} sweep points per channel</p>
              </div>
              <div className="mono" style={{ display: "flex", gap: 8, fontSize: 9, color: t.textM, letterSpacing: ".06em" }}>
                <div style={{ padding: "6px 12px", borderRadius: 6, background: t.card, border: "1px solid " + t.border }}><div style={{ color: t.textD, fontSize: 8 }}>METHOD</div><div style={{ color: t.text, fontWeight: 600, marginTop: 2 }}>4-WIRE KELVIN</div></div>
                <div style={{ padding: "6px 12px", borderRadius: 6, background: t.card, border: "1px solid " + t.border }}><div style={{ color: t.textD, fontSize: 8 }}>STATUS</div><div style={{ color: t.success, fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><span className="statusdot" />VALID</div></div>
              </div>
            </div>

            {/* Best-of stat cards */}
            <div data-tour="stats" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10, marginBottom: 18 }}>
              {(() => {
                const vals = Object.values(allM).filter(Boolean);
                const bp = Math.max(0, ...vals.map((m) => m.pmax));
                const bi = Math.max(0, ...vals.map((m) => m.isc));
                const bv = Math.max(0, ...vals.map((m) => m.voc));
                const bf = Math.max(0, ...vals.map((m) => m.ff));
                const bestOf = (key) => { let bc = "", bw = -Infinity; ds.conditions.forEach((c) => { const m = allM[c]; if (m && m[key] > bw) { bw = m[key]; bc = c; } }); return bc; };
                return [
                  { l: "P_max", sub: "Maximum power", v: (bp * 1e9).toFixed(2), unit: "nW", c: "#fbbf24", IC: Ic.Up, best: bestOf("pmax") },
                  { l: "I_sc", sub: "Short-circuit current", v: (bi * 1e6).toFixed(3), unit: "µA", c: "#22d3ee", IC: Ic.Act, best: bestOf("isc") },
                  { l: "V_oc", sub: "Open-circuit voltage", v: bv.toFixed(3), unit: "V", c: "#38bdf8", IC: Ic.Target, best: bestOf("voc") },
                  { l: "FF", sub: "Fill factor", v: (bf * 100).toFixed(1), unit: "%", c: "#a78bfa", IC: Ic.Rad, best: bestOf("ff") },
                ].map((s, i) => (
                  <div key={i} className="card-glow lift corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "14px 16px", position: "relative", overflow: "hidden", animation: "slideup .4s cubic-bezier(.4,0,.2,1) " + i * 0.06 + "s both" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent," + s.c + "66 30%," + s.c + " 50%," + s.c + "66 70%,transparent)", opacity: 0.6 }} />
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600 }}>BEST {s.l.toUpperCase()}</div>
                        <div style={{ fontSize: 9, color: t.textM, marginTop: 1 }}>{s.sub}</div>
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: s.c + "15", border: "1px solid " + s.c + "33", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><s.IC s={13} c={s.c} /></div>
                    </div>
                    <div className="numflash" style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: t.text, letterSpacing: "-.02em" }}>{s.v}</span>
                      <span className="mono" style={{ fontSize: 11, color: s.c, fontWeight: 600 }}>{s.unit}</span>
                    </div>
                    <div className="mono" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid " + t.border, fontSize: 9, color: t.textD, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 5, height: 5, borderRadius: 3, background: s.c }} /><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.best}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* I-V overview with MPP */}
            <div data-tour="iv-overview" className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "16px 14px 8px 0", marginBottom: 14, position: "relative", overflow: "hidden" }}>
              <div className="scanline" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 18, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ic.Chart s={14} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>I-V Sweep Overview</span></div>
                  <div className="mono" style={{ padding: "2px 7px", borderRadius: 4, background: t.accentS, border: "1px solid " + t.accent + "33", fontSize: 8, color: t.accent, fontWeight: 600, letterSpacing: ".1em" }}>MPP OVERLAY</div>
                </div>
                <button onClick={() => { setPage("viz"); setVizTab("iv"); }} className="mono" style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + t.border, background: "none", color: t.accent, fontSize: 9, fontWeight: 600, letterSpacing: ".06em", display: "flex", alignItems: "center", gap: 4 }}>OPEN FULL VIEW <Ic.Arrow s={10} /></button>
              </div>
              <ResponsiveContainer width="100%" height={220}><LineChart data={ivChart} margin={{ top: 10, right: 20, bottom: 24, left: 36 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={t.border} strokeOpacity={0.5} />
                <XAxis dataKey="voltage" type="number" tick={{ fill: t.textM, fontSize: 9 }} stroke={t.borderS} label={{ value: "VOLTAGE (V)", position: "bottom", offset: 6, fill: t.textD, fontSize: 8, letterSpacing: "0.18em" }} />
                <YAxis tick={{ fill: t.textM, fontSize: 9 }} stroke={t.borderS} label={{ value: "CURRENT (µA)", angle: -90, position: "insideLeft", offset: 0, fill: t.textD, fontSize: 8, letterSpacing: "0.18em", style: { textAnchor: "middle" } }} />
                <RTooltip content={<ChartTip unit="µA" t={t} />} />
                <ReferenceLine y={0} stroke={t.textD} strokeDasharray="3 3" strokeOpacity={0.5} />
                {ds.conditions.slice(0, 4).map((c, ci) => <Line key={c} type="monotone" dataKey={c} stroke={C8[ci % C8.length]} strokeWidth={1.6} dot={false} animationDuration={900} />)}
                {ds.conditions.slice(0, 4).map((c, ci) => { const m = allM[c]; if (!m) return null; return <ReferenceDot key={"m" + c} x={m.vmp} y={m.imp * 1e6} r={3.5} fill={C8[ci % C8.length]} stroke="#fff" strokeWidth={1.5} />; })}
              </LineChart></ResponsiveContainer>
            </div>

            <div data-tour="raw-table"><RawDataViewer t={t} ds={ds} /></div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8, marginTop: 14 }}>
              {[{ l: "Visualizations", d: "I-V · P-V · Radar", ic: Ic.Chart, go: () => setPage("viz") }, { l: "Metrics & Export", d: "Parameters · CSV/XLSX", ic: Ic.Bar3, go: () => setPage("metrics") }, { l: "Import Data", d: "Upload .xlsx · .csv", ic: Ic.Upl, go: () => setPage("upload") }, { l: "Lab Assistant", d: "Auto-analyze dataset", ic: Ic.Bot, go: () => setChatOpen(true) }].map((a, i) => (
                <button key={i} onClick={a.go} className="lift" style={{ background: t.card, border: "1px solid " + t.border, borderRadius: 9, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, color: t.text, fontSize: 11, fontWeight: 500, textAlign: "left" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: t.accentS, border: "1px solid " + t.accent + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><a.ic s={14} c={t.accent} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{a.l}</div><div style={{ fontSize: 9, color: t.textM, marginTop: 1 }}>{a.d}</div></div>
                  <Ic.Arrow s={12} c={t.textD} />
                </button>
              ))}
            </div>
          </div>}

          {/* VIZ */}
          {page === "viz" && ds && <div className="fadein">
            <div data-tour="channels" style={{ background: t.card, borderRadius: 9, border: "1px solid " + t.border, padding: "12px 14px", marginBottom: 10 }}>
              <div className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 8 }}>CHANNEL SELECTION</div>
              <Toggles conds={ds.conditions} sel={selConds} setSel={setSelConds} t={t} />
            </div>
            <div data-tour="vlookup" style={{ background: t.card, borderRadius: 9, border: "1px solid " + t.border, padding: "12px 14px", marginBottom: 10 }}>
              <div className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 8 }}>CURSOR · VOLTAGE LOOKUP</div>
              <VLookup t={t} ds={ds} onLookup={setLookupV} />
            </div>

            {vizTab === "iv" && <div data-tour="iv-chart" className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "16px 14px 8px 0", position: "relative", overflow: "hidden" }}>
              <div className="scanline" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 18, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ic.Chart s={13} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>Current vs. Voltage</span><span className="mono" style={{ padding: "2px 7px", borderRadius: 4, background: t.accentS, border: "1px solid " + t.accent + "33", fontSize: 8, color: t.accent, fontWeight: 600, letterSpacing: ".1em" }}>I = f(V)</span></div>
                <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>{activeConds.length} ACTIVE · {ivChart.length} PTS</div>
              </div>
              <ResponsiveContainer width="100%" height={400}><LineChart data={ivChart} margin={{ top: 10, right: 24, bottom: 30, left: 42 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={t.border} strokeOpacity={0.5} />
                <XAxis dataKey="voltage" type="number" tick={{ fill: t.textM, fontSize: 9 }} label={{ value: "VOLTAGE (V)", position: "bottom", offset: 6, fill: t.textD, fontSize: 8, letterSpacing: "0.18em" }} stroke={t.borderS} />
                <YAxis tick={{ fill: t.textM, fontSize: 9 }} label={{ value: "CURRENT (µA)", angle: -90, position: "insideLeft", offset: 0, fill: t.textD, fontSize: 8, letterSpacing: "0.18em", style: { textAnchor: "middle" } }} stroke={t.borderS} />
                <RTooltip content={<ChartTip unit="µA" t={t} />} />
                <ReferenceLine y={0} stroke={t.textD} strokeDasharray="3 3" strokeOpacity={0.5} />
                {activeConds.map((c) => <Line key={c} type="monotone" dataKey={c} stroke={C8[ds.conditions.indexOf(c) % C8.length]} strokeWidth={1.6} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} animationDuration={900} />)}
                {activeConds.map((c) => { const m = allM[c]; if (!m) return null; return <ReferenceLine key={"vmp" + c} x={m.vmp} stroke={C8[ds.conditions.indexOf(c) % C8.length]} strokeDasharray="3 3" strokeOpacity={0.4} />; })}
                {lookupV != null && <ReferenceLine x={lookupV} stroke={t.warn} strokeWidth={1.5} strokeDasharray="6 3" label={{ value: "V = " + lookupV.toFixed(3), fill: t.warn, fontSize: 9, position: "top" }} />}
                <Brush dataKey="voltage" height={24} stroke={t.accent} fill={t.cardAlt} travellerWidth={8} />
              </LineChart></ResponsiveContainer>
            </div>}

            {vizTab === "pv" && <div data-tour="pv-chart" className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "16px 14px 8px 0", position: "relative", overflow: "hidden" }}>
              <div className="scanline" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 18, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ic.Chart s={13} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>Power vs. Voltage</span><span className="mono" style={{ padding: "2px 7px", borderRadius: 4, background: t.accentS, border: "1px solid " + t.accent + "33", fontSize: 8, color: t.accent, fontWeight: 600, letterSpacing: ".1em" }}>P = V·I</span></div>
                <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>MPP MARKERS</div>
              </div>
              <ResponsiveContainer width="100%" height={400}><AreaChart data={pvChart} margin={{ top: 10, right: 24, bottom: 24, left: 42 }}>
                <defs>{C8.map((col, i) => <linearGradient key={i} id={"pvg" + i} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity={0.18} /><stop offset="100%" stopColor={col} stopOpacity={0} /></linearGradient>)}</defs>
                <CartesianGrid strokeDasharray="2 4" stroke={t.border} strokeOpacity={0.5} /><XAxis dataKey="voltage" type="number" tick={{ fill: t.textM, fontSize: 9 }} label={{ value: "VOLTAGE (V)", position: "bottom", offset: 6, fill: t.textD, fontSize: 8, letterSpacing: "0.18em" }} stroke={t.borderS} /><YAxis tick={{ fill: t.textM, fontSize: 9 }} label={{ value: "POWER (nW)", angle: -90, position: "insideLeft", offset: 0, fill: t.textD, fontSize: 8, letterSpacing: "0.18em", style: { textAnchor: "middle" } }} stroke={t.borderS} /><RTooltip content={<ChartTip unit="nW" t={t} />} />
                <ReferenceLine y={0} stroke={t.textD} strokeDasharray="3 3" strokeOpacity={0.5} />
                {activeConds.map((c) => { const ci = ds.conditions.indexOf(c); const col = C8[ci % C8.length]; return <Area key={c} type="monotone" dataKey={c} stroke={col} fill={"url(#pvg" + ci + ")"} strokeWidth={1.6} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} animationDuration={900} />; })}
                {activeConds.map((c) => { const m = allM[c]; if (!m) return null; return <ReferenceDot key={"p" + c} x={m.vmp} y={m.pmax * 1e9} r={5} fill={C8[ds.conditions.indexOf(c) % C8.length]} stroke="#fff" strokeWidth={2} />; })}
                {lookupV != null && <ReferenceLine x={lookupV} stroke={t.warn} strokeWidth={1.5} strokeDasharray="6 3" />}
              </AreaChart></ResponsiveContainer></div>}

            {vizTab === "radar" && <div data-tour="radar-chart" className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "16px 14px 14px", position: "relative", overflow: "hidden" }}>
              <div className="scanline" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ic.Rad s={13} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>Performance Profile</span><span className="mono" style={{ padding: "2px 7px", borderRadius: 4, background: t.accentS, border: "1px solid " + t.accent + "33", fontSize: 8, color: t.accent, fontWeight: 600, letterSpacing: ".1em" }}>NORMALIZED</span></div>
                <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>0 → 100% RELATIVE</div>
              </div>
              <ResponsiveContainer width="100%" height={400}><RadarChart data={radarD}><PolarGrid stroke={t.border} strokeOpacity={0.4} /><PolarAngleAxis dataKey="metric" tick={{ fill: t.textM, fontSize: 11, fontWeight: 600 }} /><PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: t.textD, fontSize: 8 }} /><RTooltip contentStyle={{ background: t.card, border: "1px solid " + t.border, borderRadius: 8, fontSize: 10 }} />{ds.conditions.map((c, ci) => <Radar key={c} name={c} dataKey={c} stroke={C8[ci % C8.length]} fill={C8[ci % C8.length]} fillOpacity={0.08} strokeWidth={1.5} animationDuration={1000} />)}</RadarChart></ResponsiveContainer></div>}

            {vizTab === "compare" && (() => {
              const bd = activeConds.map((c) => { const m = allM[c]; if (!m) return null; return { name: c, Pmax: m.pmax * 1e9, color: C8[ds.conditions.indexOf(c) % C8.length] }; }).filter(Boolean).sort((a, b) => b.Pmax - a.Pmax);
              return <div className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "16px 14px 8px 0", position: "relative", overflow: "hidden" }}>
                <div className="scanline" />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 18, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ic.Bar3 s={13} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>P_max Comparison</span></div>
                  <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>RANKED · DESC</div>
                </div>
                <ResponsiveContainer width="100%" height={320}><BarChart data={bd} margin={{ top: 14, right: 24, bottom: 36, left: 30 }}><CartesianGrid strokeDasharray="2 4" stroke={t.border} strokeOpacity={0.5} /><XAxis dataKey="name" tick={{ fill: t.textM, fontSize: 9 }} angle={-14} textAnchor="end" stroke={t.borderS} /><YAxis tick={{ fill: t.textM, fontSize: 9 }} label={{ value: "PMAX (nW)", angle: -90, position: "insideLeft", offset: 0, fill: t.textD, fontSize: 8, letterSpacing: "0.18em", style: { textAnchor: "middle" } }} stroke={t.borderS} /><RTooltip contentStyle={{ background: t.card, border: "1px solid " + t.border, borderRadius: 8, fontSize: 10 }} /><Bar dataKey="Pmax" name="Pmax (nW)" radius={[6, 6, 0, 0]} animationDuration={900}>{bd.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar></BarChart></ResponsiveContainer>
              </div>;
            })()}
          </div>}

          {/* METRICS */}
          {page === "metrics" && ds && <div className="fadein">
            <div data-tour="eff-calc" className="corners" style={{ background: "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", borderRadius: 10, border: "1px solid " + t.border, padding: "14px 18px", marginBottom: 12, position: "relative" }}>
              <div className="mono" style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 10 }}>EFFICIENCY CALCULATOR · η = P_max / (G · A)</div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div><label style={{ fontSize: 9, color: t.textM, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>Cell Area</label><div style={{ position: "relative" }}><input value={cellArea} onChange={(e) => setCellArea(e.target.value)} type="number" step="0.001" placeholder="0.01" className="mono" style={{ width: 130, padding: "8px 38px 8px 12px", borderRadius: 7, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 11, outline: "none" }} /><span className="mono" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: t.textD }}>cm²</span></div></div>
                <div><label style={{ fontSize: 9, color: t.textM, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 600 }}>Irradiance</label><div style={{ position: "relative" }}><input value={irradiance} onChange={(e) => setIrradiance(e.target.value)} type="number" step="1" placeholder="1000" className="mono" style={{ width: 130, padding: "8px 38px 8px 12px", borderRadius: 7, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 11, outline: "none" }} /><span className="mono" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: t.textD }}>W/m²</span></div></div>
                <div style={{ flex: 1 }} />
                <div data-tour="export-btns" style={{ display: "flex", gap: 6 }}>
                  <button onClick={doExportCSV} className="lift" style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid " + t.border, background: t.card, color: t.text, fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, letterSpacing: ".06em" }}><Ic.Dl s={12} c={t.accent} />EXPORT CSV</button>
                  <button onClick={doExportXLSX} className="lift" style={{ padding: "8px 14px", borderRadius: 7, border: "none", background: "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")", color: "#fff", fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, letterSpacing: ".06em", boxShadow: "0 4px 14px " + t.accentG }}><Ic.Dl s={12} />EXPORT XLSX</button>
                </div>
              </div>
            </div>
            <div data-tour="metrics-table" className="corners" style={{ background: t.card, borderRadius: 10, border: "1px solid " + t.border, overflow: "hidden", position: "relative" }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid " + t.border, display: "flex", alignItems: "center", justifyContent: "space-between", background: t.cardAlt }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ic.Table s={13} c={t.accent} /><span style={{ fontWeight: 700, fontSize: 12 }}>Extracted Parameters</span></div>
                <span className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>{ds.conditions.length} ROWS · {efficiency ? "8" : "7"} COLS</span>
              </div>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5 }}>
                  <thead><tr style={{ borderBottom: "1px solid " + t.border, background: t.cardAlt }}>{["Condition", "I_sc (µA)", "V_oc (V)", "P_max (nW)", "FF (%)", "R_s (kΩ)", "R_sh (kΩ)"].concat(efficiency ? ["η (%)"] : []).map((h) => <th key={h} className="mono" style={{ padding: "10px 14px", textAlign: h === "Condition" ? "left" : "right", fontSize: 8, textTransform: "uppercase", color: t.textD, fontWeight: 600, letterSpacing: ".14em", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>{ds.conditions.map((c, ci) => { const m = allM[c]; if (!m) return null; const col = C8[ci % C8.length]; return (
                    <tr key={c} style={{ borderBottom: "1px solid " + t.border }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: col, boxShadow: "0 0 8px " + col + "66" }} />{c}</span></td>
                      <td className="mono" style={{ padding: "10px 14px", textAlign: "right" }}>{(m.isc * 1e6).toFixed(3)}</td>
                      <td className="mono" style={{ padding: "10px 14px", textAlign: "right" }}>{m.voc.toFixed(3)}{m.notes.vocBeyondRange ? "*" : ""}</td>
                      <td className="mono" style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: col }}>{(m.pmax * 1e9).toFixed(2)}</td>
                      <td style={{ padding: "10px 14px", textAlign: "right" }}><div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end" }}><div style={{ width: 50, height: 5, borderRadius: 3, background: t.inputBg, overflow: "hidden", border: "1px solid " + t.border }}><div style={{ width: Math.min(100, m.ff * 100) + "%", height: "100%", borderRadius: 2, background: m.ff > 0.5 ? "linear-gradient(90deg,#16a34a,#22c55e)" : m.ff > 0.3 ? "linear-gradient(90deg,#d97706,#f59e0b)" : "linear-gradient(90deg,#dc2626,#f43f5e)", transition: "width .6s ease" }} /></div><span className="mono" style={{ fontSize: 10, minWidth: 36 }}>{(m.ff * 100).toFixed(1)}</span></div></td>
                      <td className="mono" style={{ padding: "10px 14px", textAlign: "right", color: t.textM }}>{(m.rs / 1e3).toFixed(2)}</td>
                      <td className="mono" style={{ padding: "10px 14px", textAlign: "right", color: t.textM }}>{m.rsh === Infinity ? "∞" : (m.rsh / 1e3).toFixed(2)}</td>
                      {efficiency && <td className="mono" style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: t.warn }}>{efficiency[c] != null ? efficiency[c].toPrecision(3) : "-"}</td>}
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
              {Object.values(allM).some((m) => m && m.notes.vocBeyondRange) && <div style={{ padding: "8px 16px", fontSize: 9, color: t.textM, borderTop: "1px solid " + t.border }}>* V_oc lies beyond the measured sweep range — value shown is the last sweep voltage.</div>}
            </div>
          </div>}

          {/* UPLOAD */}
          {page === "upload" && <div className="fadein">
            <div style={{ maxWidth: 560, margin: "0 auto 14px" }}>
              <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 6 }}>04 / DATA INGEST</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.025em", marginBottom: 5 }}>Import Measurement Data</h2>
              <p style={{ fontSize: 11, color: t.textM }}>Drop a workbook with voltage in column A and current sweeps in subsequent columns. Sheet headers become channel labels.</p>
            </div>
            <div data-tour="dropzone" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }} onClick={() => { if (fileRef.current) fileRef.current.click(); }} className="corners" style={{ border: "1.5px dashed " + (dragOver ? t.accent : t.border), borderRadius: 14, padding: "50px 28px", textAlign: "center", background: dragOver ? "linear-gradient(135deg," + t.accent + "14," + t.accent2 + "08)" : "linear-gradient(180deg," + t.card + "," + t.cardAlt + ")", maxWidth: 560, margin: "0 auto", transition: "all .25s", position: "relative", overflow: "hidden", cursor: "pointer" }}>
              <div className="scanline" />
              <div style={{ width: 54, height: 54, borderRadius: 14, background: dragOver ? t.accent : t.accentS, border: "1px solid " + (dragOver ? t.accent : t.accent + "33"), display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", boxShadow: dragOver ? "0 0 32px " + t.accentG : "none", transition: "all .25s" }}><Ic.Upl s={26} c={dragOver ? "#fff" : t.accent} /></div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>{dragOver ? "Release to upload" : "Drop Excel or CSV here"}</div>
              <div style={{ fontSize: 10.5, color: t.textM, marginBottom: 14 }}>or click to browse · supports .xlsx, .xls, .csv</div>
              <div className="lift" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 22px", borderRadius: 9, background: "linear-gradient(135deg," + t.accent + "," + t.accent2 + ")", color: "#fff", fontWeight: 600, fontSize: 11, boxShadow: "0 6px 20px " + t.accentG }}><Ic.File s={12} />Browse Files</div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => { if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]); }} />
              <div className="mono" style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed " + t.border, display: "flex", justifyContent: "center", gap: 18, fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>
                <span>FORMAT · COL A = V, COL B+ = I</span><span>·</span><span>UNITS · VOLTS / AMPS</span>
              </div>
            </div>
            {!isGuest && <p className="mono" style={{ textAlign: "center", fontSize: 9.5, color: t.textM, marginTop: 12, letterSpacing: ".06em" }}>↳ Uploads persist locally to profile: {session.name}</p>}
            {datasets.length > 0 && <div style={{ maxWidth: 560, margin: "22px auto 0" }}>
              <div className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".18em", fontWeight: 600, marginBottom: 8 }}>LOADED IN SESSION · {datasets.length}</div>
              {datasets.map((d, i) => <div key={i} onClick={() => { setActiveDs(i); setPage("home"); }} className="lift" style={{ padding: "11px 14px", borderRadius: 9, marginBottom: 5, background: i === activeDs ? "linear-gradient(135deg," + t.accent + "15," + t.accent2 + "08)" : t.card, border: "1px solid " + (i === activeDs ? t.accent + "55" : t.border), display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9 }}><span style={{ width: 28, height: 28, borderRadius: 6, background: i === activeDs ? t.accent : t.accentS, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + (i === activeDs ? t.accent : t.accent + "22") }}><Ic.File s={13} c={i === activeDs ? "#fff" : t.accent} /></span><span><span style={{ fontWeight: 600, color: i === activeDs ? t.accent : t.text, display: "block" }}>{d.name}</span><span className="mono" style={{ fontSize: 9, color: t.textD, letterSpacing: ".06em" }}>{d.conditions.length} CHANNELS</span></span></span>
                {i === activeDs && <span className="mono" style={{ fontSize: 8, color: t.accent, fontWeight: 700, letterSpacing: ".14em", padding: "3px 8px", borderRadius: 4, background: t.accentS, border: "1px solid " + t.accent + "33" }}>● ACTIVE</span>}
              </div>)}
            </div>}
          </div>}

          {/* LIBRARY */}
          {page === "library" && !isGuest && <div className="fadein">
            <p style={{ fontSize: 11, color: t.textM, marginBottom: 12 }}>Your uploaded datasets — saved locally to profile <strong>{session.name}</strong>.</p>
            {library.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: t.textD }}><Ic.Book s={28} c={t.textD} st={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }} />No uploaded datasets yet.</div>
              : library.map((entry, i) => <div key={i} onClick={() => { setActiveDs(entry.idx); setPage("home"); }} style={{ background: t.card, borderRadius: 10, border: "1px solid " + t.border, padding: "12px 14px", marginBottom: 5, cursor: "pointer" }}><div style={{ fontWeight: 600, fontSize: 12 }}>{entry.name}</div><div style={{ fontSize: 10, color: t.textM, marginTop: 2 }}>{entry.conditions} conditions</div></div>)}
          </div>}

          {page === "about" && <AboutPage t={t} />}
        </main>
      </div>

      <Assistant open={chatOpen} onClose={() => setChatOpen(false)} datasets={datasets} activeDs={activeDs} allMetrics={allM} efficiency={efficiency} t={t} />

      {tourStep >= 0 && <TourOverlay t={t} step={tourStep} onNext={() => setTourStep(tourStep + 1)} onBack={() => { if (tourStep > 0) setTourStep(tourStep - 1); }} onSkip={dismissTour} onNav={setPage} onVizTab={setVizTab} onChat={() => setChatOpen(true)} onCloseChat={() => setChatOpen(false)} />}

      {sheetPicker && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(6px)" }}><div className="slideup" style={{ background: t.card, borderRadius: 14, padding: 24, border: "1px solid " + t.border, maxWidth: 360, width: "90%", boxShadow: t.shadow }}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Select Sheet</div>{sheetPicker.valid.map((s) => <button key={s} onClick={() => doLoad(sheetPicker.file.name, sheetPicker.sheets, s)} style={{ display: "block", width: "100%", padding: "9px 13px", marginBottom: 4, borderRadius: 8, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 11, textAlign: "left" }}>{s}</button>)}<button onClick={() => setSheetPicker(null)} style={{ marginTop: 6, background: "none", border: "none", color: t.textM, fontSize: 10 }}>Cancel</button></div></div>}
    </div>
  );
}
