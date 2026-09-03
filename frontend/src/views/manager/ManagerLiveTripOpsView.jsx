import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Truck,
  ShieldCheck,
  MapPin,
  Layers,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Box,
  QrCode,
  Play,
  Sparkles,
  Calendar,
  Compass,
  Lock,
  Flame,
  CheckCircle,
  PackageCheck,
  RotateCcw,
  Eye,
  Info
} from 'lucide-react';
import api from '../../services/api';
import RouteStepTracker from '../../components/transit/RouteStepTracker';
import OperationalLoadVisualizer from '../../components/optimizer/OperationalLoadVisualizer';

const ManagerLiveTripOpsView = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [tripDetail, setTripDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reoptimizing, setReoptimizing] = useState(false);
  const [reoptPreview, setReoptPreview] = useState(null);
  const [actionMessage, setActionMessage] = useState(null);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // Load Trips
  const fetchTrips = async () => {
    setLoading(true);
    try {
      const res = await api.get('/trips');
      const list = Array.isArray(res.data) ? res.data : [];
      setTrips(list);

      if (list.length > 0) {
        // Default to active / in-transit / ready trip, or first
        const activeTrip =
          list.find((t) => ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'READY_FOR_DISPATCH'].includes(t.status?.toUpperCase())) || list[0];
        setSelectedTripId(activeTrip.tripId);
        loadTripDetail(activeTrip.tripId);
      } else {
        setSelectedTripId('');
        setTripDetail(null);
      }
    } catch (err) {
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  const loadTripDetail = async (tId) => {
    if (!tId) return;
    setDetailLoading(true);
    setError(null);
    try {
      const res = await api.get(`/trips/${tId}`);
      const rawTrip = res.data.trip || res.data;
      const stopsList = res.data.stops || [];
      const derivedStops = rawTrip?.stops && rawTrip.stops.length > 0
        ? rawTrip.stops
        : (rawTrip?.route?.stopsDetails?.map(s => s.locationName) || stopsList.map(s => s.location) || ['Chennai', 'Vellore', 'Hosur', 'Bangalore']);

      const rawAssignments = res.data.assignments || rawTrip?.assignments || rawTrip?.actualLoadSnapshot?.loadedShipments || [];

      setTripDetail({
        ...rawTrip,
        effectiveVehicle: res.data.vehicle || rawTrip.effectiveVehicle || rawTrip.vehicle,
        stopsList,
        stops: derivedStops,
        assignments: rawAssignments,
        latestPlan: res.data.latestPlan || null
      });
    } catch (err) {
      console.error('Error fetching trip detail:', err);
      setError('Failed to fetch trip details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTripChange = (e) => {
    const tId = e.target.value;
    setSelectedTripId(tId);
    setReoptPreview(null);
    loadTripDetail(tId);
  };

  const handleVerifyStopArrival = async (stopArg, stopIndexArg) => {
    if (!selectedTripId || !tripDetail) return;
    setDetailLoading(true);
    setError(null);
    try {
      const stopsList = tripDetail.stopsList || [];
      let targetStopObj = null;

      if (stopIndexArg !== undefined && stopsList[stopIndexArg]) {
        targetStopObj = stopsList[stopIndexArg];
      } else {
        targetStopObj =
          stopsList.find((s, idx) => idx > 0 && s.verificationStatus !== 'COMPLETED') ||
          stopsList[(tripDetail.currentStopIndex || 0) + 1] ||
          stopsList[stopsList.length - 1];
      }

      const token = targetStopObj?.secureToken || targetStopObj?.qrToken || '';
      const stopId = targetStopObj?.stopId;

      const payload = {
        tripId: selectedTripId,
        vehicleId: tripDetail.vehicleId,
        qrToken: token,
        secureToken: token,
        stopId: stopId
      };

      const res = await api.post('/transit/verify-stop', payload);
      setActionMessage(res.data.message || 'Stop arrival verified! Cargo unloads and loads executed.');
      await loadTripDetail(selectedTripId);
      await fetchTrips();
    } catch (err) {
      console.error('Stop verification error:', err);
      setError(err.response?.data?.message || 'Failed to verify stop arrival.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDispatchTrip = async () => {
    if (!selectedTripId) return;
    setDetailLoading(true);
    setError(null);
    try {
      const res = await api.post(`/trips/${selectedTripId}/dispatch`, {});
      setActionMessage(res.data?.message || `Trip ${selectedTripId} successfully dispatched! Origin cargo loaded.`);
      await loadTripDetail(selectedTripId);
      await fetchTrips();
    } catch (err) {
      console.error('Dispatch error:', err);
      setError(err.response?.data?.message || 'Failed to dispatch trip.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePreviewReoptimization = async () => {
    if (!selectedTripId) return;
    setReoptimizing(true);
    setError(null);
    try {
      const res = await api.post(`/trips/${selectedTripId}/reoptimize/preview`, {});
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
    setDetailLoading(true);
    setError(null);
    try {
      await api.post(`/trips/${selectedTripId}/reoptimize/apply`, {
        approvedPlan: reoptPreview.reoptimizedPlan
      });
      setActionMessage('Re-optimized plan applied! New LoadPlan version locked.');
      setReoptPreview(null);
      await loadTripDetail(selectedTripId);
    } catch (err) {
      console.error('Apply re-opt error:', err);
      setError(err.response?.data?.message || 'Failed to apply re-optimization.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleQuickSeedActiveTrip = async () => {
    setSeeding(true);
    setError(null);
    try {
      // 1. Ensure truck exists
      let resVeh = await api.get('/vehicles');
      let vehList = Array.isArray(resVeh.data) ? resVeh.data : [];
      let vehicle = vehList[0];
      if (!vehicle) {
        const vRes = await api.post('/vehicles', {
          vehicleId: 'TN-01',
          type: 'Heavy Truck',
          dimensions: { length: 13.6, width: 2.45, height: 2.8 },
          capacityVolume: 93.3,
          capacityWeight: 20000,
          routeLane: 'CHN-BLR-EXP',
          baseLocation: 'Chennai Hub',
          ratePerCbm: 150,
          ratePerKg: 5,
          status: 'Active'
        });
        vehicle = vRes.data;
      }

      // 2. Ensure Route exists
      try {
        await api.get('/routes/CHN-BLR-EXP');
      } catch {
        await api.post('/routes', {
          routeId: 'CHN-BLR-EXP',
          source: 'Chennai',
          destination: 'Bangalore',
          stops: ['Kanchipuram', 'Vellore', 'Hosur'],
          distance: 350,
          status: 'Active'
        });
      }

      // 3. Create Consignments
      const sampleCargo = [
        {
          cargoDescription: 'Heavy Machinery Gearboxes',
          shipperId: 'GearTech Industries',
          cargoCategory: 'AUTOMOTIVE',
          packageCount: 2,
          length: 2.0,
          width: 1.5,
          height: 1.5,
          volume: 9.0,
          weight: 650,
          fragile: false,
          stackable: true,
          fromStop: 'Chennai',
          toStop: 'Bangalore',
          routeId: 'CHN-BLR-EXP'
        },
        {
          cargoDescription: 'Precision Electronic Systems',
          shipperId: 'Silicon Systems Ltd',
          cargoCategory: 'ELECTRONICS',
          packageCount: 3,
          length: 3.0,
          width: 2.0,
          height: 1.5,
          volume: 18.0,
          weight: 3000,
          fragile: false,
          stackable: true,
          fromStop: 'Chennai',
          toStop: 'Hosur',
          routeId: 'CHN-BLR-EXP'
        },
        {
          cargoDescription: 'Textile Fabric Rolls',
          shipperId: 'Silk Mills Corp',
          cargoCategory: 'TEXTILES',
          packageCount: 2,
          length: 2.0,
          width: 2.0,
          height: 1.5,
          volume: 12.0,
          weight: 5000,
          fragile: false,
          stackable: true,
          fromStop: 'Chennai',
          toStop: 'Vellore',
          routeId: 'CHN-BLR-EXP'
        }
      ];

      for (const item of sampleCargo) {
        await api.post('/bookings', {
          ...item,
          vehicleId: 'UNASSIGNED',
          date: new Date(),
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          invoiceValue: 80000,
          status: 'PENDING'
        });
      }

      // 4. Create Trip
      const tRes = await api.post('/trips', {
        vehicleId: vehicle.vehicleId,
        routeId: 'CHN-BLR-EXP',
        plannedDeparture: new Date()
      });
      const createdTrip = tRes.data.trip || tRes.data;

      // 5. Run Optimizer Preview & Lock Plan
      const optRes = await api.post(`/trips/${createdTrip.tripId}/optimize/preview`, {});
      const optPlan = optRes.data.optimizationResult || optRes.data.loadPlan || optRes.data;

      await api.post(`/trips/${createdTrip.tripId}/load-plan/approve`, {
        loadPlanId: optPlan.loadPlanId,
        expectedVersion: 1,
        assignments: optPlan.assignments
      });

      // 6. Dispatch Trip
      await api.post(`/trips/${createdTrip.tripId}/dispatch`, {});

      setActionMessage(`Active corridor trip ${createdTrip.tripId} launched with 3 loaded consignments (39 m³ / 8,650 kg).`);
      await fetchTrips();
      setSelectedTripId(createdTrip.tripId);
      await loadTripDetail(createdTrip.tripId);
    } catch (err) {
      console.error('Seed active trip error:', err);
      setError(err.response?.data?.message || 'Failed to launch demo trip.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-emerald-600" />
            Live Multi-Stop Trip Execution &amp; Re-Optimization
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative live cargo manifest, stop-by-stop QR verification, dynamic 3D trailer state, and downstream space re-allocation.
          </p>
        </div>

        {/* Trip Selector or Refresh */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchTrips}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition shadow-xs cursor-pointer"
            title="Refresh Trips"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {trips.length > 0 && (
            <select
              value={selectedTripId}
              onChange={handleTripChange}
              className="px-3 py-2.5 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none bg-white min-w-[280px] shadow-xs font-mono"
            >
              {trips.map((t) => (
                <option key={t.tripId} value={t.tripId}>
                  {t.tripId} — Truck: {t.vehicleId} ({t.status})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-xs font-bold">{actionMessage}</p>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer border-none bg-transparent"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-xs font-semibold">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-bold text-red-800 hover:text-red-950 cursor-pointer border-none bg-transparent"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
            <div className="h-5 bg-gray-200 rounded w-1/4" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-8 h-64" />
        </div>
      )}

      {/* Empty State when no trips */}
      {!loading && trips.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <Compass className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Active Multi-Stop Trips</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Live multi-stop operations tracks locked trailer cargo in real time across the transit corridor.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/manager/trips"
              className="no-underline w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Calendar className="w-4 h-4" />
              <span>Schedule New Trip</span>
            </Link>

            <button
              type="button"
              disabled={seeding}
              onClick={handleQuickSeedActiveTrip}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              {seeding ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                  <span>Launching Live Trip...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Launch Dispatched Demo Trip</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Live Execution View */}
      {!loading && tripDetail && (
        <div className="space-y-6">
          {/* Trip Status & Operation Controls Banner */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black text-gray-900">
                  {tripDetail.tripId}
                </span>
                <span className={`px-2.5 py-0.5 rounded text-[10px] font-black uppercase ${
                  tripDetail.status === 'IN_TRANSIT'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : tripDetail.status === 'READY_FOR_DISPATCH'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-blue-100 text-blue-800'
                }`}>
                  {tripDetail.status}
                </span>
                {tripDetail.latestPlan?.isImmutable && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Locked Plan v{tripDetail.latestPlan.version || 1}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 font-semibold">
                Vehicle: <strong className="text-gray-900">{tripDetail.vehicleId}</strong> ({tripDetail.effectiveVehicle?.dimensions?.length || 13.6}m × {tripDetail.effectiveVehicle?.dimensions?.width || 2.45}m × {tripDetail.effectiveVehicle?.dimensions?.height || 2.8}m, {tripDetail.effectiveVehicle?.capacityVolume || 93.3} m³) • Route: <strong className="text-gray-900">{tripDetail.routeId}</strong>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3">
              {['PLANNED', 'READY_FOR_DISPATCH'].includes(tripDetail.status) && (
                <button
                  onClick={handleDispatchTrip}
                  disabled={detailLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none"
                >
                  <Play className="w-4 h-4" />
                  <span>Dispatch Truck &amp; Start Transit</span>
                </button>
              )}

              {['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(tripDetail.status) && (() => {
                const nextPending =
                  tripDetail.stopsList?.find((s, idx) => idx > 0 && s.verificationStatus !== 'COMPLETED') ||
                  tripDetail.stopsList?.[(tripDetail.currentStopIndex || 0) + 1];
                const nextStopName =
                  nextPending?.location ||
                  nextPending?.locationName ||
                  tripDetail.stops?.[(tripDetail.currentStopIndex || 0) + 1] ||
                  'Next City';

                return (
                  <>
                    {nextPending && (
                      <button
                        onClick={() => handleVerifyStopArrival(null, undefined)}
                        disabled={detailLoading}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Simulate QR Scan: Arrive at {nextStopName}</span>
                      </button>
                    )}

                    <button
                      onClick={handlePreviewReoptimization}
                      disabled={reoptimizing}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none"
                    >
                      {reoptimizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      <span>Re-Optimize Remaining Route</span>
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Route Step Tracker */}
          <RouteStepTracker
            stops={tripDetail.stops || ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore']}
            stopsList={tripDetail.stopsList || []}
            currentStopIndex={tripDetail.currentStopIndex || 0}
            tripStatus={tripDetail.status}
            onVerifyStop={handleVerifyStopArrival}
          />

          {/* ── AUTHORITATIVE LIVE CARGO MANIFEST PANEL ── */}
          {(() => {
            const allAssignments = tripDetail.assignments || [];
            const currentCity = tripDetail.stops?.[tripDetail.currentStopIndex || 0] || '';
            const currentStopIdx = tripDetail.currentStopIndex || 0;

            const onTruckCargo = allAssignments.filter(a => a.status !== 'DELIVERED' && a.liveStatus !== 'DELIVERED');
            const unloadsAtCurrent = allAssignments.filter(a => (a.deliveryStop || a.delivery) === currentCity && a.status !== 'DELIVERED');
            const deliveredCargo = allAssignments.filter(a => a.status === 'DELIVERED' || a.liveStatus === 'DELIVERED');

            const totalLoadedVol = onTruckCargo.reduce((s, a) => s + (Number(a.volume) || 0), 0);
            const totalLoadedWt = onTruckCargo.reduce((s, a) => s + (Number(a.weight) || 0), 0);

            return (
              <div className="space-y-4">
                {/* Live Manifest Header KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CARGO ON TRUCK</span>
                    <span className="text-xl font-black text-gray-900 mt-0.5 block">{onTruckCargo.length} Consignments</span>
                    <span className="text-[10px] text-emerald-600 font-semibold">{deliveredCargo.length} delivered so far</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CURRENT LOADED VOLUME</span>
                    <span className="text-xl font-black text-emerald-600 mt-0.5 block">{totalLoadedVol.toFixed(1)} m³</span>
                    <span className="text-[10px] text-gray-500 font-semibold">Max: {tripDetail.effectiveVehicle?.capacityVolume || 93.3} m³</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CURRENT LOADED WEIGHT</span>
                    <span className="text-xl font-black text-gray-900 mt-0.5 block">{totalLoadedWt.toLocaleString()} kg</span>
                    <span className="text-[10px] text-gray-500 font-semibold">Max GVWR: {tripDetail.effectiveVehicle?.capacityWeight?.toLocaleString() || '20,000'} kg</span>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">CURRENT STOP &amp; UNLOADS</span>
                    <span className="text-xl font-black text-amber-600 mt-0.5 block">{currentCity || 'Chennai'}</span>
                    <span className="text-[10px] text-amber-700 font-bold">{unloadsAtCurrent.length} package(s) eligible to unload</span>
                  </div>
                </div>

                {/* Detailed Manifest Table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-xs font-black uppercase tracking-wider">
                        Authoritative Live Cargo Manifest ({allAssignments.length} Locked Packages)
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 font-mono">
                      Current Stop #{currentStopIdx + 1}: {currentCity}
                    </span>
                  </div>

                  {allAssignments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-gray-200 text-[10px] font-black uppercase text-gray-500 tracking-wider">
                          <tr>
                            <th className="py-2.5 px-4">Consignment ID</th>
                            <th className="py-2.5 px-4">Description</th>
                            <th className="py-2.5 px-4">Route Segment</th>
                            <th className="py-2.5 px-4">Delivery Hub</th>
                            <th className="py-2.5 px-4">Dimensions &amp; Vol</th>
                            <th className="py-2.5 px-4">Weight</th>
                            <th className="py-2.5 px-4">3D Position</th>
                            <th className="py-2.5 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                          {allAssignments.map((a, i) => {
                            const isDelivered = a.status === 'DELIVERED' || a.liveStatus === 'DELIVERED';
                            const isReadyUnload = (a.deliveryStop || a.delivery) === currentCity && !isDelivered;

                            return (
                              <tr key={a.shipmentId || i} className={`hover:bg-slate-50/80 transition ${isDelivered ? 'opacity-50 bg-gray-50' : ''}`}>
                                <td className="py-3 px-4 font-mono font-bold text-gray-900 flex items-center gap-1.5">
                                  <span className={`w-2 h-2 rounded-full ${isDelivered ? 'bg-gray-400' : isReadyUnload ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                  {a.shipmentId}
                                </td>
                                <td className="py-3 px-4 font-semibold text-gray-800">
                                  {a.cargoDescription || 'General Cargo'}
                                  {a.fragile && (
                                    <span className="ml-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-800">FRAGILE</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-gray-600 font-mono text-[11px]">
                                  {a.pickupStop || 'Chennai'} → {a.deliveryStop || 'Bangalore'}
                                </td>
                                <td className="py-3 px-4 font-bold text-gray-900">
                                  {a.deliveryStop || 'Bangalore'}
                                </td>
                                <td className="py-3 px-4 font-mono text-gray-600 text-[11px]">
                                  {a.length || a.dx || 1.2}m × {a.width || a.dy || 1.0}m × {a.height || a.dz || 1.2}m ({a.volume} m³)
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-gray-900">
                                  {a.weight ? a.weight.toLocaleString() : 0} kg
                                </td>
                                <td className="py-3 px-4 font-mono text-[10px] text-slate-500">
                                  X:{(a.x ?? a.position?.x ?? 0).toFixed(1)}m, Y:{(a.y ?? a.position?.y ?? 0).toFixed(1)}m, Z:{(a.z ?? a.position?.z ?? 0).toFixed(1)}m
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {isDelivered ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-gray-100 text-gray-700">
                                      <CheckCircle className="w-3 h-3 text-gray-500" /> DELIVERED
                                    </span>
                                  ) : isReadyUnload ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                      <PackageCheck className="w-3 h-3 text-amber-600" /> READY FOR UNLOAD
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <Truck className="w-3 h-3 text-emerald-600" /> ON TRUCK
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-500">
                      <p>No consignments allocated to this trip.</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Full Authoritative Operational Load Visualizer */}
          {(() => {
            const currentAssignments = tripDetail.assignments || [];
            const onTruckOnly = currentAssignments.filter(a => a.status !== 'DELIVERED' && a.liveStatus !== 'DELIVERED');

            const authTruck = tripDetail.effectiveVehicle || tripDetail.vehicle || {};
            const dims = authTruck.dimensions || {
              length: Number(authTruck.interiorLength || 13.6),
              width: Number(authTruck.interiorWidth || 2.45),
              height: Number(authTruck.interiorHeight || 2.8)
            };
            const truckLength = Number(dims.length || 13.6);
            const truckWidth = Number(dims.width || 2.45);
            const truckHeight = Number(dims.height || 2.8);
            const truckVol = Number(authTruck.capacityVolume || parseFloat((truckLength * truckWidth * truckHeight).toFixed(2)));
            const truckWt = Number(authTruck.capacityWeight || 20000);

            return (
              <OperationalLoadVisualizer
                tripId={tripDetail.tripId}
                vehicleId={tripDetail.vehicleId}
                truckSpecs={{
                  capacityVolume: truckVol,
                  capacityWeight: truckWt,
                  dimensions: { length: truckLength, width: truckWidth, height: truckHeight }
                }}
                route={{
                  routeId: tripDetail.routeId,
                  stops: tripDetail.stops || ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore']
                }}
                currentStopIndex={tripDetail.currentStopIndex || 0}
                assignments={onTruckOnly}
                isLocked={true}
                loadPlanStatus={tripDetail.latestPlan?.status || 'LOCKED'}
              />
            );
          })()}

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
                    disabled={detailLoading}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition border-none cursor-pointer"
                  >
                    Apply &amp; Supersede Old Plan
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
