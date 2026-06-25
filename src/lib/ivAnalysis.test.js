import { describe, it, expect } from "vitest";
import {
  calcMetrics,
  computeEfficiency,
  extractIV,
  buildSampleDataset,
  metricsToRows,
  rowsToCsv,
} from "./ivAnalysis.js";

describe("calcMetrics — physical invariants", () => {
  const ds = buildSampleDataset();

  it("returns null for too few points", () => {
    expect(calcMetrics([{ voltage: 0, rawCurrent: 1 }])).toBeNull();
    expect(calcMetrics(null)).toBeNull();
  });

  it("produces a fill factor strictly below 100% for every channel", () => {
    // This is the regression guard for the absolute-value bug, which used to
    // yield fill factors of 185–252%.
    ds.conditions.forEach((c) => {
      const m = calcMetrics(ds.ivData[c]);
      expect(m).not.toBeNull();
      expect(m.ff).toBeGreaterThan(0);
      expect(m.ff).toBeLessThan(1); // FF < 100% always
    });
  });

  it("places the maximum-power point inside the power quadrant (V>=0, I>=0)", () => {
    ds.conditions.forEach((c) => {
      const m = calcMetrics(ds.ivData[c]);
      expect(m.vmp).toBeGreaterThanOrEqual(0);
      expect(m.imp).toBeGreaterThanOrEqual(0);
      expect(m.vmp).toBeLessThanOrEqual(m.voc);
      // Pmax must equal Vmp*Imp and be positive.
      expect(m.pmax).toBeCloseTo(m.vmp * m.imp, 12);
      expect(m.pmax).toBeGreaterThan(0);
    });
  });

  it("finds Voc at the true zero-crossing, not the last sweep voltage", () => {
    const m = calcMetrics(ds.ivData["Focused Laser"]);
    // True crossing is between 2.05 V (+78 nA) and 2.1 V (−108 nA).
    expect(m.voc).toBeGreaterThan(2.05);
    expect(m.voc).toBeLessThan(2.1);
    expect(m.notes.vocBeyondRange).toBe(false);
  });

  it("matches independently computed reference values for the sample (Focused Laser)", () => {
    const m = calcMetrics(ds.ivData["Focused Laser"]);
    expect(m.isc * 1e6).toBeCloseTo(1.539, 3); // µA
    expect(m.voc).toBeCloseTo(2.071, 2); // V
    expect(m.pmax * 1e9).toBeCloseTo(1587.0, 0); // nW (Vmp=1.5, Imp=1.058µA)
    expect(m.vmp).toBeCloseTo(1.5, 6);
    expect(m.ff * 100).toBeCloseTo(49.8, 0); // %
  });

  it("is invariant to input row ordering", () => {
    const ordered = ds.ivData["+6mm Focus"];
    const shuffled = [...ordered].reverse();
    const a = calcMetrics(ordered);
    const b = calcMetrics(shuffled);
    expect(b.voc).toBeCloseTo(a.voc, 9);
    expect(b.pmax).toBeCloseTo(a.pmax, 15);
    expect(b.isc).toBeCloseTo(a.isc, 15);
  });

  it("interpolates Isc at V=0 when no exact sample exists", () => {
    // Linear ramp I = 2 − V  →  Isc should interpolate to 2 at V=0.
    const pts = [
      { voltage: 0.1, rawCurrent: 1.9 },
      { voltage: 0.5, rawCurrent: 1.5 },
      { voltage: 1.0, rawCurrent: 1.0 },
      { voltage: 2.0, rawCurrent: 0.0 },
    ];
    const m = calcMetrics(pts);
    expect(m.isc).toBeCloseTo(2.0, 6);
    expect(m.notes.iscExtrapolated).toBe(true);
    expect(m.voc).toBeCloseTo(2.0, 6);
  });

  it("flags Voc beyond range when current never reaches zero", () => {
    const pts = [
      { voltage: 0, rawCurrent: 1.0 },
      { voltage: 0.5, rawCurrent: 0.9 },
      { voltage: 1.0, rawCurrent: 0.8 },
    ];
    const m = calcMetrics(pts);
    expect(m.notes.vocBeyondRange).toBe(true);
    expect(m.voc).toBe(1.0);
  });

  it("derives FF analytically for an ideal square-ish curve", () => {
    // Curve sitting at I=1 until V=1, then dropping to 0 at V≈1 → FF≈ high.
    const pts = [
      { voltage: 0, rawCurrent: 1.0 },
      { voltage: 0.5, rawCurrent: 1.0 },
      { voltage: 0.9, rawCurrent: 1.0 },
      { voltage: 1.0, rawCurrent: 0.5 },
      { voltage: 1.1, rawCurrent: -0.5 },
    ];
    const m = calcMetrics(pts);
    expect(m.isc).toBeCloseTo(1.0, 6);
    expect(m.voc).toBeCloseTo(1.05, 6); // crossing between 1.0 and 1.1
    expect(m.pmax).toBeCloseTo(0.9, 6); // best quadrant point: V=0.9,I=1.0
    expect(m.ff).toBeGreaterThan(0.8);
    expect(m.ff).toBeLessThan(1);
  });
});

