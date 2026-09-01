import React from 'react';
import { Box, Layers, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

/**
 * High-clarity 2D operational trailer schematic showing top-down and side profile cargo placement.
 *
 * @param {Object} props
 * @param {Object} props.truckDims - { length, width, height }
 * @param {Array} props.assignments - Placed cargo items with position, dimensions, orientation, and status
 * @param {string} [props.currentStop] - Active stop name for next-stop delivery highlighting
 * @param {string} [props.nextStop] - Next immediate stop name
 */
const Trailer2DView = ({
  truckDims = { length: 13.6, width: 2.45, height: 3.0 },
  assignments = [],
  currentStop = '',
  nextStop = ''
}) => {
  const truckL = truckDims.length || 13.6;
  const truckW = truckDims.width || 2.45;
  const truckH = truckDims.height || 3.0;

  // Scale factor: 1 meter = 45 pixels
  const scale = 42;
  const svgWidth = Math.max(500, truckL * scale);
  const topSvgHeight = truckW * scale;
  const sideSvgHeight = truckH * scale;

  const getStatusColor = (item) => {
    if (nextStop && (item.delivery === nextStop || item.deliveryStop === nextStop)) {
      return { fill: '#f59e0b', stroke: '#d97706', badge: 'bg-amber-100 text-amber-800 border-amber-300', label: 'Delivered at Next Stop' };
    }
    if (item.isLocked) {
      return { fill: '#3b82f6', stroke: '#1d4ed8', badge: 'bg-blue-100 text-blue-800 border-blue-300', label: 'In-Transit (Locked)' };
    }
    if (item.fragile) {
      return { fill: '#ef4444', stroke: '#b91c1c', badge: 'bg-red-100 text-red-800 border-red-300', label: 'Fragile (Top Tier)' };
    }
    return { fill: '#10b981', stroke: '#059669', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', label: 'Standard Cargo' };
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Box className="w-5 h-5 text-emerald-600" />
            Operational Trailer Load Schematic
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Interior Trailer Dimensions: {truckL}m L × {truckW}m W × {truckH}m H (Volume: {(truckL * truckW * truckH).toFixed(1)} m³)
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-amber-50 text-amber-800 border-amber-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> Next Stop Delivery
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Downstream Delivery
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-blue-50 text-blue-800 border-blue-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Locked In-Transit
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-red-50 text-red-800 border-red-200">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Fragile Cargo
          </span>
        </div>
      </div>

      {/* TOP-DOWN VIEW (X - Length, Y - Width) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-gray-700">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-gray-500" /> Top-Down Floor Plan (L × W)
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Cabin (Front) ← ─── → Rear Doors (Loading Access)</span>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="relative border-2 border-dashed border-gray-400 bg-gray-50/70 rounded-xl overflow-hidden shadow-inner"
            style={{ width: `${svgWidth}px`, height: `${topSvgHeight}px`, minWidth: `${svgWidth}px` }}
          >
            {/* Front Cabin Indicator */}
            <div className="absolute left-0 top-0 bottom-0 w-3 bg-gray-300 border-r border-gray-400 flex items-center justify-center">
              <span className="text-[9px] font-black text-gray-600 rotate-[-90deg] uppercase tracking-wider whitespace-nowrap">CABIN</span>
            </div>

            {/* Rear Door Indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-3 bg-amber-200 border-l border-amber-400 flex items-center justify-center">
              <span className="text-[9px] font-black text-amber-800 rotate-90 uppercase tracking-wider whitespace-nowrap">REAR</span>
            </div>

            {/* Render Cargo Placements */}
            {assignments.map((item, idx) => {
              const pos = item.position || { x: 0, y: 0, z: 0 };
              const dims = item.dimensions || { dx: 1.5, dy: 1.0, dz: 1.0 };
              const dx = Number(dims.dx || dims.length || 1.5);
              const dy = Number(dims.dy || dims.width || 1.0);

              const posX = (pos.x || 0) * scale + 12; // offset for cabin
              const posY = (pos.y || 0) * scale;
              const boxW = Math.max(16, dx * scale);
              const boxH = Math.max(16, dy * scale);

              const color = getStatusColor(item);

              return (
                <div
                  key={`top-${item.shipmentId || idx}`}
                  className="absolute rounded border transition-all hover:scale-[1.02] hover:z-10 cursor-pointer shadow-sm flex flex-col items-center justify-center p-1 overflow-hidden"
                  style={{
                    left: `${posX}px`,
                    top: `${posY}px`,
                    width: `${boxW}px`,
                    height: `${boxH}px`,
                    backgroundColor: `${color.fill}25`,
                    borderColor: color.stroke
                  }}
                  title={`[${item.shipmentId || 'CARGO'}] ${item.pickup || ''} → ${item.delivery || ''}\nVol: ${item.volume}m³, Wt: ${item.weight}kg\nPos: (${pos.x}, ${pos.y}, ${pos.z})`}
                >
                  <span className="text-[10px] font-black leading-tight text-gray-900 truncate max-w-full">
                    {item.shipmentId}
                  </span>
                  <span className="text-[8px] font-bold text-gray-600 truncate max-w-full">
                    {item.delivery || item.toStop}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SIDE PROFILE VIEW (X - Length, Z - Height) */}
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs font-bold text-gray-700">
          <span className="flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-gray-500" /> Side Elevation Stacking Profile (L × H)
          </span>
          <span className="text-[11px] text-gray-400 font-medium">Ground Floor (z=0) to Roof (z={truckH}m)</span>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className="relative border-2 border-dashed border-gray-400 bg-gray-50/70 rounded-xl overflow-hidden shadow-inner"
            style={{ width: `${svgWidth}px`, height: `${sideSvgHeight}px`, minWidth: `${svgWidth}px` }}
          >
            {/* Front Cabin Indicator */}
            <div className="absolute left-0 top-0 bottom-0 w-3 bg-gray-300 border-r border-gray-400 flex items-center justify-center">
              <span className="text-[9px] font-black text-gray-600 rotate-[-90deg] uppercase tracking-wider whitespace-nowrap">CABIN</span>
            </div>

            {/* Rear Door Indicator */}
            <div className="absolute right-0 top-0 bottom-0 w-3 bg-amber-200 border-l border-amber-400 flex items-center justify-center">
              <span className="text-[9px] font-black text-amber-800 rotate-90 uppercase tracking-wider whitespace-nowrap">REAR</span>
            </div>

            {/* Render Cargo Placements on Side Profile (z is inverted for SVG bottom-up display) */}
            {assignments.map((item, idx) => {
              const pos = item.position || { x: 0, y: 0, z: 0 };
              const dims = item.dimensions || { dx: 1.5, dy: 1.0, dz: 1.0 };
              const dx = Number(dims.dx || dims.length || 1.5);
              const dz = Number(dims.dz || dims.height || 1.0);

              const posX = (pos.x || 0) * scale + 12;
              const boxW = Math.max(16, dx * scale);
              const boxH = Math.max(16, dz * scale);
              // Bottom alignment:
              const posY = sideSvgHeight - ((pos.z || 0) * scale + boxH);

              const color = getStatusColor(item);

              return (
                <div
                  key={`side-${item.shipmentId || idx}`}
                  className="absolute rounded border transition-all hover:scale-[1.02] hover:z-10 cursor-pointer shadow-sm flex flex-col items-center justify-center p-1 overflow-hidden"
                  style={{
                    left: `${posX}px`,
                    top: `${posY}px`,
                    width: `${boxW}px`,
                    height: `${boxH}px`,
                    backgroundColor: `${color.fill}35`,
                    borderColor: color.stroke
                  }}
                  title={`[${item.shipmentId || 'CARGO'}] ${item.pickup || ''} → ${item.delivery || ''}\nVol: ${item.volume}m³, Wt: ${item.weight}kg\nZ-Height: ${pos.z}m to ${(pos.z + dz).toFixed(2)}m`}
                >
                  <span className="text-[10px] font-black leading-tight text-gray-900 truncate max-w-full">
                    {item.shipmentId}
                  </span>
                  <span className="text-[8px] font-bold text-gray-600">
                    {item.volume}m³ | {item.weight}kg
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Trailer2DView;
