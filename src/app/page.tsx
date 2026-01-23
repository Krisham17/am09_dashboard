"use client";
import React from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, CartesianGrid, Cell
} from "recharts";
import type { EdgeState, IntersectionState } from "../lib/mock";
import { EDGES, SCENARIO_NODES } from "../lib/mock";

function round(x: number, d = 2) {
  const p = Math.pow(10, d);
  return Math.round(x * p) / p;
}

type SeriesPoint = { t: string; avgDelay: number; totalQueue: number; throughput: number };

type Snapshot = {
  ts: number;
  tag: string;
  kpis: { avgDelay: number; totalQueue: number; throughputVPM: number };
  selected: string;
};

type Tone = "neutral" | "emerald" | "amber" | "rose" | "sky" | "indigo" | "violet";

// ===== Performance knobs =====
const APPLY_HZ = 20; // max UI updates per second (coalesces bursts)
const FRAME_MS = 1000 / APPLY_HZ;
const SERIES_MAX = 60; // cap time-series length to bound memory/GC

export default function Page() {
  // live UI state
  const [edges, setEdges] = React.useState<EdgeState[]>([]);
  const [ints, setInts] = React.useState<IntersectionState[]>([]);
  const [series, setSeries] = React.useState<SeriesPoint[]>([]);
  const [selected, setSelected] = React.useState<string>("A");
  const sel = React.useMemo(() => ints.find((i) => i.id === selected), [ints, selected]);
  const [kpis, setKpis] = React.useState({ avgDelay: 0, totalQueue: 0, throughputVPM: 0 });
  const [paused, setPaused] = React.useState(false);
  const [chartMode, setChartMode] = React.useState<"trend" | "congestion">("trend");

  // Week 8–9: settings + results strip + run notes
  const [scenario, setScenario] = React.useState("Grid 3×2");
  
  // View Modes
  const [viewMode, setViewMode] = React.useState("Speed View"); // "Speed View" | "Queue View" | "Delay View"
  
  const [density, setDensity] = React.useState("Comfortable"); 
  const [snapshotTag, setSnapshotTag] = React.useState("");
  const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);

  const cardPad = density === "Compact" ? "p-3" : "p-5";

  // derived: nodes for selected scenario
  const nodes = React.useMemo(
    () => SCENARIO_NODES[scenario] ?? SCENARIO_NODES["Grid 3×2"],
    [scenario]
  );

  // refs for a low-latency scheduler that coalesces updates
  const latestRef = React.useRef<any | null>(null);
  const lastApplyRef = React.useRef(0);
  const pausedRef = React.useRef(false);
  
  // Sync ref
  React.useEffect(() => { pausedRef.current = paused; }, [paused]);

  const applyTick = React.useCallback((msg: any) => {
    React.startTransition(() => {
      setEdges(msg.edges as EdgeState[]);
      setInts(msg.ints as IntersectionState[]);
      setKpis({
        avgDelay: msg.kpis.avgDelay,
        totalQueue: msg.kpis.totalQueue,
        throughputVPM: msg.kpis.throughputVPM,
      });

      setSeries((prev) => {
        const nowStr = new Date(msg.ts).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
        const pt: SeriesPoint = {
          t: nowStr,
          avgDelay: msg.kpis.avgDelay,
          totalQueue: msg.kpis.totalQueue,
          throughput: msg.kpis.throughputVPM,
        };
        const next = [...prev, pt];
        if (next.length > SERIES_MAX) return next.slice(next.length - SERIES_MAX);
        return next;
      });
    });
  }, []);

  React.useEffect(() => {
    let handle = 0;
    const loop = () => {
      const now = performance.now();
      if (!pausedRef.current && latestRef.current && now - lastApplyRef.current >= FRAME_MS) {
        applyTick(latestRef.current);
        latestRef.current = null;
        lastApplyRef.current = now;
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [applyTick]);

  React.useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onmessage = (e) => {
      if (e.data.startsWith(":")) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "tick") {
          latestRef.current = msg;
        }
      } catch (err) {
        console.error("Stream parse error", err);
      }
    };
    return () => es.close();
  }, []);

  const takeSnapshot = () => {
    const snap: Snapshot = {
      ts: Date.now(),
      tag: snapshotTag || `Run #${snapshots.length + 1}`,
      kpis: { ...kpis },
      selected,
    };
    setSnapshots((prev) => [snap, ...prev]);
    setSnapshotTag("");
  };

  const exportCsv = () => {
    const headers = ["Tag", "Time", "Avg Delay (s)", "Total Queue (veh)", "Throughput (vpm)"];
    const rows = snapshots.map(s => [
      `"${s.tag.replace(/"/g, '""')}"`, // escape quotes for CSV safety
      new Date(s.ts).toLocaleString(),
      round(s.kpis.avgDelay),
      round(s.kpis.totalQueue),
      round(s.kpis.throughputVPM)
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "traffic_run_notes.csv";
    link.click();
  };

  return (
    <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">AM09 • Smart Traffic Dashboard</h1>
          <p className="text-neutral-500 text-sm">Real-time signal optimization & telemetry</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Selector */}
          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-md px-2 py-1">
            <span className="text-xs font-semibold text-neutral-400 uppercase">View</span>
            <select 
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              value={viewMode}
              onChange={e => setViewMode(e.target.value)}
            >
              <option value="Speed View">Speed View</option>
              <option value="Queue View">Queue View</option>
              <option value="Delay View">Delay View</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-md px-2 py-1">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Map</span>
            <select 
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              value={scenario}
              onChange={e => setScenario(e.target.value)}
            >
              {Object.keys(SCENARIO_NODES).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-md px-2 py-1">
            <span className="text-xs font-semibold text-neutral-400 uppercase">Size</span>
            <select 
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              value={density}
              onChange={e => setDensity(e.target.value)}
            >
              <option value="Comfortable">Comfortable</option>
              <option value="Compact">Compact</option>
            </select>
          </div>

          <button
            onClick={() => setPaused(!paused)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors border ${
              paused 
                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100" 
                : "bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard title="Avg Delay" value={`${kpis.avgDelay}s`} label="per vehicle" tone="rose" />
        <KpiCard title="Total Queue" value={Math.round(kpis.totalQueue).toString()} label="vehicles" tone="amber" />
        <KpiCard title="Throughput" value={Math.round(kpis.throughputVPM).toString()} label="veh/min" tone="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Visualization */}
        <div className={`col-span-1 lg:col-span-2 card ${cardPad} relative overflow-hidden flex flex-col h-[500px] lg:h-auto`}>
          <div className="flex justify-between items-center mb-4">
             <h2 className="font-semibold text-neutral-800">Live Junction Map</h2>
             <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-1 rounded">
               {viewMode}
             </span>
          </div>
          
          <div className="flex-1 bg-neutral-50 rounded-xl border border-neutral-100 relative shadow-inner overflow-hidden">
             <svg width="100%" height="100%" viewBox="0 0 600 300" className="absolute inset-0 w-full h-full pointer-events-none select-none">
                {/* Edges */}
                {edges.map((e) => {
                  const n1 = nodes.find(n => n.id === e.from);
                  const n2 = nodes.find(n => n.id === e.to);
                  if (!n1 || !n2) return null;
                  return (
                    <g key={e.id}>
                      <line x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} stroke="#e5e5e5" strokeWidth="8" strokeLinecap="round" />
                      <line 
                        x1={n1.x} y1={n1.y} x2={n2.x} y2={n2.y} 
                        stroke={getEdgeColor(viewMode, e)} 
                        strokeWidth="4" 
                        strokeLinecap="round" 
                      />
                    </g>
                  );
                })}
                {/* Nodes */}
                {nodes.map((n) => {
                  const iState = ints.find(i => i.id === n.id);
                  const isSel = selected === n.id;
                  return (
                    <g key={n.id} onClick={() => setSelected(n.id)} className="pointer-events-auto cursor-pointer transition-transform hover:scale-110">
                      <circle cx={n.x} cy={n.y} r={18} fill="white" className="drop-shadow-sm" />
                      <circle cx={n.x} cy={n.y} r={16} fill={isSel ? "#2563eb" : "white"} stroke={isSel ? "#1d4ed8" : "#d4d4d4"} strokeWidth={3} />
                      <text x={n.x} y={n.y + 4} textAnchor="middle" fill={isSel ? "white" : "#404040"} fontSize="11" fontWeight="bold">
                        {n.id}
                      </text>
                      {iState && (
                        <text x={n.x} y={n.y - 24} textAnchor="middle" fill="#666" fontSize="10" className="bg-white/50">
                          {iState.phase}
                        </text>
                      )}
                    </g>
                  );
                })}
             </svg>
          </div>

          {/* New Footer Legend (Moved outside map area) */}
          <div className="mt-4 border-t border-neutral-100 pt-3 flex flex-wrap gap-4 text-xs text-neutral-600">
             <div className="flex items-center gap-2 font-medium text-neutral-800 pr-2 border-r border-neutral-200">
                Legend
             </div>
             
             {viewMode === "Speed View" && (
                <>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Fast (&gt;45km)</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Medium</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span><span>Slow (&lt;25km)</span></div>
                </>
             )}
             
             {viewMode === "Queue View" && (
                <>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span><span>Short (&lt;3)</span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span><span>Medium (3-7)</span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span><span>Long (&gt;7)</span></div>
                </>
             )}

             {viewMode === "Delay View" && (
                <>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span><span>Low</span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500"></span><span>Medium</span></div>
                   <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-900"></span><span>High</span></div>
                </>
             )}

             <div className="flex items-center gap-1.5 ml-auto pl-4 border-l border-neutral-100">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-600 bg-blue-600"></span>
                <span>Selected</span>
             </div>
          </div>
        </div>

        {/* Right Column: Charts & Details */}
        <div className="col-span-1 flex flex-col gap-4 h-full">
          
          <div className={`card ${cardPad} flex-none h-48 flex flex-col`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-neutral-500">Network Trend</h3>
              <div className="flex bg-neutral-100 rounded p-0.5">
                <button 
                  onClick={() => setChartMode("trend")}
                  className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${chartMode === "trend" ? "bg-white shadow text-neutral-800" : "text-neutral-500"}`}
                >
                  Trend
                </button>
                <button 
                  onClick={() => setChartMode("congestion")}
                  className={`px-2 py-0.5 text-xs rounded font-medium transition-all ${chartMode === "congestion" ? "bg-white shadow text-neutral-800" : "text-neutral-500"}`}
                >
                  Metric
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === "trend" ? (
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                    <XAxis dataKey="t" tick={{fontSize: 10}} interval={15} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{fontSize: 10}} width={25} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10}} width={25} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{fontSize: '12px', borderRadius: '8px'}} itemStyle={{padding: 0}} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }} />
                    <Line 
                      yAxisId="left" 
                      type="monotone" 
                      name="Delay (s)" 
                      dataKey="avgDelay" 
                      stroke="#f43f5e" 
                      dot={false} 
                      strokeWidth={2} 
                      activeDot={{r: 4}} 
                      isAnimationActive={false} 
                    />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      name="Flow" 
                      dataKey="throughput" 
                      stroke="#10b981" 
                      dot={false} 
                      strokeWidth={2} 
                      activeDot={{r: 4}} 
                      isAnimationActive={false} 
                    />
                  </LineChart>
                ) : (
                  <BarChart data={edges} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f5f5f5" />
                    <XAxis type="number" hide domain={[0, 'dataMax + 2']} />
                    <YAxis dataKey="id" type="category" tick={{fontSize: 9}} width={30} tickLine={false} axisLine={false} interval={0} />
                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '12px', borderRadius: '8px'}} />
                    <Bar 
                      dataKey={viewMode === "Speed View" ? "speed_kmh" : viewMode === "Delay View" ? "delay_s" : "queue"} 
                      name={viewMode} 
                      radius={[0, 4, 4, 0]} 
                      barSize={12}
                      isAnimationActive={false}
                    >
                      {edges.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getEdgeColor(viewMode, entry)} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`card ${cardPad} flex-1 overflow-auto min-h-[200px]`}>
             <div className="flex justify-between items-start mb-3">
               <div>
                 <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Inspection</h3>
                 <p className="text-lg font-bold text-neutral-900">{sel ? sel.name : "Select a node"}</p>
               </div>
               {sel && <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded font-mono border border-blue-100">{sel.phase}</span>}
             </div>
             
             {sel ? (
               <div className="space-y-3">
                 <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Pressure Score</span> 
                    <span className="font-mono font-medium">{round(sel.pressure)}</span>
                 </div>
                 <div className="h-px bg-neutral-100 my-2" />
                 <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">Inbound Links</div>
                 <div className="space-y-2">
                   {edges.filter(e => e.to === sel.id).map(e => (
                     <div key={e.id} className="bg-neutral-50 rounded-lg p-2.5 border border-neutral-100">
                       <div className="flex justify-between items-center mb-1">
                         <span className="font-medium text-neutral-700 text-sm">{e.from} → {e.to}</span>
                         <span className="text-xs bg-white border border-neutral-200 px-1.5 py-0.5 rounded text-neutral-500 shadow-sm">
                           {round(e.speed_kmh, 0)} km/h
                         </span>
                       </div>
                       <div className="grid grid-cols-2 gap-2 text-xs mt-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{backgroundColor: getEdgeColor(viewMode, e)}} />
                            <span className="text-neutral-500">{viewMode === "Queue View" ? "Queue" : "Metric"}:</span>
                            <span className="font-bold text-neutral-700">
                                {round(viewMode === "Queue View" ? e.queue : viewMode === "Delay View" ? e.delay_s : e.speed_kmh, 1)}
                            </span>
                          </div>
                          <div className="flex justify-end">
                            <span className="text-neutral-500 font-mono">
                                {Math.round(e.flow_vph)} vph
                            </span>
                          </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             ) : (
                <div className="h-full flex items-center justify-center text-neutral-400 text-sm italic">
                  Click a node on the map to view details.
                </div>
             )}
          </div>
        </div>
      </div>

      <section className={`card ${cardPad}`}>
        <div className="flex gap-4 items-end mb-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Log Result</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Tag" 
                className="border border-neutral-300 rounded px-3 py-1.5 text-sm w-full"
                value={snapshotTag}
                onChange={e => setSnapshotTag(e.target.value)}
              />
              <button onClick={takeSnapshot} className="bg-neutral-900 text-white px-4 py-1.5 rounded text-sm hover:bg-neutral-800">
                Save
              </button>
              <button 
                onClick={exportCsv} 
                disabled={snapshots.length === 0}
                className="px-4 py-1.5 rounded text-sm border border-neutral-300 text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
        {snapshots.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-neutral-500 bg-neutral-50 uppercase border-b">
                <tr>
                  <th className="px-3 py-2">Tag</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2 text-right">Avg Delay</th>
                  <th className="px-3 py-2 text-right">Queue</th>
                  <th className="px-3 py-2 text-right">Throughput</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-neutral-50">
                    <td className="px-3 py-2 font-medium">{s.tag}</td>
                    <td className="px-3 py-2 text-neutral-500">{new Date(s.ts).toLocaleTimeString()}</td>
                    <td className="px-3 py-2 text-right">{round(s.kpis.avgDelay)}</td>
                    <td className="px-3 py-2 text-right">{round(s.kpis.totalQueue)}</td>
                    <td className="px-3 py-2 text-right">{round(s.kpis.throughputVPM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function KpiCard({ title, value, label, tone }: { title: string; value: string; label: string; tone: Tone }) {
  const colors: Record<Tone, string> = {
    neutral: "text-neutral-600", emerald: "text-emerald-600", amber: "text-amber-600",
    rose: "text-rose-600", sky: "text-sky-600", indigo: "text-indigo-600", violet: "text-violet-600"
  };
  return (
    <div className="card p-5">
      <p className="text-neutral-500 text-sm font-medium">{title}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-3xl font-bold tracking-tight ${colors[tone]}`}>{value}</span>
        <span className="text-neutral-400 text-sm">{label}</span>
      </div>
    </div>
  );
}

function getEdgeColor(mode: string, e: EdgeState) {
  if (mode === "Speed View") {
    if (e.speed_kmh > 45) return "#10b981"; // emerald-500
    if (e.speed_kmh > 25) return "#f59e0b"; // amber-500
    return "#f43f5e"; // rose-500
  }
  
  if (mode === "Delay View") {
    if (e.delay_s < 10) return "#22d3ee"; // cyan-400
    if (e.delay_s < 30) return "#8b5cf6"; // violet-500
    return "#4c1d95"; // violet-900
  }

  // Default: Queue View
  if (e.queue < 3) return "#10b981"; // emerald-500
  if (e.queue < 7) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}