describe("computeEfficiency", () => {
  it("computes η = Pmax/(G·A) in percent with cm²→m² conversion", () => {
    // Pmax = 1.587e-6 W, A = 0.01 cm² = 1e-6 m², G = 1000 W/m².
    const eta = computeEfficiency(1.587e-6, 0.01, 1000);
    expect(eta).toBeCloseTo((1.587e-6 / (1000 * 1e-6)) * 100, 9);
    expect(eta).toBeCloseTo(0.1587, 6);
  });

  it("rejects non-positive or non-finite inputs", () => {
    expect(computeEfficiency(1e-6, 0, 1000)).toBeNull();
    expect(computeEfficiency(1e-6, 0.01, 0)).toBeNull();
    expect(computeEfficiency(1e-6, NaN, 1000)).toBeNull();
  });
});

describe("extractIV — workbook parsing", () => {
  it("parses voltage column + current columns with header labels", () => {
    const rows = [
      ["Voltage", "Cell A", "Cell B"],
      [0, 1.5e-6, 1.2e-6],
      [0.5, 1.0e-6, 0.8e-6],
      [1.0, -0.2e-6, -0.1e-6],
    ];
    const out = extractIV(rows);
    expect(out.conditions).toEqual(["Cell A", "Cell B"]);
    expect(out.ivData["Cell A"]).toHaveLength(3);
    expect(out.ivData["Cell A"][0].rawCurrent).toBe(1.5e-6);
    expect(out.ivData["Cell A"][2].current).toBe(0.2e-6); // abs kept for display
  });

  it("returns null for empty or malformed input", () => {
    expect(extractIV([])).toBeNull();
    expect(extractIV([["V"], ["x"]])).toBeNull();
  });

  it("round-trips through calcMetrics", () => {
    const rows = [
      ["V", "C1"],
      [0, 1e-6],
      [1, 0.5e-6],
      [2, 0e-6],
      [2.1, -0.3e-6],
    ];
    const { conditions, ivData } = extractIV(rows);
    const m = calcMetrics(ivData[conditions[0]]);
    expect(m.voc).toBeCloseTo(2.0, 6);
    expect(m.ff).toBeLessThan(1);
  });
});

describe("export helpers", () => {
  const ds = buildSampleDataset();
  const allM = {};
  ds.conditions.forEach((c) => (allM[c] = calcMetrics(ds.ivData[c])));

  it("builds a header + one row per condition", () => {
    const rows = metricsToRows(ds, allM);
    expect(rows[0][0]).toBe("Condition");
    expect(rows).toHaveLength(ds.conditions.length + 1);
  });

  it("adds an efficiency column when efficiency is supplied", () => {
    const eff = {};
    ds.conditions.forEach((c) => (eff[c] = computeEfficiency(allM[c].pmax, 0.01, 1000)));
    const rows = metricsToRows(ds, allM, eff);
    expect(rows[0]).toContain("Efficiency (%)");
    expect(rows[1]).toHaveLength(rows[0].length);
  });

  it("serialises to CSV with quoting", () => {
    const csv = rowsToCsv([["a", "b,c"], [1, 2]]);
    expect(csv).toBe('a,"b,c"\n1,2');
  });
});
