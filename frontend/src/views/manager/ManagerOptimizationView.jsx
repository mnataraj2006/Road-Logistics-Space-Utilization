import React, { useState, useEffect } from 'react';
import {
  Sliders, Truck, Box, CheckCircle2, XCircle, RefreshCw,
  AlertTriangle, ShieldCheck, MapPin, Layers, ArrowRight, Info
} from 'lucide-react';
import axios from 'axios';
import Trailer2DView from '../../components/optimizer/Trailer2DView';

const ManagerOptimizationView = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [candidateShipments, setCandidateShipments] = useState([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Load Trips and candidate shipments
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

        const resTrips = await axios.get('/api/trips', { headers: authHeader });
        const tripList = Array.isArray(resTrips.data) ? resTrips.data : [];
        setTrips(tripList);

        if (tripList.length > 0) {
          const firstPlanned = tripList.find(t => ['PLANNED', 'READY_FOR_DISPATCH'].includes(t.status?.toUpperCase())) || tripList[0];
          setSelectedTripId(firstPlanned.tripId);
          loadCandidatesForTrip(firstPlanned.tripId);
        }
      } catch (err) {
        console.error('Error fetching initial optimizer data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const loadCandidatesForTrip = async (tId) => {
    if (!tId) return;
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get(`/api/trips/${tId}/candidates`, { headers: authHeader });
      const candidates = res.data.candidateShipments || [];
      setCandidateShipments(candidates);
      setSelectedShipmentIds(candidates.map(c => c.shipmentId || c.bookingId));
    } catch (err) {
      console.error('Error fetching candidates for trip:', err);
    }
  };

  const handleTripChange = (e) => {
    const tId = e.target.value;
    setSelectedTripId(tId);
    setOptimizationResult(null);
    loadCandidatesForTrip(tId);
  };

  const toggleShipmentSelection = (id) => {
    setSelectedShipmentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRunOptimizer = async () => {
    if (!selectedTripId) return;
    setOptimizing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.post(
        `/api/trips/${selectedTripId}/optimize/preview`,
        { selectedShipmentIds },
        { headers: authHeader }
      );

      setOptimizationResult(response.data.loadPlan || response.data);
    } catch (err) {
      console.error('Optimizer preview error:', err);
      setError(err.response?.data?.message || 'Failed to run optimization engine.');
    } finally {
      setOptimizing(false);
    }
  };

  const handleApproveLoadPlan = async () => {
    if (!selectedTripId || !optimizationResult) return;
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      await axios.post(
        `/api/trips/${selectedTripId}/load-plan/approve`,
        {
          expectedVersion: optimizationResult.version || 1,
          assignments: optimizationResult.assignments
        },
        { headers: authHeader }
      );

      setSuccessMessage('Load plan approved and locked! Trip is now READY_FOR_DISPATCH.');
    } catch (err) {
      console.error('Approval error:', err);
      setError(err.response?.data?.message || 'Failed to approve load plan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-emerald-600" />
          Multi-Stop Space Optimization Console
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate provably valid 3D trailer loading plans respecting multi-segment route capacity, physical geometry, and LIFO accessibility.
        </p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold">{successMessage}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      {/* Trip Selector & Optimizer Run Controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-gray-700">
            Target Trip & Vehicle
          </label>
          <select
            value={selectedTripId}
            onChange={handleTripChange}
            className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none bg-white min-w-[280px]"
          >
            {trips.map((t) => (
              <option key={t.tripId} value={t.tripId}>
                {t.tripId} — Truck: {t.vehicleId} ({t.status})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleRunOptimizer}
          disabled={optimizing || !selectedTripId}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer border-none disabled:opacity-50"
        >
          {optimizing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Sliders className="w-4 h-4" />
          )}
          <span>{optimizing ? 'Executing Optimizer Engine...' : 'Run Optimization'}</span>
        </button>
      </div>

      {/* Candidate Cargo Pool Selection */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Box className="w-4 h-4 text-emerald-600" />
            Candidate Consignments Pool ({candidateShipments.length})
          </h3>
          <span className="text-xs text-gray-500 font-semibold">
            {selectedShipmentIds.length} of {candidateShipments.length} selected for allocation
          </span>
        </div>

        {candidateShipments.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400">
            No pending candidate cargo for this trip route.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {candidateShipments.map((c) => {
              const id = c.shipmentId || c.bookingId;
              const isSelected = selectedShipmentIds.includes(id);

              return (
                <div
                  key={id}
                  onClick={() => toggleShipmentSelection(id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition select-none ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                      : 'border-gray-200 bg-gray-50/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="font-mono text-gray-900">{id}</span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      className="rounded text-emerald-600"
                    />
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1">
                    {c.pickupStop || c.fromStop} → {c.deliveryStop || c.toStop}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                    <span>Vol: {c.volume} m³</span>
                    <span>Wt: {c.weight} kg</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Generated Load Plan Output */}
      {optimizationResult && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                Allocated Cargo
              </span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {optimizationResult.assignedCount || optimizationResult.assignments?.length || 0}
              </span>
              <span className="text-[10px] text-gray-500 font-semibold">
                Of {optimizationResult.totalCandidates || candidateShipments.length} candidate packages
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                Peak Volume Fill
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">
                {optimizationResult.peakVolumeUtilization?.toFixed(1) || 0}%
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold">
                Guaranteed segment headroom
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                Peak Weight Fill
              </span>
              <span className="text-2xl font-black text-gray-900 mt-1 block">
                {optimizationResult.peakWeightUtilization?.toFixed(1) || 0}%
              </span>
              <span className="text-[10px] text-gray-500 font-semibold">
                Gross vehicle weight rating safe
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
                Objective Score
              </span>
              <span className="text-2xl font-black text-emerald-600 mt-1 block">
                {optimizationResult.objectiveScore?.toFixed(0) || 100}
              </span>
              <span className="text-[10px] text-gray-500 font-semibold">
                Fit & LIFO accessibility
              </span>
            </div>
          </div>

          {/* 2D Operational Trailer Visualizer */}
          <Trailer2DView
            truckDims={{ length: 13.6, width: 2.45, height: 3.0 }}
            assignments={optimizationResult.assignments || []}
          />

          {/* Unassigned Cargo Explanations */}
          {optimizationResult.unassignedShipments?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Unassigned Cargo Explanations ({optimizationResult.unassignedShipments.length})
              </h4>
              <div className="space-y-2">
                {optimizationResult.unassignedShipments.map((u, idx) => (
                  <div key={idx} className="text-xs text-amber-800 flex items-start gap-2 bg-white/70 p-2.5 rounded-lg border border-amber-100">
                    <span className="font-mono font-bold text-amber-950 shrink-0">
                      {u.shipmentId || u.item?.shipmentId}:
                    </span>
                    <span>{u.reason || 'Insufficient segment volume headroom.'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approval Controls */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              Approving persists version <strong className="text-gray-900 font-bold">{optimizationResult.version || 1}</strong> with optimistic lock validation.
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleApproveLoadPlan}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Approve & Lock Load Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerOptimizationView;
