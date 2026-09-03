import React, { useMemo } from 'react';
import {
  Layers,
  Box,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Eye,
  ShieldCheck,
  ArrowRight,
  Truck,
  Flame,
  Lock,
  Layers3
} from 'lucide-react';
import {
  AUTHORITATIVE_TRUCK,
  DESTINATION_PALETTES,
  normalizeCanonicalPlacements,
  getActiveSegmentCargo,
  validateAuthoritativePlacements,
  validatePackageWithinTruck
} from './canonicalPlacement';

/**
 * Trailer2DView
 *
 * Authoritative 2D CAD Engineering Schematic for Space Optimizer:
 * 1. Single Source of Truth: Consumes canonical placement coordinates (X, Y, Z, dx, dy, dz).
 * 2. Top-Down Floorplan: Length X (0 to L) × Width Y (0 to W).
 * 3. Side Elevation: Length X (0 to L) × Height Z (0 to H).
 * 4. Metric scale rulers along X (0 to L), Y (0 to W), and Z (0 to H).
 * 5. Synchronized item selection with 3D Digital Twin.
 * 6. LIFO rear-door unloading path visualization.
 */
const Trailer2DView = ({
  truckSpecs,
  truckDimensions,
  truckCapacity,
  assignments = [],
  canonicalItems: externalCanonicalItems,
  selectedItem,
  onSelectItem,
  selectedSegment = 'ALL',
  onSelectSegment,
  stops = ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
  currentStop = 'Chennai',
  showUnloadPath = true,
  isLocked = false
}) => {
  // Authoritative vehicle dimension resolution
  const rawDims = truckSpecs?.dimensions || truckDimensions || {};
  const truckL = Number(rawDims.length || truckSpecs?.interiorLength || AUTHORITATIVE_TRUCK.length);
  const truckW = Number(rawDims.width || truckSpecs?.interiorWidth || AUTHORITATIVE_TRUCK.width);
  const truckH = Number(rawDims.height || truckSpecs?.interiorHeight || AUTHORITATIVE_TRUCK.height);

  const truckVol = Number(
    truckSpecs?.capacityVolume || truckCapacity?.volume || AUTHORITATIVE_TRUCK.capacityVolume
  );
  const truckWt = Number(
    truckSpecs?.capacityWeight || truckCapacity?.weight || AUTHORITATIVE_TRUCK.capacityWeight
  );

  const resolvedStops = useMemo(() => {
    if (Array.isArray(stops) && stops.length > 0) return stops;
    return ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];
  }, [stops]);

  // Canonical normalized items
  const canonicalItems = useMemo(() => {
    if (Array.isArray(externalCanonicalItems) && externalCanonicalItems.length > 0) {
      return externalCanonicalItems;
    }
    return normalizeCanonicalPlacements(
      assignments,
      { length: truckL, width: truckW, height: truckH },
      resolvedStops
    );
  }, [externalCanonicalItems, assignments, truckL, truckW, truckH, resolvedStops]);

  // Active items for selected route segment
  const activeItems = useMemo(() => {
    return getActiveSegmentCargo(canonicalItems, selectedSegment);
  }, [canonicalItems, selectedSegment]);

  // Authoritative physical validation
  const validation = useMemo(() => {
    return validateAuthoritativePlacements(
      canonicalItems,
      { length: truckL, width: truckW, height: truckH },
      resolvedStops
    );
  }, [canonicalItems, truckL, truckW, truckH, resolvedStops]);

  // Strict Pre-Render Physical Boundary Filter & Quarantine for 2D CAD
  const { physicallyValidActiveItems, quarantinedActiveItems } = useMemo(() => {
    const valid = [];
    const quarantined = [];
    activeItems.forEach(item => {
      const check = validatePackageWithinTruck({
        position: { x: item.x, y: item.y, z: item.z },
        dimensions: { dx: item.dx, dy: item.dy, dz: item.dz },
        truckDimensions: { length: truckL, width: truckW, height: truckH }
      });
      if (check.valid) {
        valid.push(item);
      } else {
        quarantined.push({ item, violations: check.violations });
      }
    });
    return { physicallyValidActiveItems: valid, quarantinedActiveItems: quarantined };
  }, [activeItems, truckL, truckW, truckH]);

  // Telemetry metrics
  const totalOccupiedVol = useMemo(() => {
    return physicallyValidActiveItems.reduce((acc, it) => acc + it.volume, 0);
  }, [physicallyValidActiveItems]);

  const totalOccupiedWt = useMemo(() => {
    return physicallyValidActiveItems.reduce((acc, it) => acc + it.weight, 0);
  }, [physicallyValidActiveItems]);

  const volUtilPct = truckVol > 0 ? ((totalOccupiedVol / truckVol) * 100).toFixed(1) : 0;
  const wtUtilPct = truckWt > 0 ? ((totalOccupiedWt / truckWt) * 100).toFixed(1) : 0;
  const volHeadroom = Math.max(0, truckVol - totalOccupiedVol).toFixed(2);
  const wtHeadroom = Math.max(0, truckWt - totalOccupiedWt);

  // ViewBox Geometry Calculations
  const padX = Math.max(1.2, truckL * 0.08);
  const padY = Math.max(0.6, truckW * 0.18);
  const padZ = Math.max(0.6, truckH * 0.18);

  const topViewBox = `${-padX - 0.8} ${-padY - 0.4} ${truckL + padX * 2 + 1.6} ${truckW + padY * 2 + 0.8}`;
  const sideViewBox = `${-padX - 0.8} ${-padZ - 0.4} ${truckL + padX * 2 + 1.6} ${truckH + padZ * 2 + 0.8}`;

  // Metric scale ticks
  const lengthTicks = useMemo(() => {
    const ticks = [];
    for (let m = 0; m <= Math.floor(truckL); m += (truckL > 8 ? 2 : 1)) {
      ticks.push(m);
    }
    if (!ticks.includes(truckL)) ticks.push(truckL);
    return ticks;
  }, [truckL]);

  const widthTicks = useMemo(() => {
    const ticks = [0];
    if (truckW >= 1.5) ticks.push(parseFloat((truckW / 2).toFixed(2)));
    ticks.push(truckW);
    return ticks;
  }, [truckW]);

  const heightTicks = useMemo(() => {
    const ticks = [0];
    if (truckH >= 1.5) ticks.push(parseFloat((truckH / 2).toFixed(2)));
    ticks.push(truckH);
    return ticks;
  }, [truckH]);

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-6 select-none font-sans text-slate-100 shadow-md">
      {/* ── HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Authoritative 2D CAD Engineering Schematic
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              CAD Precision
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Interior Trailer Bounds: <strong className="text-white font-mono">{truckL.toFixed(2)}m L × {truckW.toFixed(2)}m W × {truckH.toFixed(2)}m H</strong> • Usable Volume: <strong className="text-emerald-400 font-mono">{truckVol.toFixed(3)} m³</strong> • Max Payload: <strong className="text-white font-mono">{truckWt.toLocaleString()} kg</strong>
          </p>
        </div>

        {/* Plan vs Physical State Badges & Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-emerald-600/80 text-emerald-300 font-bold">
            <span>LOCKED PLAN: {canonicalItems.length} Pkgs</span>
            <span className="text-slate-600">•</span>
            <span>ONBOARD: {activeItems.length} Pkgs ({totalOccupiedVol.toFixed(1)} m³, {volUtilPct}%)</span>
            {canonicalItems.length > activeItems.length && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400">FUTURE: {canonicalItems.length - activeItems.length} Pkgs</span>
              </>
            )}
          </div>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border-emerald-700">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" /> Standard Cargo
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold bg-amber-950/80 text-amber-300 border-amber-700">
            <span className="w-2 h-2 rounded-sm bg-amber-500" /> LIFO Rear Access
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold bg-red-950/80 text-red-300 border-red-700">
            <span className="w-2 h-2 rounded-sm bg-red-500" /> Fragile (No Top Stack)
          </span>
        </div>
      </div>

      {/* ── 1. TOP-DOWN 2D FLOORPLAN (Length X × Width Y) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Layers className="w-4 h-4" />
            <span>Top-Down Floorplan CAD (Length X × Width Y)</span>
          </span>
          <span className="text-[11px] font-mono text-slate-400 font-semibold">
            ← FRONT CABIN (X = 0m) ────────────────── REAR DOORS (X = {truckL.toFixed(1)}m) →
          </span>
        </div>

        <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden p-4 flex items-center justify-center shadow-inner min-h-[240px]">
          <svg
            viewBox={topViewBox}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-auto max-h-[280px] overflow-visible"
          >
            {/* Background Floor Grid */}
            <defs>
              <pattern id="cadGridFloor" width="1" height="1" patternUnits="userSpaceOnUse">
                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#1e293b" strokeWidth="0.03" />
              </pattern>
            </defs>

            {/* Truck Usable Cargo Area */}
            <rect
              x="0"
              y="0"
              width={truckL}
              height={truckW}
              rx="0.08"
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="0.08"
            />
            <rect x="0" y="0" width={truckL} height={truckW} fill="url(#cadGridFloor)" opacity="0.6" />

            {/* Front Cabin Block */}
            <path
              d={`M -0.15 0 L -0.75 0.3 L -0.75 ${truckW - 0.3} L -0.15 ${truckW} Z`}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="0.06"
            />
            <text
              x="-0.45"
              y={truckW / 2}
              fill="#94a3b8"
              fontSize="0.28"
              fontWeight="900"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90, -0.45, ${truckW / 2})`}
            >
              CABIN
            </text>

            {/* Rear Doors / Access Zone */}
            <rect
              x={truckL + 0.08}
              y="0"
              width="0.65"
              height={truckW}
              rx="0.06"
              fill="#78350f"
              stroke="#f59e0b"
              strokeWidth="0.06"
            />
            <text
              x={truckL + 0.4}
              y={truckW / 2}
              fill="#fde68a"
              fontSize="0.26"
              fontWeight="900"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(90, ${truckL + 0.4}, ${truckW / 2})`}
            >
              REAR DOORS
            </text>

            {/* Metric Length Scale Ruler (Along Top: 0m to truckL) */}
            {lengthTicks.map((m) => (
              <g key={`len-tick-${m}`} transform={`translate(${m}, -0.15)`}>
                <line x1="0" y1="0" x2="0" y2="0.12" stroke="#64748b" strokeWidth="0.03" />
                <text x="0" y="-0.08" fill="#94a3b8" fontSize="0.22" fontWeight="bold" textAnchor="middle">
                  {m}m
                </text>
              </g>
            ))}

            {/* Metric Width Scale Ruler (Along Left: 0m to truckW) */}
            {widthTicks.map((w) => (
              <g key={`wid-tick-${w}`} transform={`translate(-0.15, ${w})`}>
                <line x1="0" y1="0" x2="0.12" y2="0" stroke="#64748b" strokeWidth="0.03" />
                <text x="-0.08" y="0.06" fill="#94a3b8" fontSize="0.20" fontWeight="bold" textAnchor="end">
                  {w}m
                </text>
              </g>
            ))}

            {/* Rendered Physical 2D Cargo Rectangles (Valid Items Only) */}
            {physicallyValidActiveItems.map((item, idx) => {
              const palette = DESTINATION_PALETTES[item.destColorIndex % DESTINATION_PALETTES.length];
              const isSelected = selectedItem?.shipmentId === item.shipmentId;
              const isBlocked = validation.accessibilityConflicts.some(c => c.blockedItem === item.shipmentId);

              const x = item.x;
              const y = item.y;
              const dx = item.dx;
              const dy = item.dy;

              return (
                <g
                  key={`top-box-${item.shipmentId}-${idx}`}
                  onClick={() => onSelectItem && onSelectItem(item)}
                  className="cursor-pointer group"
                >
                  <rect
                    x={x}
                    y={y}
                    width={dx}
                    height={dy}
                    rx="0.06"
                    fill={isBlocked ? '#ef4444' : palette.bg}
                    stroke={isSelected ? '#ffffff' : isBlocked ? '#b91c1c' : palette.border}
                    strokeWidth={isSelected ? '0.09' : '0.04'}
                    opacity="0.92"
                    className="transition hover:opacity-100"
                  />

                  {/* LIFO Unload Path Raycast Arrow (to Rear Doors) */}
                  {(showUnloadPath || isSelected) && (
                    <line
                      x1={x + dx}
                      y1={y + dy / 2}
                      x2={truckL}
                      y2={y + dy / 2}
                      stroke={isBlocked ? '#ef4444' : '#f59e0b'}
                      strokeWidth="0.04"
                      strokeDasharray="0.15, 0.1"
                    />
                  )}

                  {/* Dark high-contrast label container */}
                  {dx >= 0.8 && dy >= 0.5 && (
                    <g transform={`translate(${x + dx / 2}, ${y + dy / 2})`}>
                      <rect
                        x={-dx * 0.44}
                        y="-0.22"
                        width={dx * 0.88}
                        height="0.44"
                        rx="0.04"
                        fill="rgba(15, 23, 42, 0.85)"
                      />
                      <text
                        x="0"
                        y="-0.04"
                        fill="#ffffff"
                        fontSize={Math.min(0.24, dx * 0.18)}
                        fontWeight="900"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="monospace"
                      >
                        {item.shipmentId}
                      </text>
                      <text
                        x="0"
                        y="0.12"
                        fill="#fde047"
                        fontSize={Math.min(0.18, dx * 0.14)}
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {item.dx}×{item.dy}m ({item.volume}m³)
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* ── 2. SIDE ELEVATION CAD (Length X × Height Z) ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5 text-blue-400">
            <Layers className="w-4 h-4" />
            <span>Side Elevation CAD (Length X × Height Z)</span>
          </span>
          <span className="text-[11px] font-mono text-slate-400 font-semibold">
            FLOOR (Z = 0m) ────────────────── ROOF (Z = {truckH.toFixed(1)}m)
          </span>
        </div>

        <div className="relative w-full bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden p-4 flex items-center justify-center shadow-inner min-h-[240px]">
          <svg
            viewBox={sideViewBox}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-auto max-h-[280px] overflow-visible"
          >
            {/* Truck Usable Cargo Area Side Profile */}
            <rect
              x="0"
              y="0"
              width={truckL}
              height={truckH}
              rx="0.08"
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="0.08"
            />
            <rect x="0" y="0" width={truckL} height={truckH} fill="url(#cadGridFloor)" opacity="0.6" />

            {/* Front Tractor Unit Side Profile */}
            <path
              d={`M -0.15 0 L -1.2 0 L -1.2 ${truckH + 0.3} L -0.15 ${truckH} Z`}
              fill="#1e293b"
              stroke="#475569"
              strokeWidth="0.06"
            />
            <text
              x="-0.65"
              y={truckH / 2}
              fill="#94a3b8"
              fontSize="0.28"
              fontWeight="900"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90, -0.65, ${truckH / 2})`}
            >
              CABIN
            </text>

            {/* Rear Doors Frame Side Profile */}
            <rect
              x={truckL + 0.08}
              y="0"
              width="0.35"
              height={truckH}
              rx="0.06"
              fill="#78350f"
              stroke="#f59e0b"
              strokeWidth="0.06"
            />

            {/* Metric Length Scale Ruler (Top) */}
            {lengthTicks.map((m) => (
              <g key={`len-side-tick-${m}`} transform={`translate(${m}, -0.15)`}>
                <line x1="0" y1="0" x2="0" y2="0.12" stroke="#64748b" strokeWidth="0.03" />
                <text x="0" y="-0.08" fill="#94a3b8" fontSize="0.22" fontWeight="bold" textAnchor="middle">
                  {m}m
                </text>
              </g>
            ))}

            {/* Metric Height Scale Ruler (Left) */}
            {heightTicks.map((h) => (
              <g key={`hgt-side-tick-${h}`} transform={`translate(-0.15, ${truckH - h})`}>
                <line x1="0" y1="0" x2="0.12" y2="0" stroke="#64748b" strokeWidth="0.03" />
                <text x="-0.08" y="0.06" fill="#94a3b8" fontSize="0.20" fontWeight="bold" textAnchor="end">
                  {h}m
                </text>
              </g>
            ))}

            {/* Rendered Cargo Packages (Elevation X × Z - Valid Items Only) */}
            {physicallyValidActiveItems.map((item, idx) => {
              const palette = DESTINATION_PALETTES[item.destColorIndex % DESTINATION_PALETTES.length];
              const isSelected = selectedItem?.shipmentId === item.shipmentId;
              const isBlocked = validation.accessibilityConflicts.some(c => c.blockedItem === item.shipmentId);

              const x = item.x;
              // In SVG, Y=0 is top, so we invert Z (floor Z=0 becomes SVG Y=truckH - (z + dz))
              const ySvg = truckH - (item.z + item.dz);
              const dx = item.dx;
              const dz = item.dz;

              return (
                <g
                  key={`side-box-${item.shipmentId}-${idx}`}
                  onClick={() => onSelectItem && onSelectItem(item)}
                  className="cursor-pointer group"
                >
                  <rect
                    x={x}
                    y={ySvg}
                    width={dx}
                    height={dz}
                    rx="0.06"
                    fill={isBlocked ? '#ef4444' : palette.bg}
                    stroke={isSelected ? '#ffffff' : isBlocked ? '#b91c1c' : palette.border}
                    strokeWidth={isSelected ? '0.09' : '0.04'}
                    opacity="0.92"
                    className="transition hover:opacity-100"
                  />

                  {dx >= 0.8 && dz >= 0.5 && (
                    <g transform={`translate(${x + dx / 2}, ${ySvg + dz / 2})`}>
                      <rect
                        x={-dx * 0.44}
                        y="-0.2"
                        width={dx * 0.88}
                        height="0.4"
                        rx="0.04"
                        fill="rgba(15, 23, 42, 0.85)"
                      />
                      <text
                        x="0"
                        y="-0.02"
                        fill="#ffffff"
                        fontSize={Math.min(0.22, dx * 0.16)}
                        fontWeight="900"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontFamily="monospace"
                      >
                        {item.shipmentId}
                      </text>
                      <text
                        x="0"
                        y="0.12"
                        fill="#93c5fd"
                        fontSize={Math.min(0.16, dx * 0.12)}
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        H:{item.dz}m (Z:{item.z}m)
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default Trailer2DView;
