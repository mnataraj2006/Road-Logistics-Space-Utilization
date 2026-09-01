import React, { useState } from 'react';
import { MapPin, Search, Truck, Clock, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';
import RouteStepTracker from '../../components/transit/RouteStepTracker';

const TrackShipmentView = () => {
  const [trackingId, setTrackingId] = useState('BKG-TRACK-DEMO');
  const [trackedCargo, setTrackedCargo] = useState({
    id: 'BKG-CHENNAI-MADURAI-01',
    pickup: 'Chennai',
    delivery: 'Madurai',
    vehicleId: 'TRK-FASTLANE-08',
    status: 'IN_TRANSIT',
    currentStopIndex: 1,
    stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
    eta: 'Today, 18:30 IST'
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <MapPin className="w-6 h-6 text-emerald-600" />
          Real-Time Shipment Route Tracker
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor multi-stop segment progress, stop arrival records, and live trailer assignments.
        </p>
      </div>

      {/* Search Input Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder="Enter Booking ID or Shipment ID (e.g. BKG-178825...)"
          className="w-full text-xs font-semibold border-none outline-none text-gray-900 placeholder:text-gray-400"
        />
        <button className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shrink-0 border-none cursor-pointer">
          Track
        </button>
      </div>

      {/* Tracking Result Card */}
      {trackedCargo && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Consignment Ref
                </span>
                <span className="text-base font-black text-gray-900 font-mono">
                  {trackedCargo.id}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> In Transit
                </span>
                <span className="text-xs text-gray-500 font-semibold">
                  ETA: <strong>{trackedCargo.eta}</strong>
                </span>
              </div>
            </div>

            {/* Step Tracker */}
            <RouteStepTracker
              stops={trackedCargo.stops}
              currentStopIndex={trackedCargo.currentStopIndex}
              tripStatus="IN_TRANSIT"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackShipmentView;
