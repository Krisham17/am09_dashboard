"use client";

import React, { useEffect, useMemo, useState } from "react";

type NetEdge = { id: string; coords: [number, number][] };
type Net = { bbox_xy: [number, number, number, number]; edges: NetEdge[] };

type EdgeState = {
  id: string;
  speed_kmh: number;
  queue: number;
  delay_s: number;
  flow_vph: number;
  veh_n: number;
};

type Props = {
  viewMode?: "Speed View" | "Queue View" | "Delay View" | string;
  onSelectEdge?: (edgeId: string | null) => void;
};

function colorByMode(mode: string, e?: EdgeState) {
  // default faint line if no data
  if (!e) return "rgba(180,180,180,0.10)";

  if (mode === "Speed View") {
    if (e.speed_kmh > 45) return "rgba(16,185,129,0.95)"; // emerald
    if (e.speed_kmh > 25) return "rgba(245,158,11,0.95)"; // amber
    return "rgba(244,63,94,0.95)"; // rose
  }

  if (mode === "Delay View") {
    if (e.delay_s < 10) return "rgba(34,211,238,0.95)"; // cyan
    if (e.delay_s < 30) return "rgba(139,92,246,0.95)"; // violet
    return "rgba(76,29,149,0.95)"; // deep violet
  }

  // Queue View
  if (e.queue < 3) return "rgba(16,185,129,0.95)";
  if (e.queue < 7) return "rgba(245,158,11,0.95)";
  return "rgba(244,63,94,0.95)";
}

export default function NetworkMap({ viewMode = "Speed View", onSelectEdge }: Props) {
  const [net, setNet] = useState<Net | null>(null);
  const [edgeState, setEdgeState] = useState<Record<string, EdgeState>>({});
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Load network geometry once
  useEffect(() => {
    fetch("/network/network.json")
      .then((r) => r.json())
      .then(setNet)
      .catch(console.error);
  }, []);

  // Poll live state
  useEffect(() => {
    const tick = async () => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        const s = await r.json();
        const map: Record<string, EdgeState> = {};
        for (const e of (s.edges || [])) map[e.id] = e;
        setEdgeState(map);
      } catch {
        // ignore transient errors
      }
    };

    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Projection + zoom-to-fit (clean + centered)
  const view = useMemo(() => {
    if (!net) return null;

    const [minx, miny, maxx, maxy] = net.bbox_xy;
    const w = maxx - minx || 1;
    const h = maxy - miny || 1;

    // padding so it doesn't touch the frame
    const PAD = -0.1;
    const minx2 = minx - w * PAD;
    const miny2 = miny - h * PAD;
    const w2 = w * (1 + PAD * 2);
    const h2 = h * (1 + PAD * 2);

    const W = 1000;
    const H = 700;

    const sx = W / w2;
    const sy = H / h2;

    // Zoom factor: 1.0 = fit, 1.15-1.35 = zoom in (try 1.25)
    const ZOOM = 1.0;
    const s = Math.min(sx, sy) * ZOOM;


    const scaledW = w2 * s;
    const scaledH = h2 * s;
    const ox = (W - scaledW) / 2;
    const oy = (H - scaledH) / 2;

    const project = (x: number, y: number) => {
      const px = ox + (x - minx2) * s;
      const py = oy + (h2 - (y - miny2)) * s; // flip Y
      return [px, py] as const;
    };

    return { project };
  }, [net]);

  const selected = selectedEdgeId ? edgeState[selectedEdgeId] : undefined;

  const widthFor = (e?: EdgeState) => {
    if (!e) return 1.0;
    // smoother scale
    return Math.min(5.5, 1.2 + Math.sqrt(Math.max(0, e.queue)) * 0.8);
  };

  if (!net || !view) return <div>Loading network…</div>;

  const handleSelect = (edgeId: string | null) => {
    setSelectedEdgeId(edgeId);
    onSelectEdge?.(edgeId);
  };

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Tooltip card */}
      {selectedEdgeId && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            zIndex: 5,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 10,
            padding: "10px 12px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            fontSize: 12,
            maxWidth: 260,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontWeight: 700, color: "#111" }}>Edge</div>
            <button
              onClick={() => handleSelect(null)}
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "white",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
          <div style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#111" }}>
            {selectedEdgeId}
          </div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, color: "#333" }}>
            <div><b>Speed</b> {selected ? Math.round(selected.speed_kmh) : 0} km/h</div>
            <div><b>Queue</b> {selected ? selected.queue : 0}</div>
            <div><b>Delay</b> {selected ? selected.delay_s.toFixed(1) : "0.0"} s</div>
            <div><b>Flow</b> {selected ? Math.round(selected.flow_vph) : 0} vph</div>
          </div>
          <div style={{ marginTop: 8, color: "#666" }}>Click another edge to inspect.</div>
        </div>
      )}

      <svg
        viewBox="0 0 1000 700"
        style={{
          width: "100%",
          height: "100%",
          background: "#ffffff",

          display: "block",
          cursor: "pointer",
        }}
        preserveAspectRatio="xMidYMid meet"
        onClick={() => handleSelect(null)} // click empty space clears
      >
        {/* base network (clean, subtle) */}
        <g opacity={0.55}>
          {net.edges.map((ed) => {
            const pts = ed.coords.map(([x, y]) => view.project(x, y).join(",")).join(" ");
            return (
              <polyline
                key={`base-${ed.id}`}
                points={pts}
                fill="none"
                stroke="rgba(0,0,0,0.55)"   // darker black roads
                strokeWidth={1.6}           // slightly thicker
                strokeLinecap="round"
                strokeLinejoin="round"
             />

            );
          })}
        </g>

        {/* overlay (only edges that have live data) */}
        <g>
          {net.edges.map((ed) => {
            const live = edgeState[ed.id];
            if (!live) return null;

            const pts = ed.coords.map(([x, y]) => view.project(x, y).join(",")).join(" ");
            const isSel = selectedEdgeId === ed.id;

            return (
              <polyline
                key={ed.id}
                points={pts}
                fill="none"
                stroke={isSel ? "rgba(255,255,255,0.95)" : colorByMode(viewMode, live)}
                strokeWidth={isSel ? Math.max(6, widthFor(live) + 2) : widthFor(live)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: isSel
                    ? "drop-shadow(0px 0px 6px rgba(255,255,255,0.35))"
                    : "drop-shadow(0px 0px 3px rgba(0,0,0,0.35))",
                }}
                onClick={(evt) => {
                  evt.stopPropagation(); // don't trigger svg clear
                  handleSelect(ed.id);
                }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
