import { useState, useEffect, useRef } from "react";
import { C8 } from "../theme.js";
import { Ic } from "../icons.jsx";

/** Recharts custom tooltip. */
export function ChartTip(p) {
  if (!p.active || !p.payload || !p.payload.length) return null;
  const t = p.t;
  return (
    <div style={{ background: t.card, border: "1px solid " + t.border, borderRadius: 10, padding: "9px 14px", boxShadow: t.shadow, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 5, color: t.textM, fontSize: 10 }}>V = {Number(p.label).toFixed(3)} V</div>
      {p.payload.map((x, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <div style={{ width: 8, height: 3, borderRadius: 1, background: x.color }} />
          <span style={{ flex: 1, color: t.textM, fontSize: 10 }}>{x.dataKey}</span>
          <span className="mono" style={{ fontWeight: 600, fontSize: 10 }}>{Number(x.value).toFixed(3)} {p.unit}</span>
        </div>
      ))}
    </div>
  );
}

/** Channel on/off toggles. */
export function Toggles(p) {
  const t = p.t;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 10 }}>
      <button onClick={() => { const s = {}; p.conds.forEach((c) => (s[c] = true)); p.setSel(s); }} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid " + t.border, background: "none", color: t.accent, fontSize: 9 }}>All</button>
      <button onClick={() => p.setSel({})} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid " + t.border, background: "none", color: t.textM, fontSize: 9 }}>None</button>
      {p.conds.map((c, ci) => {
        const col = C8[ci % C8.length];
        const on = !!p.sel[c];
        return (
          <button key={c} onClick={() => p.setSel((v) => { const n = { ...v }; n[c] = !n[c]; return n; })} style={{ padding: "3px 9px", borderRadius: 7, border: "1px solid " + (on ? col + "55" : t.border), background: on ? col + "0c" : "transparent", color: on ? col : t.textM, fontSize: 9, fontWeight: on ? 600 : 400, display: "flex", alignItems: "center", gap: 4, opacity: on ? 1 : 0.4, transition: "all .2s" }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: on ? col : t.border }} />{c}
          </button>
        );
      })}
    </div>
  );
}

