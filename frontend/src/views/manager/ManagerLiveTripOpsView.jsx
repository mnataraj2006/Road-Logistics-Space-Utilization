import React, { useState, useEffect } from 'react';
import {
  Truck, ShieldCheck, MapPin, Layers, RefreshCw, AlertTriangle,
  CheckCircle2, ArrowRight, Box, QrCode, Play
} from 'lucide-react';
import axios from 'axios';
import RouteStepTracker from '../../components/transit/RouteStepTracker';
import OperationalLoadVisualizer from '../../components/optimizer/OperationalLoadVisualizer';

const ManagerLiveTripOpsView = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [tripDetail, setTripDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reoptimizing, setReoptimizing] = useState(false);
  const [reoptPreview, setReoptPreview] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [error, setError] = useState(null);

  // Load Trips
  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/trips', { headers: authHeader });
        const list = Array.isArray(res.data) ? res.data : [];
        setTrips(list);

        if (list.length > 0) {
          const activeTrip = list.find(t => ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(t.status?.toUpperCase())) || list[0];
          setSelectedTripId(activeTrip.tripId);
          loadTripDetail(activeTrip.tripId);
        }
      } catch (err) {
        console.error('Error fetching trips:', err);
      }
    };
    fetchTrips();
  }, []);

  const loadTripDetail = async (tId) => {
    if (!tId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`/api/trips/${tId}`, { headers: authHeader });
      setTripDetail(res.data.trip || res.data);
    } catch (err) {
      console.error('Error fetching trip detail:', err);
      setError('Failed to fetch trip details.');
    } finally {
      setLoading(false);
    }
  };

  const handleTripChange = (e) => {
    const tId = e.target.value;
    setSelectedTripId(tId);
    setReoptPreview(null);
    loadTripDetail(tId);
  };

  const handleDispatchTrip = async () => {
    if (!selectedTripId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`/api/trips/${selectedTripId}/dispatch`, {}, { headers: authHeader });
      setActionMessage(`Trip ${selectedTripId} successfully dispatched! Origin cargo loaded.`);
      loadTripDetail(selectedTripId);
    } catch (err) {
      console.error('Dispatch error:', err);
      setError(err.response?.data?.message || 'Failed to dispatch trip.');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewReoptimization = async () => {
    if (!selectedTripId) return;
    setReoptimizing(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post(`/api/trips/${selectedTripId}/reoptimize/preview`, {}, { headers: authHeader });
      setReoptPreview(res.data);
    } catch (err) {
      console.error('Re-optimization error:', err);
      setError(err.response?.data?.message || 'Failed to run dynamic re-optimization.');
    } finally {
      setReoptimizing(false);
    }
  };

  const handleApplyReoptimization = async () => {
    if (!selectedTripId || !reoptPreview) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`/api/trips/${selectedTripId}/reoptimize/apply`, {
        approvedPlan: reoptPreview.reoptimizedPlan
      }, { headers: authHeader });
      setActionMessage('Re-optimized plan applied! New LoadPlan version locked.');
      setReoptPreview(null);
      loadTripDetail(selectedTripId);
    } catch (err) {
      console.error('Apply re-opt error:', err);
      setError(err.response?.data?.message || 'Failed to apply re-optimization.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            Live Multi-Stop Trip Execution & Re-Optimization
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor real-time stop progress, trailer cargo state, stop verifications, and dynamic space re-allocation.
          </p>
        </div>

        {/* Trip Selector */}
        <select
          value={selectedTripId}
          onChange={handleTripChange}
          className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none bg-white min-w-[280px]"
        >
          {trips.map((t) => (
            <option key={t.tripId} value={t.tripId}>
              {t.tripId} — {t.vehicleId} ({t.status})
            </option>
          ))}
        </select>
      </div>

      {actionMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold">{actionMessage}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      {tripDetail && (
        <div className="space-y-6">
          {/* Trip Status Banner */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-gray-900">
                  {tripDetail.tripId}
                </span>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                  {tripDetail.status}
                </span>
              </div>
              <p className="text-xs text-gray-600 font-semibold">
                Vehicle: <strong>{tripDetail.vehicleId}</strong> | Route: <strong>{tripDetail.routeId}</strong>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              {['PLANNED', 'READY_FOR_DISPATCH'].includes(tripDetail.status) && (
                <button
                  onClick={handleDispatchTrip}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none"
                >
                  <Play className="w-4 h-4" />
                  <span>Dispatch Trip</span>
                </button>
              )}

              {['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(tripDetail.status) && (
                <button
                  onClick={handlePreviewReoptimization}
                  disabled={reoptimizing}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none"
                >
                  {reoptimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>Re-Optimize Downstream Route</span>
                </button>
              )}
            </div>
          </div>

          {/* Route Step Tracker */}
          <RouteStepTracker
            stops={tripDetail.stops || ['Chennai', 'Salem', 'Coimbatore', 'Madurai']}
            currentStopIndex={tripDetail.currentStopIndex || 0}
            tripStatus={tripDetail.status}
          />

          {/* Full Operational Load Visualizer with Toggle Modes */}
          <OperationalLoadVisualizer
            tripId={tripDetail.tripId}
            vehicleId={tripDetail.vehicleId}
            truckSpecs={{
              capacityVolume: tripDetail.capacityVolume || 100,
              capacityWeight: tripDetail.capacityWeight || 20000,
              dimensions: { length: 13.6, width: 2.45, height: 3.0 }
            }}
            route={{
              routeId: tripDetail.routeId,
              stops: tripDetail.stops || ['Chennai', 'Salem', 'Coimbatore', 'Madurai']
            }}
            currentStopIndex={tripDetail.currentStopIndex || 1}
            assignments={tripDetail.actualLoadSnapshot?.loadedShipments || tripDetail.assignments || []}
            unloadsAtCurrentStop={[]}
            loadsAtCurrentStop={['BKG-015', 'BKG-017']}
          />

          {/* Dynamic Re-Optimization Preview Modal / Banner */}
          {reoptPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-3xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-blue-950 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-blue-600" />
                    Dynamic Re-Optimization Comparison
                  </h3>
                  <p className="text-xs text-blue-800 mt-0.5">
                    Evaluated downstream stops without modifying completed historical unloads.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReoptPreview(null)}
                    className="px-3 py-1.5 bg-transparent hover:bg-blue-100 text-blue-900 rounded-lg text-xs font-bold border-none cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyReoptimization}
                    disabled={loading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition border-none cursor-pointer"
                  >
                    Apply & Supersede Old Plan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-gray-500 block">Locked Cargo</span>
                  <span className="font-bold text-gray-900">{reoptPreview.reoptimizedPlan?.lockedCount || 1} items retained</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-gray-500 block">New Cargo Added</span>
                  <span className="font-bold text-emerald-600">{reoptPreview.reoptimizedPlan?.newAllocationsCount || 1} items added</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-gray-500 block">Peak Fill Factor</span>
                  <span className="font-bold text-gray-900">{reoptPreview.reoptimizedPlan?.peakVolumeUtilization?.toFixed(1) || 85}%</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-blue-100">
                  <span className="text-[10px] text-gray-500 block">Objective Score</span>
                  <span className="font-bold text-blue-700">{reoptPreview.reoptimizedPlan?.objectiveScore?.toFixed(0) || 92}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ManagerLiveTripOpsView;
