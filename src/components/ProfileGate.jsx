import { useState, useRef, useEffect } from "react";
import { mkT } from "../theme.js";
import { Logo } from "../icons.jsx";
import { getProfiles, saveProfile } from "../persistence.js";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

/**
 * Local operator gate. No passwords and no backend — entering a name creates or
 * resumes a local profile (its dataset library lives in this browser). "Demo
 * mode" works fully without saving anything.
 */
export function ProfileGate(props) {
  const t = mkT(true);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const canvasRef = useRef(null);
  const [clock, setClock] = useState(new Date());
  const [dd, setDd] = useState(() => {
    const d = [];
    for (let i = 0; i < 48; i++) d.push({ x: i * 0.07, y: 1.4 - i * 0.022 + Math.random() * 0.06 });
    return d;
  });
  const known = Object.entries(getProfiles());

  useEffect(() => {
    const iv = setInterval(() => {
      setDd((p) => { const n = p.slice(1); const l = n[n.length - 1]; n.push({ x: l.x + 0.07, y: Math.max(-0.3, Math.min(1.6, l.y - 0.018 + (Math.random() - 0.5) * 0.07)) }); return n; });
    }, 380);
    const ck = setInterval(() => setClock(new Date()), 1000);
    return () => { clearInterval(iv); clearInterval(ck); };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let w = (c.width = c.offsetWidth * 2), h = (c.height = c.offsetHeight * 2);
    ctx.scale(2, 2); w /= 2; h /= 2;
    const pts = [];
    for (let i = 0; i < 38; i++) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18, r: Math.random() * 0.9 + 0.4, a: Math.random() * 0.14 + 0.05 });
    let raf;
    function draw() {
      ctx.fillStyle = "rgba(4,7,14,.10)"; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(125,211,252," + p.a + ")"; ctx.fill();
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j]; const dx = p.x - q.x, dy = p.y - q.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 150) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = "rgba(125,211,252," + 0.04 * (1 - d / 150) + ")"; ctx.lineWidth = 0.4; ctx.stroke(); }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    function onR() { w = c.width = c.offsetWidth * 2; h = c.height = c.offsetHeight * 2; ctx.scale(2, 2); w /= 2; h /= 2; }
    window.addEventListener("resize", onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, []);

  function enter(e) {
    if (e) e.preventDefault();
    const nm = name.trim();
    if (!nm) { setErr("Enter an operator name"); return; }
    const id = nm.toLowerCase();
    saveProfile(id, nm);
    props.onEnter({ id, name: nm, isGuest: false });
  }

  const iS = { width: "100%", padding: "11px 14px", borderRadius: 9, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 13, outline: "none", transition: "border .2s,box-shadow .2s" };
  const lblS = { fontSize: 9, fontWeight: 600, color: t.textM, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".14em" };
  const tStr = clock.toLocaleTimeString("en-US", { hour12: false });

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#04070e" }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }} />
      <div className="gridbg" style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 0.4, animation: "gridDrift 40s linear infinite" }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 1, opacity: 0.06, pointerEvents: "none" }}>
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={dd} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}><defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} /><stop offset="100%" stopColor="#38bdf8" stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="y" stroke="#38bdf8" strokeWidth={1} fill="url(#dg)" dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer>
      </div>

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: t.textM, fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".06em" }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="statusdot" />SYSTEM ONLINE</span>
          <span style={{ color: t.textD }}>SMU-2400 · CALIBRATED</span>
        </div>
        <div style={{ display: "flex", gap: 18 }}><span>{tStr}</span></div>
      </div>

      <div style={{ position: "relative", zIndex: 10, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="slideup corners" style={{ width: 420, maxWidth: "92vw", background: "rgba(8,12,22,.86)", backdropFilter: "blur(28px)", borderRadius: 16, border: "1px solid rgba(56,189,248,.12)", padding: "38px 38px 32px", boxShadow: "0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent 5%," + t.accent + " 35%,#a78bfa 65%,transparent 95%)", opacity: 0.7 }} />
          <div className="scanline" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <Logo s={36} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em" }}>SOLAR I-V LAB</div>
              <div style={{ fontSize: 8, color: t.textD, letterSpacing: ".18em", marginTop: 1 }}>PV CHARACTERIZATION</div>
            </div>
          </div>
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: t.text, margin: 0, letterSpacing: "-.02em" }}>Operator profile</h1>
            <p style={{ fontSize: 11, color: t.textM, marginTop: 4, fontWeight: 400 }}>Name this session to keep a local dataset library, or continue in demo mode.</p>
          </div>
          <form onSubmit={enter}>
            <div style={{ marginBottom: 16 }}>
              <label style={lblS}>Operator name</label>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} placeholder="Dr. Jane Smith" style={iS} autoFocus />
            </div>
            {known.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={lblS}>Resume profile</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {known.map(([id, prof]) => (
                    <button key={id} type="button" onClick={() => props.onEnter({ id, name: prof.name, isGuest: false })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + t.border, background: t.inputBg, color: t.text, fontSize: 11 }}>{prof.name}</button>
                  ))}
                </div>
              </div>
            )}
            {err && <div className="fadein" style={{ color: t.danger, fontSize: 10, marginBottom: 12, textAlign: "center", padding: "8px 14px", background: "rgba(244,63,94,.06)", borderRadius: 7, border: "1px solid rgba(244,63,94,.16)", fontFamily: "'JetBrains Mono',monospace", letterSpacing: ".06em" }}>▸ {err.toUpperCase()}</div>}
            <button type="submit" style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg," + t.accent + " 0%,#0ea5e9 60%,#7c3aed 110%)", color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: ".02em", boxShadow: "0 8px 28px " + t.accentG + ", inset 0 1px 0 rgba(255,255,255,.18)" }}>Enter lab →</button>
          </form>
          <button onClick={() => props.onEnter({ id: "guest", name: "Guest", isGuest: true })} style={{ width: "100%", padding: "10px 0", borderRadius: 10, border: "1px solid " + t.border, background: "rgba(255,255,255,.015)", color: t.textM, fontSize: 11, marginTop: 9, fontWeight: 500 }}>Continue in demo mode</button>
        </div>
      </div>
    </div>
  );
}
