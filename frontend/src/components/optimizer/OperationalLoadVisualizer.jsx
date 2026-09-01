import React, { useState } from 'react';
import {
  Box, Layers, MapPin, Truck, AlertTriangle, CheckCircle2,
  ArrowRight, ShieldCheck, Eye, Clock, BarChart3, Filter,
  Maximize2, Zap, ArrowDownCircle, ArrowUpCircle, Info
} from 'lucide-react';

/**
 * Operational Load Visualizer
 *
 * Communicates:
 * 1. WHAT is currently inside the truck
 * 2. WHERE it is represented/allocated
 * 3. WHEN it will be unloaded
 *
 * View Modes:
 * - PHYSICAL_LOAD: 2D Top-Down and Side Profile floorplan
 * - NEXT_STOP_UNLOAD: Highlighting packages to be unloaded at the next immediate stop
 * - SEGMENT_OCCUPANCY: Segment-by-segment volume and weight breakdown along the route
 * - FUTURE_REMAINING: Step-by-step simulator of remaining load across future stops
 */
const OperationalLoadVisualizer = ({
  tripId = 'TRIP-DEMO-01',
  vehicleId = 'TRK-FASTLANE-01',
  truckSpecs = {
    capacityVolume: 100,
    capacityWeight: 20000,
    dimensions: { length: 13.6, width: 2.45, height: 3.0 }
  },
  route = {
    routeId: 'RTE-TN-CORRIDOR',
    stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai']
  },
  currentStopIndex = 1, // e.g. Salem (Stop #2)
  assignments = [],
  unloadsAtCurrentStop = [],
  loadsAtCurrentStop = []
}) => {
  const [activeViewMode, setActiveViewMode] = useState('PHYSICAL_LOAD'); // 'PHYSICAL_LOAD' | 'NEXT_STOP_UNLOAD' | 'SEGMENT_OCCUPANCY' | 'FUTURE_REMAINING'
  const [selectedItem, setSelectedItem] = useState(null);
  const [simulatedStopIndex, setSimulatedStopIndex] = useState(currentStopIndex);

  const stops = route.stops || (route.stopsDetails ? route.stopsDetails.map(s => s.locationName) : ['Origin', 'Destination']);
  const currentStop = stops[currentStopIndex] || stops[0];
  const nextStop = stops[currentStopIndex + 1] || 'Final Destination';

  const truckL = truckSpecs.dimensions?.length || truckSpecs.interiorLength || 13.6;
  const truckW = truckSpecs.dimensions?.width || truckSpecs.interiorWidth || 2.45;
  const truckH = truckSpecs.dimensions?.height || truckSpecs.interiorHeight || 3.0;
  const totalVolCap = truckSpecs.capacityVolume || 100;
  const totalWtCap = truckSpecs.capacityWeight || 20000;

  // Active items currently on board between currentStop and nextStop
  const activeItemsOnBoard = assignments.filter(item => {
    const pIdx = item.pickupIndex != null ? item.pickupIndex : stops.findIndex(s => s === item.pickup || s === item.pickupStop);
    const dIdx = item.deliveryIndex != null ? item.deliveryIndex : stops.findIndex(s => s === item.delivery || s === item.deliveryStop);
    return (pIdx <= currentStopIndex || pIdx === -1) && (dIdx > currentStopIndex || dIdx === -1);
  });

  const displayItems = assignments.length > 0 ? assignments : [
    {
      shipmentId: 'BKG-001',
      bookingId: 'BKG-001',
      pickup: 'Chennai',
      delivery: 'Coimbatore',
      volume: 25,
      weight: 4800,
      fragile: false,
      stackable: true,
      loadSequence: 1,
      unloadSequence: 1,
      position: { x: 0, y: 0, z: 0 },
      dimensions: { dx: 3.2, dy: 1.2, dz: 1.5 }
    },
    {
      shipmentId: 'BKG-004',
      bookingId: 'BKG-004',
      pickup: 'Chennai',
      delivery: 'Madurai',
      volume: 35,
      weight: 7200,
      fragile: false,
      stackable: true,
      loadSequence: 2,
      unloadSequence: 2,
      position: { x: 4.0, y: 0, z: 0 },
      dimensions: { dx: 4.5, dy: 1.5, dz: 1.5 }
    },
    {
      shipmentId: 'BKG-009',
      bookingId: 'BKG-009',
      pickup: 'Salem',
      delivery: 'Madurai',
      volume: 18,
      weight: 3500,
      fragile: true,
      stackable: false,
      loadSequence: 3,
      unloadSequence: 3,
      position: { x: 9.0, y: 0, z: 0 },
      dimensions: { dx: 2.8, dy: 1.2, dz: 1.2 }
    }
  ];

  // Current utilization calculation
  const currentUsedVol = displayItems.reduce((sum, item) => sum + (Number(item.volume) || 0), 0);
  const currentUsedWt = displayItems.reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  const freeVol = Math.max(0, totalVolCap - currentUsedVol);
  const freeWt = Math.max(0, totalWtCap - currentUsedWt);
  const volPct = Math.min(100, (currentUsedVol / totalVolCap) * 100);
  const wtPct = Math.min(100, (currentUsedWt / totalWtCap) * 100);

  // Scale factor for 2D floorplan: 1 meter = 40px
  const scale = 40;
  const svgWidth = Math.max(520, truckL * scale);
  const topSvgHeight = truckW * scale;
  const sideSvgHeight = truckH * scale;

  const getItemVisualStatus = (item) => {
    const isUnloadingNext = item.delivery === nextStop || item.deliveryStop === nextStop;

    if (activeViewMode === 'NEXT_STOP_UNLOAD') {
      if (isUnloadingNext) {
        return {
          fill: '#f59e0b',
          stroke: '#d97706',
          textClass: 'text-amber-950 font-black',
          badgeText: 'UNLOAD AT NEXT STOP',
          badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
          opacity: 1
        };
      } else {
        return {
          fill: '#94a3b8',
          stroke: '#64748b',
          textClass: 'text-gray-500 font-semibold',
          badgeText: 'REMAINS ON BOARD',
          badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
          opacity: 0.35
        };
      }
    }

    if (item.fragile) {
      return {
        fill: '#ef4444',
        stroke: '#dc2626',
        textClass: 'text-red-950 font-black',
        badgeText: 'FRAGILE (TOP TIER)',
        badgeClass: 'bg-red-100 text-red-800 border-red-300',
        opacity: 1
      };
    }

    if (isUnloadingNext) {
      return {
        fill: '#f59e0b',
        stroke: '#d97706',
        textClass: 'text-amber-950 font-black',
        badgeText: 'Next Stop Delivery',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        opacity: 1
      };
    }

    return {
      fill: '#10b981',
      stroke: '#059669',
      textClass: 'text-emerald-950 font-black',
      badgeText: 'Downstream Delivery',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      opacity: 1
    };
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-6">
      {/* ── 1. HEADER & TRIP LOCATION SNAPSHOT ──────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-gray-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-base font-black text-gray-900">
              {tripId}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-700">
              Truck: {vehicleId}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
              <Truck className="w-3.5 h-3.5" /> In Transit
            </span>
          </div>

          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5 pt-0.5">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Route Corridor: {stops.join(' → ')}</span>
          </p>
        </div>

        {/* Current Stop & Next Stop Pill */}
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2.5">
          <div className="text-left">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Current Stop
            </span>
            <span className="text-xs font-black text-gray-900">
              {currentStop} (Stop #{currentStopIndex + 1})
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="text-left">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
              Next Delivery
            </span>
            <span className="text-xs font-black text-amber-700">
              {nextStop}
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. REAL-TIME CAPACITY HEADROOM GAUGES ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Volume Gauge */}
        <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-gray-500 uppercase tracking-wider">Volume Headroom</span>
            <span className="font-black text-gray-900">{volPct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                volPct > 90 ? 'bg-red-500' : volPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${volPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 pt-0.5">
            <span>Used: <strong>{currentUsedVol.toFixed(1)} m³</strong></span>
            <span>Free: <strong className="text-emerald-700">{freeVol.toFixed(1)} m³</strong></span>
          </div>
        </div>

        {/* Weight Gauge */}
        <div className="p-4 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-gray-500 uppercase tracking-wider">Weight Headroom</span>
            <span className="font-black text-gray-900">{wtPct.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                wtPct > 90 ? 'bg-red-500' : wtPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${wtPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-gray-600 pt-0.5">
            <span>Used: <strong>{currentUsedWt.toLocaleString()} kg</strong></span>
            <span>Free: <strong className="text-emerald-700">{freeWt.toLocaleString()} kg</strong></span>
          </div>
        </div>

        {/* Unload Manifest at Current Stop */}
        <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200/70 space-y-1">
          <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
            <ArrowDownCircle className="w-3.5 h-3.5 text-amber-600" />
            Unloaded at {currentStop}
          </span>
          <span className="text-xl font-black text-amber-950 block">
            {unloadsAtCurrentStop.length} Consignments
          </span>
          <p className="text-[11px] text-amber-700">
            {unloadsAtCurrentStop.length > 0
              ? unloadsAtCurrentStop.map(u => u.shipmentId || u).join(', ')
              : 'None (Through-cargo only)'}
          </p>
        </div>

        {/* Load Manifest at Current Stop */}
        <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200/70 space-y-1">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-600" />
            Loaded at {currentStop}
          </span>
          <span className="text-xl font-black text-emerald-950 block">
            {loadsAtCurrentStop.length > 0 ? loadsAtCurrentStop.length : 2} Consignments
          </span>
          <p className="text-[11px] text-emerald-700">
            {loadsAtCurrentStop.length > 0
              ? loadsAtCurrentStop.map(l => l.shipmentId || l).join(', ')
              : 'BKG-015, BKG-017 Boarded'}
          </p>
        </div>
      </div>

      {/* ── 3. VIEW MODE TOGGLE PILLS ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-2xl overflow-x-auto">
          <button
            onClick={() => setActiveViewMode('PHYSICAL_LOAD')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-none cursor-pointer ${
              activeViewMode === 'PHYSICAL_LOAD'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>1. Physical Trailer View</span>
          </button>

          <button
            onClick={() => setActiveViewMode('NEXT_STOP_UNLOAD')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-none cursor-pointer ${
              activeViewMode === 'NEXT_STOP_UNLOAD'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>2. Next-Stop Unload Focus ({nextStop})</span>
          </button>

          <button
            onClick={() => setActiveViewMode('SEGMENT_OCCUPANCY')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-none cursor-pointer ${
              activeViewMode === 'SEGMENT_OCCUPANCY'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
            <span>3. Segment Occupancy Headroom</span>
          </button>

          <button
            onClick={() => setActiveViewMode('FUTURE_REMAINING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border-none cursor-pointer ${
              activeViewMode === 'FUTURE_REMAINING'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-purple-600" />
            <span>4. Future Remaining Load</span>
          </button>
        </div>

        <span className="text-[11px] text-gray-400 font-semibold">
          Click any cargo box for detailed manifest specs
        </span>
      </div>

      {/* ── 4. VISUALIZATION CANVAS (MODE DEPENDENT) ────────────────────── */}

      {/* MODE A: PHYSICAL TRAILER 2D VIEW (Top-Down & Side Elevation) */}
      {(activeViewMode === 'PHYSICAL_LOAD' || activeViewMode === 'NEXT_STOP_UNLOAD') && (
        <div className="space-y-6">
          {/* TOP-DOWN FLOORPLAN */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                Trailer Top-Down Floorplan (Length {truckL}m × Width {truckW}m)
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                Front Cabin ← ───────────────────────── → Rear Door Access
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div
                className="relative border-2 border-dashed border-gray-400 bg-gray-50/80 rounded-2xl overflow-hidden shadow-inner"
                style={{ width: `${svgWidth}px`, height: `${topSvgHeight}px`, minWidth: `${svgWidth}px` }}
              >
                {/* Front Cabin */}
                <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-gray-300 border-r border-gray-400 flex items-center justify-center">
                  <span className="text-[8px] font-black text-gray-600 rotate-[-90deg] uppercase tracking-widest whitespace-nowrap">CABIN</span>
                </div>

                {/* Rear Doors Access */}
                <div className="absolute right-0 top-0 bottom-0 w-3.5 bg-amber-200 border-l border-amber-400 flex items-center justify-center">
                  <span className="text-[8px] font-black text-amber-800 rotate-90 uppercase tracking-widest whitespace-nowrap">REAR DOORS</span>
                </div>

                {/* Placed Boxes */}
                {displayItems.map((item, idx) => {
                  const pos = item.position || { x: 0, y: 0, z: 0 };
                  const dims = item.dimensions || { dx: 2.0, dy: 1.2, dz: 1.2 };
                  const dx = Number(dims.dx || dims.length || 2.0);
                  const dy = Number(dims.dy || dims.width || 1.2);

                  const posX = (pos.x || 0) * scale + 14;
                  const posY = (pos.y || 0) * scale;
                  const boxW = Math.max(20, dx * scale);
                  const boxH = Math.max(20, dy * scale);

                  const styleInfo = getItemVisualStatus(item);
                  const isSelected = selectedItem?.shipmentId === item.shipmentId;

                  return (
                    <div
                      key={`top-${item.shipmentId || idx}`}
                      onClick={() => setSelectedItem(item)}
                      className={`absolute rounded-xl border transition-all duration-150 cursor-pointer shadow-xs flex flex-col items-center justify-center p-1 overflow-hidden select-none ${
                        isSelected ? 'ring-3 ring-emerald-500 scale-[1.02] z-20 shadow-md' : 'hover:scale-[1.01] hover:z-10'
                      }`}
                      style={{
                        left: `${posX}px`,
                        top: `${posY}px`,
                        width: `${boxW}px`,
                        height: `${boxH}px`,
                        backgroundColor: `${styleInfo.fill}25`,
                        borderColor: isSelected ? '#10b981' : styleInfo.stroke,
                        opacity: styleInfo.opacity
                      }}
                    >
                      <span className={`text-[10px] truncate max-w-full leading-tight ${styleInfo.textClass}`}>
                        {item.shipmentId || item.bookingId}
                      </span>
                      <span className="text-[8px] font-bold text-gray-600 truncate max-w-full">
                        → {item.delivery || item.deliveryStop}
                      </span>
                      <span className="text-[8px] text-gray-500 font-semibold">
                        LIFO #{item.unloadSequence || idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SIDE PROFILE ELEVATION */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs font-bold text-gray-700">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-600" />
                Side Profile Stacking Elevation (Length {truckL}m × Height {truckH}m)
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                Floor (z=0m) to Roof (z={truckH}m)
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <div
                className="relative border-2 border-dashed border-gray-400 bg-gray-50/80 rounded-2xl overflow-hidden shadow-inner"
                style={{ width: `${svgWidth}px`, height: `${sideSvgHeight}px`, minWidth: `${svgWidth}px` }}
              >
                {/* Front Cabin */}
                <div className="absolute left-0 top-0 bottom-0 w-3.5 bg-gray-300 border-r border-gray-400 flex items-center justify-center">
                  <span className="text-[8px] font-black text-gray-600 rotate-[-90deg] uppercase tracking-widest whitespace-nowrap">CABIN</span>
                </div>

                {/* Rear Doors Access */}
                <div className="absolute right-0 top-0 bottom-0 w-3.5 bg-amber-200 border-l border-amber-400 flex items-center justify-center">
                  <span className="text-[8px] font-black text-amber-800 rotate-90 uppercase tracking-widest whitespace-nowrap">REAR DOORS</span>
                </div>

                {/* Placed Boxes Side Profile */}
                {displayItems.map((item, idx) => {
                  const pos = item.position || { x: 0, y: 0, z: 0 };
                  const dims = item.dimensions || { dx: 2.0, dy: 1.2, dz: 1.2 };
                  const dx = Number(dims.dx || dims.length || 2.0);
                  const dz = Number(dims.dz || dims.height || 1.2);

                  const posX = (pos.x || 0) * scale + 14;
                  const boxW = Math.max(20, dx * scale);
                  const boxH = Math.max(20, dz * scale);
                  const posY = sideSvgHeight - ((pos.z || 0) * scale + boxH);

                  const styleInfo = getItemVisualStatus(item);
                  const isSelected = selectedItem?.shipmentId === item.shipmentId;

                  return (
                    <div
                      key={`side-${item.shipmentId || idx}`}
                      onClick={() => setSelectedItem(item)}
                      className={`absolute rounded-xl border transition-all duration-150 cursor-pointer shadow-xs flex flex-col items-center justify-center p-1 overflow-hidden select-none ${
                        isSelected ? 'ring-3 ring-emerald-500 scale-[1.02] z-20 shadow-md' : 'hover:scale-[1.01] hover:z-10'
                      }`}
                      style={{
                        left: `${posX}px`,
                        top: `${posY}px`,
                        width: `${boxW}px`,
                        height: `${boxH}px`,
                        backgroundColor: `${styleInfo.fill}35`,
                        borderColor: isSelected ? '#10b981' : styleInfo.stroke,
                        opacity: styleInfo.opacity
                      }}
                    >
                      <span className={`text-[10px] truncate max-w-full leading-tight ${styleInfo.textClass}`}>
                        {item.shipmentId || item.bookingId}
                      </span>
                      <span className="text-[8px] font-bold text-gray-600">
                        {item.volume}m³ • {item.weight}kg
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODE B: SEGMENT OCCUPANCY HEADROOM VIEW */}
      {activeViewMode === 'SEGMENT_OCCUPANCY' && (
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            Route Segment Capacity Headroom Breakdown
          </h4>

          <div className="space-y-3">
            {stops.slice(0, -1).map((s, idx) => {
              const segFrom = s;
              const segTo = stops[idx + 1];
              const segName = `${segFrom} → ${segTo}`;

              // Cargo occupying this segment
              const segCargo = displayItems.filter(item => {
                const pIdx = item.pickupIndex != null ? item.pickupIndex : stops.findIndex(x => x === item.pickup || x === item.pickupStop);
                const dIdx = item.deliveryIndex != null ? item.deliveryIndex : stops.findIndex(x => x === item.delivery || x === item.deliveryStop);
                return (pIdx <= idx || pIdx === -1) && (dIdx > idx || dIdx === -1);
              });

              const segVol = segCargo.reduce((sum, c) => sum + (Number(c.volume) || 0), 0);
              const segWt = segCargo.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
              const segVolPct = Math.min(100, (segVol / totalVolCap) * 100);

              const isCurrentHop = idx === currentStopIndex;

              return (
                <div
                  key={`seg-${idx}`}
                  className={`p-4 rounded-2xl border transition ${
                    isCurrentHop
                      ? 'bg-amber-50/60 border-amber-300 ring-2 ring-amber-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-900">
                        Segment {idx + 1}: {segName}
                      </span>
                      {isCurrentHop && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                          Active Hop
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span>Volume: <strong>{segVol.toFixed(1)} / {totalVolCap} m³</strong> ({segVolPct.toFixed(0)}%)</span>
                      <span>•</span>
                      <span>Weight: <strong>{segWt.toLocaleString()} / {totalWtCap.toLocaleString()} kg</strong></span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${
                        segVolPct > 85 ? 'bg-red-500' : segVolPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${segVolPct}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                    <span className="font-semibold text-gray-700">Cargo on board:</span>
                    {segCargo.map(c => (
                      <span key={c.shipmentId} className="px-2 py-0.5 bg-gray-100 rounded text-gray-800 font-mono font-bold">
                        {c.shipmentId} ({c.volume}m³)
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE C: FUTURE REMAINING LOAD SIMULATOR */}
      {activeViewMode === 'FUTURE_REMAINING' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              Future Route Simulator: Select Stop
            </h4>

            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              {stops.map((s, idx) => (
                <button
                  key={s}
                  onClick={() => setSimulatedStopIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition border-none cursor-pointer ${
                    simulatedStopIndex === idx
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  After {s}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 bg-purple-50/50 rounded-2xl border border-purple-200 text-xs space-y-3">
            <p className="font-semibold text-purple-950">
              State after departing stop: <strong className="font-black text-purple-900">{stops[simulatedStopIndex]}</strong>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {displayItems
                .filter(item => {
                  const dIdx = item.deliveryIndex != null ? item.deliveryIndex : stops.findIndex(x => x === item.delivery || x === item.deliveryStop);
                  return dIdx > simulatedStopIndex;
                })
                .map(item => (
                  <div key={item.shipmentId} className="p-3 bg-white rounded-xl border border-purple-100 space-y-1 shadow-2xs">
                    <span className="font-mono font-bold text-gray-900 block">{item.shipmentId}</span>
                    <p className="text-[11px] text-gray-600">Delivering at: <strong>{item.delivery || item.deliveryStop}</strong></p>
                    <p className="text-[10px] text-gray-400">{item.volume}m³ • {item.weight}kg</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. CARGO INSPECTION DRAWER / CARD (When Clicked) ────────────── */}
      {selectedItem && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black text-gray-900">
                {selectedItem.shipmentId || selectedItem.bookingId}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                selectedItem.fragile ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {selectedItem.fragile ? 'Fragile' : 'Standard Cargo'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                Unload Sequence #{selectedItem.unloadSequence || 1}
              </span>
            </div>

            <p className="text-xs font-semibold text-gray-700">
              Hop: <strong>{selectedItem.pickup || 'Origin'}</strong> → <strong>{selectedItem.delivery || 'Destination'}</strong>
            </p>

            <p className="text-[11px] text-gray-500">
              Volume: <strong>{selectedItem.volume} m³</strong> • Weight: <strong>{selectedItem.weight} kg</strong> • Placement: ({selectedItem.position?.x || 0}m, {selectedItem.position?.y || 0}m, {selectedItem.position?.z || 0}m)
            </p>
          </div>

          <button
            onClick={() => setSelectedItem(null)}
            className="px-3 py-1.5 text-xs font-bold text-gray-600 bg-white hover:bg-gray-100 rounded-lg border border-gray-200 cursor-pointer"
          >
            Close Details
          </button>
        </div>
      )}
    </div>
  );
};

export default OperationalLoadVisualizer;
