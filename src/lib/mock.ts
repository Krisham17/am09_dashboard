export type EdgeState = {
  id: string; from: string; to: string;
  speed_kmh: number; queue: number; delay_s: number; flow_vph: number;
};
export type IntersectionState = { id: string; name: string; phase: string; pressure: number };

export type NodeDef = { id: string; x: number; y: number; name: string };

export const NODES: ReadonlyArray<NodeDef> = [
  { id: "A", x: 80,  y: 60,  name: "A (Main & 1st)" },
  { id: "B", x: 280, y: 60,  name: "B (Main & 2nd)" },
  { id: "C", x: 480, y: 60,  name: "C (Main & 3rd)" },
  { id: "D", x: 80,  y: 220, name: "D (Elm & 1st)" },
  { id: "E", x: 280, y: 220, name: "E (Elm & 2nd)" },
  { id: "F", x: 480, y: 220, name: "F (Elm & 3rd)" },
] as const;
export const EDGES = [
  { id: "A-B", from: "A", to: "B" },
  { id: "B-C", from: "B", to: "C" },
  { id: "D-E", from: "D", to: "E" },
  { id: "E-F", from: "E", to: "F" },
  { id: "A-D", from: "A", to: "D" },
  { id: "B-E", from: "B", to: "E" },
  { id: "C-F", from: "C", to: "F" },
] as const;

// --- Week 8–9: Scenarios (visual only) ---
// Keep IDs the same so streaming data still matches; only node positions change.
export const SCENARIO_NODES: Record<string, ReadonlyArray<NodeDef>> = {
  "Grid 3×2": NODES,
  "Downtown (demo)": [
    { id: "A", x: 60,  y: 70,  name: "A (Downtown NW)" },
    { id: "B", x: 210, y: 50,  name: "B (Downtown N)" },
    { id: "C", x: 420, y: 80,  name: "C (Downtown NE)" },
    { id: "D", x: 110, y: 210, name: "D (Downtown W)" },
    { id: "E", x: 280, y: 190, name: "E (Downtown C)" },
    { id: "F", x: 500, y: 230, name: "F (Downtown SE)" },
  ],
  "Arterial (demo)": [
    { id: "A", x: 40,  y: 150, name: "A (Arterial West)" },
    { id: "B", x: 170, y: 140, name: "B (Arterial Mid‑W)" },
    { id: "C", x: 300, y: 130, name: "C (Arterial Mid)" },
    { id: "D", x: 430, y: 120, name: "D (Arterial Mid‑E)" },
    { id: "E", x: 560, y: 110, name: "E (Arterial East)" },
    { id: "F", x: 560, y: 220, name: "F (Bypass)" },
  ],
};

export function initState() {
  const edges: EdgeState[] = EDGES.map((e) => ({
    ...e,
    speed_kmh: 35 + Math.random() * 25,
    queue: Math.random() * 8,
    delay_s: 5 + Math.random() * 25,
    flow_vph: 400 + Math.random() * 800,
  }));
  const ints: IntersectionState[] = (NODES as any).map((n: any) => ({ id: n.id, name: n.name, phase: "NS", pressure: Math.random() * 50 }));
  return { edges, ints };
}

export function stepState(state: { edges: EdgeState[]; ints: IntersectionState[] }) {
  const edges = state.edges.map((e) => {
    const jitter = (s: number) => (Math.random() - 0.5) * s;
    return {
      ...e,
      speed_kmh: Math.max(5, Math.min(60, e.speed_kmh + jitter(6))),
      queue: Math.max(0, e.queue + (Math.random() - 0.4) * 1.2),
      delay_s: Math.max(0, e.delay_s + jitter(3)),
      flow_vph: Math.max(0, e.flow_vph + (Math.random() - 0.4) * 60),
    };
  });
  const phases = ["NS", "EW", "NS-L", "EW-L"] as const;
  const ints = state.ints.map((i) => ({
    ...i,
    phase: Math.random() < 0.1 ? phases[Math.floor(Math.random() * phases.length)] : i.phase,
    pressure: Math.max(0, i.pressure + (Math.random() - 0.45) * 5),
  }));
  return { edges, ints };
}

export function kpisFrom(edges: EdgeState[]) {
  const avgDelay = edges.reduce((s, e) => s + e.delay_s, 0) / Math.max(1, edges.length);
  const totalQueue = edges.reduce((s, e) => s + e.queue, 0);
  const throughputVPM = edges.reduce((s, e) => s + e.flow_vph, 0) / 60;
  const tti = 1 + avgDelay / 60; // simple proxy
  return { avgDelay: round(avgDelay, 1), totalQueue: round(totalQueue, 1), throughputVPM: round(throughputVPM, 1), tti: round(tti, 2) };
}
function round(x: number, d = 2) { const p = Math.pow(10, d); return Math.round(x * p) / p; }