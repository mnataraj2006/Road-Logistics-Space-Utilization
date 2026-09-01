import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Truck, Navigation, ArrowRight, CheckCircle, AlertCircle, RefreshCw,
  Play, Check, X, Shield, Eye, Layers, Sliders, Box, AlertTriangle,
  FileText, Clock, ChevronRight, MapPin, Sparkles, Lock, ArrowDown
} from 'lucide-react';

const formatINR = (v) => (v != null ? `₹${Math.round(v).toLocaleString('en-IN')}` : '₹0');

const LogisticsManagerConsole = () => {
  const { user } = useContext(AuthContext);

  // Trips & Selected Trip
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [selectedTripData, setSelectedTripData] = useState(null);
  const [loadingTrips, setLoadingTrips] = useState(false);

  // Candidates & Optimizer state
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingApprove, setLoadingApprove] = useState(false);
  const [loadingDispatch, setLoadingDispatch] = useState(false);

  // Action status / banner messages
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState(null);

  // Visualization View Mode: 'TOP_DOWN' (X-Y) | 'SIDE_VIEW' (X-Z)
  const [visualizerMode, setVisualizerMode] = useState('TOP_DOWN');

  // Configurable objective weights
  const [weights, setWeights] = useState({
    volumeUtilization: 40,
    weightUtilization: 30,
    prioritySatisfaction: 15,
    deliveryAccessibility: 10,
    wastedSpacePenalty: 5
  });

  // Fetch all trips on initial mount
  const fetchTrips = async () => {
    setLoadingTrips(true);
    try {
      const res = await api.get('/trips');
      setTrips(res.data || []);
      if (res.data && res.data.length > 0 && !selectedTripId) {
        setSelectedTripId(res.data[0].tripId);
      }
    } catch (err) {
      console.error('Failed to load trips:', err);
    } finally {
      setLoadingTrips(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  // When selected trip changes, load its details, candidate shipments, and current load plan
  const loadTripDetails = async (tripId) => {
    if (!tripId) return;
    setActionSuccess('');
    setActionError(null);
    setPreviewResult(null);

    try {
      const [tripRes, candRes] = await Promise.all([
        api.get(`/trips/${tripId}`),
        api.get(`/trips/${tripId}/candidates`)
      ]);

      setSelectedTripData(tripRes.data);
      setCandidates(candRes.data.candidates || []);
    } catch (err) {
      console.error('Failed to load trip details:', err);
      setActionError(err.response?.data?.message || 'Failed to load trip details.');
    }
  };

  useEffect(() => {
    if (selectedTripId) {
      loadTripDetails(selectedTripId);
    }
  }, [selectedTripId]);

  // Handle in-memory optimization preview (NO DB mutation)
  const handlePreviewOptimization = async () => {
    if (!selectedTripId) return;
    setLoadingPreview(true);
    setActionError(null);
    setActionSuccess('');

    try {
      const res = await api.post(`/trips/${selectedTripId}/optimize/preview`, {
        config: { objectiveWeights: weights }
      });
      setPreviewResult(res.data.optimizationResult);
      setActionSuccess('Optimization preview generated in-memory! Review plan below before persisting.');
    } catch (err) {
      console.error('Optimization preview failed:', err);
      setActionError(err.response?.data?.message || 'Optimization preview failed.');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handle persistent load plan generation
  const handleGenerateLoadPlan = async () => {
    if (!selectedTripId) return;
    setLoadingGenerate(true);
    setActionError(null);
    setActionSuccess('');

    try {
      const res = await api.post(`/trips/${selectedTripId}/optimize/generate`, {
        config: { objectiveWeights: weights }
      });
      setActionSuccess(res.data.message || 'New Load Plan version generated and ready for manager review.');
      setPreviewResult(null);
      await loadTripDetails(selectedTripId);
      await fetchTrips();
    } catch (err) {
      console.error('Load plan generation failed:', err);
      setActionError(err.response?.data?.message || 'Failed to generate persistent load plan.');
    } finally {
      setLoadingGenerate(false);
    }
  };

  // Handle load plan approval
  const handleApproveLoadPlan = async (loadPlanId, version) => {
    if (!selectedTripId || !loadPlanId) return;
    setLoadingApprove(true);
    setActionError(null);
    setActionSuccess('');

    try {
      const res = await api.post(`/trips/${selectedTripId}/load-plan/${loadPlanId}/approve`, {
        expectedVersion: version,
        notes: `Approved by manager ${user?.username || ''}`
      });
      setActionSuccess(res.data.message || 'Load plan approved! Trip is READY for dispatch.');
      await loadTripDetails(selectedTripId);
      await fetchTrips();
    } catch (err) {
      console.error('Load plan approval failed:', err);
      setActionError(err.response?.data?.message || 'Failed to approve load plan due to concurrency conflict.');
    } finally {
      setLoadingApprove(false);
    }
  };

  // Handle trip dispatch
  const handleDispatchTrip = async () => {
    if (!selectedTripId) return;
    setLoadingDispatch(true);
    setActionError(null);
    setActionSuccess('');

    try {
      const res = await api.post(`/trips/${selectedTripId}/dispatch`);
      setActionSuccess(res.data.message || 'Trip successfully dispatched! Load plan is locked immutable.');
      await loadTripDetails(selectedTripId);
      await fetchTrips();
    } catch (err) {
      console.error('Trip dispatch failed:', err);
      setActionError(err.response?.data?.message || 'Failed to dispatch trip.');
    } finally {
      setLoadingDispatch(false);
    }
  };

  const currentPlan = previewResult
    ? {
        loadPlanId: 'PREVIEW-IN-MEMORY',
        version: 'Preview',
        status: 'PREVIEW',
        objectiveScore: previewResult.objectiveScore,
        scoreBreakdown: previewResult.scoreBreakdown,
        volumeUtilization: previewResult.overallVolumeUtilization,
        weightUtilization: previewResult.overallWeightUtilization,
        peakUtilization: {
          volume: previewResult.peakVolumeUtilization,
          weight: previewResult.peakWeightUtilization
        },
        segmentUtilization: previewResult.segmentUtilization,
        unassignedShipments: previewResult.unassignedShipments,
        warnings: previewResult.warnings,
        explanation: previewResult.explanation
      }
    : selectedTripData?.latestPlan;

  const currentAssignments = previewResult
    ? previewResult.assignments
    : selectedTripData?.assignments || [];

  const truckDimensions = selectedTripData?.trip?.vehicle?.dimensions || { length: 13.6, width: 2.45, height: 3.0 };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-[#f8fafc]">
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="bg-emerald-50 text-[#16a34a] text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
              Logistics Control Engine
            </span>
            <span className="text-[10px] font-bold text-gray-400">Load Optimization & Multi-Stop Dispatch</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-1">
            Logistics Manager Workspace
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-0.5">
            Evaluate candidate cargo, simulate 3D space plans, resolve unassigned bottlenecks, approve versions, and dispatch trips.
          </p>
        </div>

        {/* Trip Selector Dropdown */}
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className="w-full sm:w-72 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black text-gray-900 focus:border-[#16a34a] focus:outline-none shadow-sm"
          >
            {trips.map((t) => (
              <option key={t.tripId} value={t.tripId}>
                {t.tripId} • {t.vehicleId} ({t.status})
              </option>
            ))}
          </select>
          <button
            onClick={() => loadTripDetails(selectedTripId)}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 border-none cursor-pointer"
            title="Refresh Trip Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingTrips ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── ALERTS BANNER ───────────────────────────────────────── */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center space-x-3 text-emerald-800 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-[#16a34a] shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center space-x-3 text-red-700 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ── WORKFLOW STAGES PROGRESS BAR ────────────────────────── */}
      {selectedTripData && (
        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
          <div className="flex items-center space-x-2 text-gray-700">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#16a34a] flex items-center justify-center text-[11px] font-black">1</span>
            <span>Pending Cargo ({candidates.length})</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 hidden sm:block" />

          <div className="flex items-center space-x-2 text-gray-700">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#16a34a] flex items-center justify-center text-[11px] font-black">2</span>
            <span>Optimizer Evaluation</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 hidden sm:block" />

          <div className="flex items-center space-x-2 text-gray-700">
            <span className="w-6 h-6 rounded-full bg-emerald-100 text-[#16a34a] flex items-center justify-center text-[11px] font-black">3</span>
            <span>Load Plan Review ({currentPlan ? `v${currentPlan.version}` : 'None'})</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 hidden sm:block" />

          <div className="flex items-center space-x-2 text-gray-700">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
              selectedTripData.trip.status === 'READY' || selectedTripData.trip.status === 'IN_TRANSIT'
                ? 'bg-[#16a34a] text-white'
                : 'bg-gray-100 text-gray-500'
            }`}>4</span>
            <span>Approval & Dispatch</span>
          </div>
        </div>
      )}

      {/* ── TRIP SUMMARY & ROUTE BANNER ─────────────────────────── */}
      {selectedTripData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Trip & Vehicle Spec Card */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Active Vehicle</span>
                <h3 className="text-base font-black text-gray-900">{selectedTripData.trip.vehicleId}</h3>
                <span className="text-xs text-gray-500 font-semibold">{selectedTripData.trip.vehicle?.type} • Carrier: {selectedTripData.trip.carrierId}</span>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                selectedTripData.trip.status === 'IN_TRANSIT' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                selectedTripData.trip.status === 'READY' ? 'bg-emerald-50 text-[#16a34a] border border-emerald-200' :
                'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {selectedTripData.trip.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-50 text-xs">
              <div className="bg-gray-50 p-2.5 rounded-xl">
                <span className="text-[9px] font-black text-gray-400 uppercase block">Max Volume</span>
                <span className="font-black text-gray-800">{selectedTripData.trip.vehicle?.capacityVolume} m³</span>
              </div>
              <div className="bg-gray-50 p-2.5 rounded-xl">
                <span className="text-[9px] font-black text-gray-400 uppercase block">Max Weight</span>
                <span className="font-black text-gray-800">{selectedTripData.trip.vehicle?.capacityWeight?.toLocaleString()} kg</span>
              </div>
            </div>
          </div>

          {/* Route & Multi-Stop Card */}
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Route Sequence</span>
                <h3 className="text-base font-black text-gray-900">
                  {selectedTripData.trip.route?.source} ➔ {selectedTripData.trip.route?.destination} ({selectedTripData.trip.route?.distance} KM)
                </h3>
              </div>
              <span className="text-xs text-gray-400 font-semibold">{selectedTripData.stops?.length || 0} Ordered Stops</span>
            </div>

            {/* Stops Timeline */}
            <div className="flex items-center space-x-2 overflow-x-auto py-2">
              {selectedTripData.stops?.map((st, idx) => (
                <React.Fragment key={st.stopId}>
                  <div className="shrink-0 flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                    <span className="w-5 h-5 rounded-full bg-[#16a34a] text-white flex items-center justify-center text-[10px] font-black">
                      {st.sequence}
                    </span>
                    <div>
                      <span className="text-xs font-black text-gray-800 block">{st.location}</span>
                      <span className="text-[9px] text-gray-400 uppercase font-bold">{st.verificationStatus}</span>
                    </div>
                  </div>
                  {idx < selectedTripData.stops.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION CONTROLS & OPTIMIZER EXECUTION BAR ──────────── */}
      {selectedTripData && (
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 text-white p-6 rounded-3xl shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black tracking-tight">Multi-Stop Load Optimizer Pipeline</h3>
              </div>
              <p className="text-xs text-gray-300 mt-0.5 font-semibold">
                Generate 3D collision-free spatial allocations strictly constrained by route segment headroom and LIFO unloading.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handlePreviewOptimization}
                disabled={loadingPreview || candidates.length === 0}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-black text-xs rounded-xl border border-white/20 cursor-pointer flex items-center space-x-1.5 transition-all"
              >
                {loadingPreview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                <span>PREVIEW OPTIMIZATION</span>
              </button>

              <button
                onClick={handleGenerateLoadPlan}
                disabled={loadingGenerate || candidates.length === 0 || selectedTripData.trip.status === 'IN_TRANSIT'}
                className="px-5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-black text-xs rounded-xl shadow-md shadow-green-600/30 border-none cursor-pointer flex items-center space-x-1.5 transition-all"
              >
                {loadingGenerate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                <span>GENERATE LOAD PLAN</span>
              </button>

              {currentPlan?.status === 'GENERATED' && (
                <button
                  onClick={() => handleApproveLoadPlan(currentPlan.loadPlanId, currentPlan.version)}
                  disabled={loadingApprove}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/30 border-none cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  {loadingApprove ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>APPROVE PLAN (v{currentPlan.version})</span>
                </button>
              )}

              {selectedTripData.trip.status === 'READY' && (
                <button
                  onClick={handleDispatchTrip}
                  disabled={loadingDispatch}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-md shadow-blue-600/30 border-none cursor-pointer flex items-center space-x-1.5 transition-all"
                >
                  {loadingDispatch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                  <span>DISPATCH TRIP</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CANDIDATE CARGO TABLE ───────────────────────────────── */}
      {selectedTripData && (
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Box className="w-4 h-4 text-[#16a34a]" />
              <h3 className="text-base font-black text-gray-900">Eligible Candidate Cargo ({candidates.length})</h3>
            </div>
            <span className="text-xs text-gray-400 font-semibold">Matched against trip stops sequence</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-400 uppercase text-[9px] font-black tracking-wider">
                <tr>
                  <th className="p-3">Shipment ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Route Segment</th>
                  <th className="p-3">Volume (m³)</th>
                  <th className="p-3">Weight (kg)</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Flags</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                {candidates.map((c) => (
                  <tr key={c.shipmentId} className="hover:bg-gray-50/50">
                    <td className="p-3 font-black text-gray-900">{c.shipmentId}</td>
                    <td className="p-3 text-gray-600">{c.customer}</td>
                    <td className="p-3 font-black text-gray-800 flex items-center space-x-1">
                      <span>{c.pickup}</span>
                      <ArrowRight className="w-3 h-3 text-[#16a34a]" />
                      <span>{c.delivery}</span>
                    </td>
                    <td className="p-3">{c.volume} m³</td>
                    <td className="p-3">{c.weight?.toLocaleString()} kg</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                        c.priority === 'URGENT' ? 'bg-red-50 text-red-700 border border-red-200' :
                        c.priority === 'EXPRESS' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="p-3 text-[10px] space-x-1">
                      {c.fragile && <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-black">FRAGILE</span>}
                      {!c.stackable && <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-black">NO-STACK</span>}
                    </td>
                    <td className="p-3">
                      <span className="bg-emerald-50 text-[#16a34a] text-[10px] font-black px-2 py-0.5 rounded">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LOAD PLAN & OPTIMIZATION RESULTS INSPECTOR ─────────── */}
      {currentPlan && (
        <div className="space-y-6">
          {/* Top Row: Objective Score & Segment Fill Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Score Card */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Optimization Fit Score</span>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-black text-gray-900">{currentPlan.objectiveScore}</span>
                <span className="text-xs text-gray-400 font-bold">/ 100</span>
              </div>
              <div className="space-y-1 text-[11px] font-semibold text-gray-500 pt-2 border-t border-gray-50">
                <div className="flex justify-between"><span>Volume Score:</span><span className="font-bold text-gray-800">{currentPlan.scoreBreakdown?.volumeScore || 0}</span></div>
                <div className="flex justify-between"><span>Weight Score:</span><span className="font-bold text-gray-800">{currentPlan.scoreBreakdown?.weightScore || 0}</span></div>
                <div className="flex justify-between"><span>Priority Satisfaction:</span><span className="font-bold text-gray-800">{currentPlan.scoreBreakdown?.priorityScore || 0}</span></div>
                <div className="flex justify-between"><span>Obstruction Penalty:</span><span className="font-bold text-gray-800">-{currentPlan.scoreBreakdown?.totalObstructions || 0}</span></div>
              </div>
            </div>

            {/* Overall Utilization Card */}
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Overall Trip Fill Rate</span>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between font-black mb-1">
                    <span>Average Volume Fill:</span>
                    <span className="text-[#16a34a]">{currentPlan.volumeUtilization}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#16a34a] h-full rounded-full" style={{ width: `${currentPlan.volumeUtilization}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between font-black mb-1">
                    <span>Average Weight Fill:</span>
                    <span className="text-[#16a34a]">{currentPlan.weightUtilization}%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#16a34a] h-full rounded-full" style={{ width: `${currentPlan.weightUtilization}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Segment-Level Utilization Breakdown */}
            <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Segment-by-Segment Capacity Headroom</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentPlan.segmentUtilization?.map((seg, sIdx) => (
                  <div key={sIdx} className="bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs space-y-1">
                    <div className="flex justify-between items-center font-black">
                      <span className="text-gray-800">{seg.fromStop} ➔ {seg.toStop}</span>
                      <span className="text-[#16a34a]">{seg.volumeUtilization}% Vol</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 font-semibold">
                      <span>Used: {seg.usedVolume} m³ / {seg.usedWeight} kg</span>
                      <span className="font-bold text-emerald-700">{seg.remainingVolume} m³ free</span>
                    </div>
                    <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#16a34a] h-full rounded-full" style={{ width: `${seg.volumeUtilization}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 2D OPERATIONAL LOAD-PLAN VISUALIZER ──────────────── */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-base font-black text-gray-900">2D Operational Trailer Packing Plan</h3>
                <span className="text-xs text-gray-500 font-semibold">
                  Physical trailer container: {truckDimensions.length}m (L) × {truckDimensions.width}m (W) × {truckDimensions.height}m (H)
                </span>
              </div>

              <div className="flex items-center bg-gray-100 rounded-xl p-1 text-xs font-black">
                <button
                  type="button"
                  onClick={() => setVisualizerMode('TOP_DOWN')}
                  className={`px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${
                    visualizerMode === 'TOP_DOWN' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
                  }`}
                >
                  Top-Down Plan (Length × Width)
                </button>
                <button
                  type="button"
                  onClick={() => setVisualizerMode('SIDE_VIEW')}
                  className={`px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all ${
                    visualizerMode === 'SIDE_VIEW' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500'
                  }`}
                >
                  Side Profile (Length × Height)
                </button>
              </div>
            </div>

            {/* Trailer Canvas Box */}
            <div className="relative w-full h-64 bg-gray-900 rounded-2xl border-4 border-gray-800 p-3 overflow-hidden">
              {/* Front Cabin Label & Rear Door Label */}
              <div className="absolute top-2 left-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                ⬅ Front / Cabin
              </div>
              <div className="absolute top-2 right-3 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                Rear Door / Unloading Exit ➡
              </div>

              {/* Grid Lines */}
              <div className="w-full h-full border border-dashed border-gray-800 relative mt-4">
                {currentAssignments.map((a, idx) => {
                  const posX = a.position?.x || 0;
                  const posY = a.position?.y || 0;
                  const posZ = a.position?.z || 0;
                  const dimL = a.dimensions?.length || 2;
                  const dimW = a.dimensions?.width || 1.2;
                  const dimH = a.dimensions?.height || 1.5;

                  const leftPct = (posX / truckDimensions.length) * 100;
                  const widthPct = Math.min(100 - leftPct, (dimL / truckDimensions.length) * 100);

                  let topPct = 0;
                  let heightPct = 0;

                  if (visualizerMode === 'TOP_DOWN') {
                    topPct = (posY / truckDimensions.width) * 100;
                    heightPct = Math.min(100 - topPct, (dimW / truckDimensions.width) * 100);
                  } else {
                    topPct = (posZ / truckDimensions.height) * 100;
                    heightPct = Math.min(100 - topPct, (dimH / truckDimensions.height) * 100);
                  }

                  // Color gradient by delivery sequence
                  const colors = [
                    'bg-emerald-500/80 border-emerald-300',
                    'bg-blue-500/80 border-blue-300',
                    'bg-indigo-500/80 border-indigo-300',
                    'bg-amber-500/80 border-amber-300'
                  ];
                  const boxColor = colors[idx % colors.length];

                  return (
                    <div
                      key={a.shipmentId || idx}
                      className={`absolute rounded border text-white text-[10px] font-black flex flex-col items-center justify-center p-1 shadow-md transition-all hover:scale-105 hover:z-20 cursor-pointer ${boxColor}`}
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${Math.max(widthPct, 4)}%`,
                        height: `${Math.max(heightPct, 15)}%`
                      }}
                      title={`${a.shipmentId} (${a.segmentRange?.fromStop} ➔ ${a.segmentRange?.toStop}): ${a.volume}m³, ${a.weight}kg. Pos: (${posX}m, ${posY}m, ${posZ}m)`}
                    >
                      <span className="truncate">{a.shipmentId}</span>
                      <span className="text-[8px] opacity-80">{a.segmentRange?.toStop}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── ASSIGNMENTS & LOADING/UNLOADING SEQUENCE TABLE ───── */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-gray-900">
                Loading & Unloading Sequences ({currentAssignments.length} Shipments)
              </h3>
              <span className="text-xs text-gray-400 font-semibold">Strict LIFO Delivery Order</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-400 uppercase text-[9px] font-black tracking-wider">
                  <tr>
                    <th className="p-3">Loading Seq</th>
                    <th className="p-3">Unloading Seq</th>
                    <th className="p-3">Shipment ID</th>
                    <th className="p-3">Hop Range</th>
                    <th className="p-3">Volume</th>
                    <th className="p-3">Weight</th>
                    <th className="p-3">Spatial Position (X, Y, Z)</th>
                    <th className="p-3">Obstruction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-semibold text-gray-700">
                  {currentAssignments.map((a) => (
                    <tr key={a.shipmentId} className="hover:bg-gray-50/50">
                      <td className="p-3">
                        <span className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center font-black text-[10px]">
                          {a.loadingSequence}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="w-6 h-6 rounded-full bg-[#16a34a] text-white flex items-center justify-center font-black text-[10px]">
                          {a.unloadingSequence}
                        </span>
                      </td>
                      <td className="p-3 font-black text-gray-900">{a.shipmentId}</td>
                      <td className="p-3 font-black text-gray-800">
                        {a.segmentRange?.fromStop} ➔ {a.segmentRange?.toStop}
                      </td>
                      <td className="p-3">{a.volume} m³</td>
                      <td className="p-3">{a.weight?.toLocaleString()} kg</td>
                      <td className="p-3 text-[11px] font-mono text-gray-500">
                        ({a.position?.x}m, {a.position?.y}m, {a.position?.z}m) [{a.orientation}]
                      </td>
                      <td className="p-3">
                        {a.obstructionScore === 0 ? (
                          <span className="text-emerald-600 font-bold">0 (Accessible)</span>
                        ) : (
                          <span className="text-amber-600 font-bold">{a.obstructionScore} obstruction(s)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── UNASSIGNED CARGO & RESOLUTION PANEL ───────────────── */}
          {currentPlan.unassignedShipments?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl space-y-4">
              <div className="flex items-center space-x-2 text-amber-800">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="text-base font-black">
                  Unassigned Cargo Diagnostics ({currentPlan.unassignedShipments.length})
                </h3>
              </div>
              <p className="text-xs text-amber-700 font-semibold">
                The following packages could not be loaded on this trip due to physical capacity, segment limits, or stacking bounds:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentPlan.unassignedShipments.map((u, uIdx) => (
                  <div key={uIdx} className="bg-white p-4 rounded-2xl border border-amber-200 text-xs space-y-1 shadow-sm">
                    <div className="flex justify-between font-black text-gray-900">
                      <span>{u.shipmentId}</span>
                      <span className="text-amber-600">{u.volume} m³ • {u.weight} kg</span>
                    </div>
                    <div className="text-[11px] text-gray-600 font-semibold">
                      Route: {u.pickup} ➔ {u.delivery}
                    </div>
                    <div className="text-[11px] text-red-600 font-bold pt-1">
                      Reason: {u.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LogisticsManagerConsole;
