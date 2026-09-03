import React, { useState } from 'react';
import { MapPin, Search, Truck, AlertCircle, RefreshCw } from 'lucide-react';
import RouteStepTracker from '../../components/transit/RouteStepTracker';
import api from '../../services/api';

const TrackShipmentView = () => {
  const [trackingId, setTrackingId] = useState('');
  const [trackedCargo, setTrackedCargo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const handleTrack = async (e) => {
    if (e) e.preventDefault();
    const id = trackingId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setTrackedCargo(null);
    try {
      const res = await api.get(`/shipments/track/${encodeURIComponent(id)}`);
      if (res.data && (res.data.shipment || res.data.booking)) {
        setTrackedCargo(res.data.shipment || res.data.booking);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError('Failed to fetch tracking data. Please check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

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
      <form onSubmit={handleTrack} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex items-center gap-3">
        <Search className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder="Enter Booking ID or Shipment ID (e.g. BKG-178825...)"
          className="w-full text-xs font-semibold border-none outline-none text-gray-900 placeholder:text-gray-400"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shrink-0 border-none cursor-pointer flex items-center gap-2 disabled:opacity-60"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Track'}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3 text-sm font-semibold text-red-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Not found */}
      {notFound && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-xs">
          <MapPin className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">No shipment found for &quot;{trackingId}&quot;</p>
          <p className="text-xs text-gray-300 mt-1">Verify the Booking or Shipment ID and try again.</p>
        </div>
      )}

      {/* Initial empty prompt */}
      {!loading && !error && !notFound && !trackedCargo && (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center shadow-xs">
          <Truck className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-bold text-gray-400">Enter a Booking or Shipment ID above to track live status</p>
        </div>
      )}

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
                  {trackedCargo._id || trackedCargo.id || trackingId}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5" /> {trackedCargo.status || 'In Transit'}
                </span>
              </div>
            </div>

            {/* Step Tracker */}
            {trackedCargo.stops && (
              <RouteStepTracker
                stops={trackedCargo.stops}
                currentStopIndex={trackedCargo.currentStopIndex ?? 0}
                tripStatus={trackedCargo.status || 'IN_TRANSIT'}
              />
            )}

            {/* Fallback info if no stops structure */}
            {!trackedCargo.stops && (
              <div className="text-xs text-gray-600 space-y-1">
                {trackedCargo.pickup && <p>Pickup: <strong>{trackedCargo.pickup}</strong></p>}
                {trackedCargo.delivery && <p>Delivery: <strong>{trackedCargo.delivery}</strong></p>}
                {trackedCargo.vehicleId && <p>Vehicle: <strong className="font-mono">{trackedCargo.vehicleId}</strong></p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackShipmentView;