/** Voltage cursor lookup → nearest measured current per channel. */
export function VLookup(p) {
  const t = p.t;
  const [val, setVal] = useState("");
  const [result, setResult] = useState(null);
  function lookup() {
    const v = parseFloat(val);
    if (isNaN(v)) { setResult(null); return; }
    const r = [];
    p.ds.conditions.forEach((c) => {
      const pts = p.ds.ivData[c];
      let cl = pts[0];
      let md = Math.abs(pts[0].voltage - v);
      pts.forEach((x) => { const d = Math.abs(x.voltage - v); if (d < md) { md = d; cl = x; } });
      r.push({ cond: c, current: cl.rawCurrent, voltage: cl.voltage });
    });
    setResult(r);
    if (p.onLookup) p.onLookup(v);
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: result ? 8 : 0 }}>
        <Ic.Search s={14} c={t.textD} />
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") lookup(); }} placeholder="Voltage (V)..." type="number" step="0.01" style={{ width: 140, padding: "7px 11px", borderRadius: 8, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 11, outline: "none" }} />
        <button onClick={lookup} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontSize: 10, fontWeight: 600 }}>Lookup</button>
        {result && <button onClick={() => { setResult(null); if (p.onLookup) p.onLookup(null); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid " + t.border, background: "none", color: t.textM, fontSize: 10 }}>Clear</button>}
      </div>
      {result && (
        <div style={{ background: t.card, borderRadius: 10, border: "1px solid " + t.border, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead><tr style={{ borderBottom: "1px solid " + t.border }}><th style={{ padding: "7px 10px", textAlign: "left", color: t.textM, fontSize: 8, textTransform: "uppercase" }}>Condition</th><th style={{ padding: "7px 10px", textAlign: "right", color: t.textM, fontSize: 8 }}>I (µA)</th><th style={{ padding: "7px 10px", textAlign: "right", color: t.textM, fontSize: 8 }}>V actual</th></tr></thead>
            <tbody>{result.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid " + t.border }}>
                <td style={{ padding: "6px 10px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: C8[i % C8.length] }} />{r.cond}</span></td>
                <td className="mono" style={{ padding: "6px 10px", textAlign: "right" }}>{(r.current * 1e6).toFixed(4)}</td>
                <td className="mono" style={{ padding: "6px 10px", textAlign: "right", color: t.textM }}>{r.voltage.toFixed(3)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Searchable raw-data table (signed current shown in scientific notation). */
export function RawDataViewer(p) {
  const t = p.t;
  const ds = p.ds;
  const [searchCol, setSearchCol] = useState("voltage");
  const [searchVal, setSearchVal] = useState("");
  const [warning, setWarning] = useState("");
  const [matchIdx, setMatchIdx] = useState(-1);
  const matchRef = useRef(null);

  useEffect(() => { if (matchIdx >= 0 && matchRef.current) matchRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, [matchIdx]);
  if (!ds) return null;

  const allCols = ["voltage"].concat(ds.conditions);
  const rows = ds.ivData[ds.conditions[0]] || [];

  function doSearch() {
    setWarning(""); setMatchIdx(-1);
    const v = searchVal.trim();
    if (!v) return;
    const num = parseFloat(v);
    if (searchCol === "voltage") {
      if (isNaN(num)) { setWarning("Enter a numeric voltage value."); return; }
      const voltages = rows.map((r) => r.voltage);
      const minV = Math.min(...voltages), maxV = Math.max(...voltages);
      if (num < minV || num > maxV) { setWarning("Value " + num.toFixed(2) + "V is outside the measured range (" + minV.toFixed(2) + "V – " + maxV.toFixed(2) + "V)."); return; }
      let bestI = 0, bestD = Math.abs(voltages[0] - num);
      for (let i = 1; i < voltages.length; i++) { const d = Math.abs(voltages[i] - num); if (d < bestD) { bestD = d; bestI = i; } }
      if (bestD > 0.001) setWarning("Exact value not found. Showing nearest match at V = " + voltages[bestI].toFixed(3) + "V (Δ = " + bestD.toFixed(4) + "V).");
      setMatchIdx(bestI);
    } else {
      if (isNaN(num)) { setWarning("Enter a numeric current value (in Amps, e.g. 1.5e-6)."); return; }
      const pts = ds.ivData[searchCol];
      if (!pts || pts.length === 0) { setWarning('No data for condition "' + searchCol + '".'); return; }
      let bestI = 0, bestD = Math.abs(pts[0].rawCurrent - num);
      for (let i = 1; i < pts.length; i++) { const d = Math.abs(pts[i].rawCurrent - num); if (d < bestD) { bestD = d; bestI = i; } }
      const relErr = pts[bestI].rawCurrent !== 0 ? bestD / Math.abs(pts[bestI].rawCurrent) : bestD;
      if (relErr > 0.1) setWarning("No close match found. Nearest is " + pts[bestI].rawCurrent.toExponential(3) + " A at V = " + pts[bestI].voltage.toFixed(3) + "V.");
      else if (bestD > 0) setWarning("Nearest match: " + pts[bestI].rawCurrent.toExponential(3) + " A at V = " + pts[bestI].voltage.toFixed(3) + "V.");
      setMatchIdx(bestI);
    }
  }
  const isErr = (w) => w.indexOf("outside") !== -1 || w.indexOf("No close") !== -1 || w.indexOf("not found") !== -1;

  return (
    <div style={{ background: t.card, borderRadius: 12, border: "1px solid " + t.border, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + t.border, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Ic.Table s={14} c={t.accent} /><span style={{ fontWeight: 600, fontSize: 12 }}>Raw Data</span></div>
        <span style={{ fontSize: 9, color: t.textM }}>{rows.length} rows × {allCols.length} cols</span>
      </div>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid " + t.border, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select value={searchCol} onChange={(e) => { setSearchCol(e.target.value); setWarning(""); setMatchIdx(-1); }} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 10, outline: "none" }}>
          <option value="voltage">Voltage (V)</option>
          {ds.conditions.map((c) => <option key={c} value={c}>{c} (A)</option>)}
        </select>
        <input value={searchVal} onChange={(e) => { setSearchVal(e.target.value); setWarning(""); }} onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }} placeholder={searchCol === "voltage" ? "e.g. 1.5" : "e.g. 1.5e-6"} style={{ width: 130, padding: "5px 9px", borderRadius: 6, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 10, outline: "none" }} />
        <button onClick={doSearch} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: t.accent, color: "#fff", fontSize: 10, fontWeight: 600 }}>Find</button>
        {matchIdx >= 0 && <button onClick={() => { setMatchIdx(-1); setWarning(""); setSearchVal(""); }} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid " + t.border, background: "none", color: t.textM, fontSize: 10 }}>Clear</button>}
      </div>
      {warning && (
        <div style={{ padding: "7px 14px", background: isErr(warning) ? "rgba(239,68,68,.06)" : "rgba(245,158,11,.06)", borderBottom: "1px solid " + t.border, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isErr(warning) ? t.danger : t.warn} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <span style={{ fontSize: 10, color: isErr(warning) ? t.danger : t.warn }}>{warning}</span>
        </div>
      )}
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead style={{ position: "sticky", top: 0, background: t.card, zIndex: 2 }}><tr>{allCols.map((h, i) => { const isSearched = h === (searchCol === "voltage" ? "voltage" : searchCol); return <th key={i} style={{ padding: "6px 8px", textAlign: i === 0 ? "left" : "right", color: isSearched ? t.accent : t.textM, fontSize: 8, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "2px solid " + (isSearched ? t.accent : t.border), fontWeight: 600, whiteSpace: "nowrap" }}>{i === 0 ? "V (V)" : h}</th>; })}</tr></thead>
          <tbody>{rows.map((row, ri) => {
            const isMatch = ri === matchIdx;
            return (
              <tr key={ri} ref={isMatch ? matchRef : null} style={{ borderBottom: "1px solid " + t.border, background: isMatch ? "rgba(59,130,246,.12)" : "transparent", transition: "background .2s" }}>
                <td className="mono" style={{ padding: "5px 8px", fontSize: 9, fontWeight: isMatch ? 700 : 600, color: isMatch ? t.accent : t.text }}>{row.voltage.toFixed(2)}</td>
                {ds.conditions.map((c, ci) => { const pt = ds.ivData[c][ri]; return <td key={ci} className="mono" style={{ padding: "5px 8px", fontSize: 9, textAlign: "right", color: isMatch && c === searchCol ? t.accent : C8[ci % C8.length], fontWeight: isMatch && c === searchCol ? 700 : 400 }}>{pt ? pt.rawCurrent.toExponential(3) : "-"}</td>; })}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}
