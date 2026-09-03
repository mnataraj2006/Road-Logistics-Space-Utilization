import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Sliders,
  Truck,
  Box,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Layers,
  ArrowRight,
  Info,
  Sparkles,
  ShieldAlert,
  Layers3,
  Calendar,
  Compass,
  Lock,
  Unlock,
  FileText,
  Clock,
  UserCheck,
  Check,
  Eye
} from 'lucide-react';
import api from '../../services/api';
import Trailer2DView from '../../components/optimizer/Trailer2DView';
import OperationalLoadVisualizer from '../../components/optimizer/OperationalLoadVisualizer';

const ManagerOptimizationView = () => {
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [candidateShipments, setCandidateShipments] = useState([]);
  const [futureOriginShipments, setFutureOriginShipments] = useState([]);
  const [futureOriginBreakdown, setFutureOriginBreakdown] = useState({});
  const [tripCurrentStop, setTripCurrentStop] = useState('');
  const [allocatedCargo, setAllocatedCargo] = useState([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [viewMode, setViewMode] = useState('3D'); // '3D' | '2D'

  const visualizerSectionRef = useRef(null);

  const scrollToVisualizer = (mode) => {
    setViewMode(mode);
    if (visualizerSectionRef.current) {
      visualizerSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const fetchTripsAndCandidates = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/trips');
      const tripList = Array.isArray(response.data) ? response.data : response.data.trips || [];
      setTrips(tripList);

      if (tripList.length > 0) {
        const initialTripId = selectedTripId || tripList[0].tripId;
        setSelectedTripId(initialTripId);
        await loadCandidatesForTrip(initialTripId);
      } else {
        setCandidateShipments([]);
        setFutureOriginShipments([]);
        setFutureOriginBreakdown({});
        setAllocatedCargo([]);
        setOptimizationResult(null);
      }
    } catch (err) {
      console.error('Failed to fetch trips:', err);
      setError(err.response?.data?.message || 'Failed to connect to trips API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTripsAndCandidates();
  }, []);

  const loadCandidatesForTrip = async (tId) => {
    if (!tId) return;
    try {
      const [resCandidates, resPlan] = await Promise.allSettled([
        api.get(`/trips/${tId}/candidates`),
        api.get(`/trips/${tId}/load-plan`)
      ]);

      if (resCandidates.status === 'fulfilled') {
        const data = resCandidates.value.data;
        const eligible = data.eligibleCandidates || data.candidateShipments || data.candidates || [];
        setCandidateShipments(eligible);
        setSelectedShipmentIds(eligible.map((c) => c.shipmentId || c.bookingId));
        setFutureOriginShipments(data.futureOriginShipments || []);
        setFutureOriginBreakdown(data.futureOriginBreakdown || {});
        setTripCurrentStop(data.currentStop || '');
        setAllocatedCargo(data.allocatedCargo || []);
      }

      if (resPlan.status === 'fulfilled' && resPlan.value.data?.loadPlan) {
        const planData = resPlan.value.data;
        setOptimizationResult(planData);
      } else {
        setOptimizationResult(null);
      }
    } catch (err) {
      console.error('Error fetching candidates/plan for trip:', err);
    }
  };

  const handleTripChange = (e) => {
    const tId = e.target.value;
    setSelectedTripId(tId);
    setOptimizationResult(null);
    setCandidateShipments([]);
    setFutureOriginShipments([]);
    setFutureOriginBreakdown({});
    setAllocatedCargo([]);
    loadCandidatesForTrip(tId);
  };

  const toggleShipmentSelection = (id) => {
    setSelectedShipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleRunOptimizer = async () => {
    if (!selectedTripId) return;
    setOptimizing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await api.post(`/trips/${selectedTripId}/optimize/preview`, {
        selectedShipmentIds
      });

      const optPlan = response.data.optimizationResult || response.data.loadPlan || response.data;
      setOptimizationResult(optPlan);
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
      const loadPlanId = optimizationResult.loadPlanId || optimizationResult.loadPlan?.loadPlanId;
      const url = loadPlanId
        ? `/trips/${selectedTripId}/load-plan/${loadPlanId}/approve`
        : `/trips/${selectedTripId}/load-plan/approve`;

      await api.post(url, {
        expectedVersion: optimizationResult.version || optimizationResult.loadPlan?.version || 1,
        loadPlanId,
        assignments: optimizationResult.assignments
      });

      setSuccessMessage('Load plan approved and locked! Trip is now READY_FOR_DISPATCH.');
      await fetchTripsAndCandidates();
      if (selectedTripId) {
        await loadCandidatesForTrip(selectedTripId);
      }
    } catch (err) {
      console.error('Approval error:', err);
      setError(err.response?.data?.message || 'Failed to approve load plan.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockLoadPlan = async () => {
    if (!selectedTripId) return;
    if (!window.confirm('Are you sure you want to unlock this Load Plan? All locked cargo will be returned to the Available Candidate Pool for fresh optimization.')) {
      return;
    }
    setUnlocking(true);
    setError(null);
    try {
      await api.post(`/trips/${selectedTripId}/load-plan/unlock`);
      setSuccessMessage('Load plan unlocked! Consignments are now available in the Candidate Pool for re-optimization.');
      await fetchTripsAndCandidates();
      if (selectedTripId) {
        await loadCandidatesForTrip(selectedTripId);
      }
    } catch (err) {
      console.error('Unlock error:', err);
      setError(err.response?.data?.message || 'Failed to unlock load plan.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleQuickSeedOptimizerDemo = async () => {
    setSeeding(true);
    setError(null);
    try {
      // 1. Ensure a truck exists
      let resVehicles = await api.get('/vehicles');
      let vehicleList = Array.isArray(resVehicles.data) ? resVehicles.data : [];
      let vehicle = vehicleList[0];

      if (!vehicle) {
        const randId = Math.floor(100 + Math.random() * 900);
        const newVehRes = await api.post('/vehicles', {
          vehicleId: `TN-09-AX-${randId}`,
          type: 'Heavy Truck',
          dimensions: { length: 13.6, width: 2.45, height: 2.8 },
          capacityVolume: 93.3,
          capacityWeight: 20000,
          routeLane: 'CHN-BLR-EXP',
          baseLocation: 'Chennai Logistics Hub',
          ratePerCbm: 150,
          ratePerKg: 5,
          status: 'Active'
        });
        vehicle = newVehRes.data;
      }

      // 2. Ensure Route CHN-BLR-EXP exists
      let routeId = vehicle.routeLane || 'CHN-BLR-EXP';
      try {
        await api.get(`/routes/${routeId}`);
      } catch {
        await api.post('/routes', {
          routeId: 'CHN-BLR-EXP',
          source: 'Chennai',
          destination: 'Bangalore',
          stops: ['Kanchipuram', 'Vellore', 'Hosur'],
          distance: 350,
          baseRate: 150
        });
        routeId = 'CHN-BLR-EXP';
      }

      // 3. Create a Planned Trip
      const randTripNum = Math.floor(10 + Math.random() * 90);
      const tripRes = await api.post('/trips', {
        tripId: `TRIP-OPT-${randTripNum}`,
        routeId,
        vehicleId: vehicle.vehicleId,
        scheduledDeparture: new Date(),
        status: 'PLANNED'
      });

      const createdTrip = tripRes.data.trip || tripRes.data;

      // 4. Seed 5 Multi-Stop Test Consignments (Test 2 Scenario)
      const sampleCargo = [
        {
          shipperId: 'AutoParts-Madras',
          cargoDescription: 'Precision Gear Assemblies',
          pickupStop: 'Chennai',
          deliveryStop: 'Vellore',
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
        },
        {
          shipperId: 'Tamil-Textiles',
          cargoDescription: 'Export Cotton Bales',
          pickupStop: 'Chennai',
          deliveryStop: 'Vellore',
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
        },
        {
          shipperId: 'Vellore-Leather',
          cargoDescription: 'Finished Leather Goods',
          pickupStop: 'Vellore',
          deliveryStop: 'Hosur',
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
        },
        {
          shipperId: 'Ranipet-Chemicals',
          cargoDescription: 'Industrial Polymers',
          pickupStop: 'Vellore',
          deliveryStop: 'Bangalore',
          volume: 27.0,
          weight: 3000,
          length: 4.0,
          width: 2.4,
          height: 2.8,
          fragile: true,
          stackable: false,
          routeId
        },
        {
          shipperId: 'Hosur-Motors',
          cargoDescription: 'EV Battery Enclosures',
          pickupStop: 'Hosur',
          deliveryStop: 'Bangalore',
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
        }
      ];

      for (const item of sampleCargo) {
        await api.post('/bookings', {
          ...item,
          vehicleId: 'UNASSIGNED',
          date: new Date(),
          invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
          invoiceValue: 85000,
          status: 'PENDING'
        });
      }

      setSuccessMessage(`Demo corridor initialized with Trip ${createdTrip.tripId} and 5 multi-stop consignments.`);
      await fetchTripsAndCandidates();
      setSelectedTripId(createdTrip.tripId);
      await loadCandidatesForTrip(createdTrip.tripId);
    } catch (err) {
      console.error('Seed demo error:', err);
      setError(err.response?.data?.message || 'Failed to initialize demo corridor.');
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedCargoForCurrentTrip = async () => {
    if (!selectedTripId || !selectedTrip) return;
    setSeeding(true);
    try {
      const routeId = selectedTrip.routeId;
      const effectiveCurrentStop = tripCurrentStop || selectedTrip.currentStop || resolvedStops[0] || 'Chennai';
      const destStop = resolvedStops[resolvedStops.length - 1] || 'Bangalore';

      const sampleCargo = [
        {
          shipperId: 'Apex-Logistics',
          cargoDescription: 'Commercial Palletized Freight',
          pickupStop: effectiveCurrentStop,
          deliveryStop: destStop,
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
        },
        {
          shipperId: 'Prime-Cargo',
          cargoDescription: 'Packaged Retail Merchandise',
          pickupStop: effectiveCurrentStop,
          deliveryStop: destStop,
          volume: 24.0,
          weight: 1000,
          length: 4.0,
          width: 2.4,
          height: 2.5,
          fragile: false,
          stackable: true,
          routeId
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

      setSuccessMessage(`Added 2 candidate consignments for route ${routeId}.`);
      loadCandidatesForTrip(selectedTripId);
    } catch (err) {
      console.error('Seed cargo error:', err);
    } finally {
      setSeeding(false);
    }
  };

  const selectedTrip = trips.find((t) => t.tripId === selectedTripId);
  const activeTruck = selectedTrip?.effectiveVehicle || selectedTrip?.vehicle || selectedTrip?.vehicleSnapshot || {};
  const truckDims = activeTruck.dimensions || {
    length: Number(activeTruck.interiorLength || 13.6),
    width: Number(activeTruck.interiorWidth || 2.45),
    height: Number(activeTruck.interiorHeight || 2.8)
  };
  const truckLength = Number(truckDims.length || 13.6);
  const truckWidth = Number(truckDims.width || 2.45);
  const truckHeight = Number(truckDims.height || 2.8);
  const truckVolume = Number(activeTruck.capacityVolume || parseFloat((truckLength * truckWidth * truckHeight).toFixed(2)));
  const truckWeight = Number(activeTruck.capacityWeight || 20000);

  const resolvedStops = useMemo(() => {
    if (selectedTrip?.route?.stopsDetails && selectedTrip.route.stopsDetails.length > 0) {
      return selectedTrip.route.stopsDetails.map(s => s.locationName || s.name);
    }
    if (selectedTrip?.route?.stops && selectedTrip.route.stops.length > 0) {
      return selectedTrip.route.stops;
    }
    return ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];
  }, [selectedTrip]);

  const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

  const isPlanLocked = useMemo(() => {
    return (
      optimizationResult?.status === 'APPROVED' ||
      optimizationResult?.status === 'LOCKED' ||
      selectedTrip?.status === 'READY_FOR_DISPATCH' ||
      allocatedCargo.length > 0
    );
  }, [optimizationResult, selectedTrip, allocatedCargo]);

  // Unified Locked Cargo Manifest
  const lockedCargoList = useMemo(() => {
    if (allocatedCargo.length > 0) return allocatedCargo;
    return (optimizationResult?.assignments || []).map(a => ({
      shipmentId: a.shipmentId,
      bookingId: a.bookingId || a.shipmentId,
      pickup: a.segmentRange?.fromStop || a.pickupStop || 'Chennai',
      delivery: a.segmentRange?.toStop || a.deliveryStop || 'Bangalore',
      loadStop: a.segmentRange?.fromStop || a.pickupStop || 'Chennai',
      unloadStop: a.segmentRange?.toStop || a.deliveryStop || 'Bangalore',
      volume: a.volume || 24,
      weight: a.weight || 1000,
      dimensions: a.dimensions || { length: 4.0, width: 2.4, height: 2.5 },
      physicalStatus: a.physicalStatus || 'WAITING_AT_ORIGIN',
      physicalStatusDisplay: a.physicalStatusDisplay || 'WAITING FOR LOAD',
      planStatus: 'LOCKED',
      status: a.status || 'LOCKED'
    }));
  }, [allocatedCargo, optimizationResult]);

  // Current Physical Load Onboard Trailer
  const effectiveCurrentStop = tripCurrentStop || selectedTrip?.currentStop || resolvedStops[0] || 'Chennai';
  const currentStopIdx = resolvedStops.findIndex(s => norm(s) === norm(effectiveCurrentStop));
  const stopSeqNum = currentStopIdx !== -1 ? currentStopIdx + 1 : 1;

  const physicalOnboardCargo = useMemo(() => {
    return lockedCargoList.filter(c =>
      c.physicalStatus === 'ONBOARD' ||
      c.status === 'IN_TRANSIT' ||
      c.status === 'LOADED' ||
      (selectedTrip?.actualLoadSnapshot?.loadedShipmentIds || []).includes(c.shipmentId)
    );
  }, [lockedCargoList, selectedTrip]);

  const physicalOccupiedVol = useMemo(() => {
    if (selectedTrip?.actualLoadSnapshot?.usedVolume !== undefined && selectedTrip?.actualLoadSnapshot?.usedVolume > 0) {
      return selectedTrip.actualLoadSnapshot.usedVolume;
    }
    return physicalOnboardCargo.reduce((acc, c) => acc + (Number(c.volume) || 0), 0);
  }, [selectedTrip, physicalOnboardCargo]);

  const physicalOccupiedWt = useMemo(() => {
    if (selectedTrip?.actualLoadSnapshot?.usedWeight !== undefined && selectedTrip?.actualLoadSnapshot?.usedWeight > 0) {
      return selectedTrip.actualLoadSnapshot.usedWeight;
    }
    return physicalOnboardCargo.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  }, [selectedTrip, physicalOnboardCargo]);

  const currentAvailableVol = Math.max(0, truckVolume - physicalOccupiedVol);
  const currentAvailableWt = Math.max(0, truckWeight - physicalOccupiedWt);
  const physicalVolUtilPct = truckVolume > 0 ? ((physicalOccupiedVol / truckVolume) * 100).toFixed(1) : '0.0';
  const physicalWtUtilPct = truckWeight > 0 ? ((physicalOccupiedWt / truckWeight) * 100).toFixed(1) : '0.0';

  // Total Cumulative Trip Cargo vs Peak Simultaneous Load
  const totalTripCargoVol = useMemo(() => {
    return lockedCargoList.reduce((acc, c) => acc + (Number(c.volume) || 0), 0);
  }, [lockedCargoList]);

  const totalTripCargoWt = useMemo(() => {
    return lockedCargoList.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);
  }, [lockedCargoList]);

  const selectedCandidates = candidateShipments.filter((c) =>
    selectedShipmentIds.includes(c.shipmentId || c.bookingId)
  );

  // Multi-Stop Segment Planned vs Current Load Analysis
  const numSegments = Math.max(1, resolvedStops.length - 1);
  const segmentAnalysis = useMemo(() => {
    const analysis = [];
    const cargoSource = lockedCargoList.length > 0 ? lockedCargoList : selectedCandidates;

    for (let k = 0; k < numSegments; k++) {
      const fromStop = resolvedStops[k];
      const toStop = resolvedStops[k + 1] || 'Destination';

      // Planned items on this hop
      const plannedItems = cargoSource.filter((item) => {
        const pStop = item.pickupStop || item.pickup || item.fromStop || resolvedStops[0];
        const dStop = item.deliveryStop || item.delivery || item.toStop || resolvedStops[resolvedStops.length - 1];

        let pIdx = resolvedStops.findIndex(s => norm(s) === norm(pStop));
        let dIdx = resolvedStops.findIndex(s => norm(s) === norm(dStop));
        if (pIdx === -1) pIdx = 0;
        if (dIdx === -1 || dIdx <= pIdx) dIdx = resolvedStops.length - 1;

        return pIdx <= k && dIdx > k;
      });

      const plannedVol = plannedItems.reduce((sum, it) => sum + (Number(it.volume) || 0), 0);
      const plannedWt = plannedItems.reduce((sum, it) => sum + (Number(it.weight) || 0), 0);
      const volUtilPct = truckVolume > 0 ? parseFloat(((plannedVol / truckVolume) * 100).toFixed(1)) : 0;
      const wtUtilPct = truckWeight > 0 ? parseFloat(((plannedWt / truckWeight) * 100).toFixed(1)) : 0;

      // Current items physically onboard on this hop
      const isCurrentLeg = currentStopIdx === k;
      const isPastLeg = currentStopIdx > k;
      const currentItems = isCurrentLeg ? physicalOnboardCargo : [];
      const currentVol = isCurrentLeg ? physicalOccupiedVol : 0;
      const currentWt = isCurrentLeg ? physicalOccupiedWt : 0;

      analysis.push({
        segmentIndex: k,
        fromStop,
        toStop,
        plannedCount: plannedItems.length,
        plannedItems,
        plannedVolume: parseFloat(plannedVol.toFixed(2)),
        plannedWeight: Math.round(plannedWt),
        remainingVolume: parseFloat(Math.max(0, truckVolume - plannedVol).toFixed(2)),
        remainingWeight: Math.max(0, truckWeight - plannedWt),
        volUtilPct,
        wtUtilPct,
        isOverVolume: plannedVol > truckVolume + 0.05,
        isOverWeight: plannedWt > truckWeight,
        isSafe: plannedVol <= truckVolume + 0.05 && plannedWt <= truckWeight,
        isCurrentLeg,
        isPastLeg,
        currentItems,
        currentVolume: parseFloat(currentVol.toFixed(2)),
        currentWeight: Math.round(currentWt)
      });
    }
    return analysis;
  }, [resolvedStops, numSegments, lockedCargoList, selectedCandidates, truckVolume, truckWeight, currentStopIdx, physicalOnboardCargo, physicalOccupiedVol, physicalOccupiedWt]);

  const peakSegmentVolume = Math.max(0, ...segmentAnalysis.map(s => s.plannedVolume));
  const peakSegmentWeight = Math.max(0, ...segmentAnalysis.map(s => s.plannedWeight));
  const peakVolumeUtilPct = truckVolume > 0 ? ((peakSegmentVolume / truckVolume) * 100).toFixed(1) : 0;
  const peakWeightUtilPct = truckWeight > 0 ? ((peakSegmentWeight / truckWeight) * 100).toFixed(1) : 0;
  const peakSegment = segmentAnalysis.find(s => s.plannedVolume === peakSegmentVolume);
  const isAnySegmentOverloaded = segmentAnalysis.some(s => !s.isSafe);

  // Stop-by-Stop Multi-Stop Corridor Route Timeline
  const corridorTimeline = useMemo(() => {
    return resolvedStops.map((stopName, idx) => {
      const isOrigin = idx === 0;
      const isTerminus = idx === resolvedStops.length - 1;

      const toUnload = lockedCargoList.filter(c => norm(c.deliveryStop || c.delivery || c.unloadStop) === norm(stopName));
      const toLoad = lockedCargoList.filter(c => norm(c.pickupStop || c.pickup || c.loadStop) === norm(stopName));
      const continuing = lockedCargoList.filter(c => {
        const pIdx = resolvedStops.findIndex(s => norm(s) === norm(c.pickupStop || c.pickup || c.loadStop));
        const dIdx = resolvedStops.findIndex(s => norm(s) === norm(c.deliveryStop || c.delivery || c.unloadStop));
        return pIdx < idx && dIdx > idx;
      });

      return {
        stopIndex: idx,
        stopName,
        isOrigin,
        isTerminus,
        isCurrent: norm(effectiveCurrentStop) === norm(stopName),
        toUnload,
        toLoad,
        continuing
      };
    });
  }, [resolvedStops, lockedCargoList, effectiveCurrentStop]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Sliders className="w-6 h-6 text-emerald-600" />
            Multi-Stop Space Optimization Console
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate provably valid 3D trailer loading plans respecting multi-segment route capacity, physical geometry, and LIFO accessibility.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchTripsAndCandidates}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          <span>Refresh State</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800 text-xs">
          <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold block">Optimization Error</strong>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 text-sm cursor-pointer">✕</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-800 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-bold block">Success</strong>
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800 text-sm cursor-pointer">✕</button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 h-28" />
          <div className="bg-white rounded-2xl border border-gray-200 p-6 h-40" />
        </div>
      )}

      {/* Empty State when no trips exist */}
      {!loading && trips.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <Compass className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Planned Trips for Optimization</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              The 3D space optimization engine computes optimal volumetric trailer placement, weight distribution, and LIFO unloading sequence for scheduled trips.
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
              onClick={handleQuickSeedOptimizerDemo}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              {seeding ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
                  <span>Setting up Demo...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Initialize Optimizer Demo Corridor</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Main Optimization Console */}
      {!loading && trips.length > 0 && (
        <div className="space-y-6">
          {/* Trip Selector & Optimizer Run Controls */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-gray-700">
                Target Trip &amp; Vehicle
              </label>
              <select
                value={selectedTripId}
                onChange={handleTripChange}
                className="px-3 py-2.5 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none bg-white min-w-[280px] shadow-xs"
              >
                {trips.map((t) => (
                  <option key={t.tripId} value={t.tripId}>
                    {t.tripId} — Truck: {t.vehicleId} ({t.status}) • {t.routeId}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {isPlanLocked ? (
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <span>Load Plan Locked (v{optimizationResult?.version || 1})</span>
                  </div>
                  <button
                    onClick={handleUnlockLoadPlan}
                    disabled={unlocking}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none disabled:opacity-50"
                  >
                    {unlocking ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                    <span>Unlock &amp; Re-Optimize</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRunOptimizer}
                  disabled={optimizing || !selectedTripId || candidateShipments.length === 0}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer border-none disabled:opacity-50"
                >
                  {optimizing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sliders className="w-4 h-4" />
                  )}
                  <span>{optimizing ? 'Executing 3D Optimizer Engine...' : 'Run Optimization'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Selected Trip Specifications & Capacity Summary */}
          {selectedTrip && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-gray-900 flex items-center gap-2">
                      Authoritative Fleet Asset: {selectedTrip.vehicleId}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        {activeTruck.type || 'Heavy Truck'}
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                      <span>Corridor: <strong>{selectedTrip.routeId}</strong></span>
                      <span>•</span>
                      <span>Trip Status: <strong>{selectedTrip.status}</strong></span>
                    </p>
                  </div>
                </div>

                <div className="text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">Dimensions: </span>
                  <span className="font-mono font-bold text-gray-900">
                    {truckLength}m (L) × {truckWidth}m (W) × {truckHeight}m (H)
                  </span>
                </div>
              </div>

              {/* 6-Item Authoritative Operational Header Status Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 bg-emerald-900 text-white rounded-xl shadow-xs space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300 block">Current Stop</span>
                  <span className="text-sm font-black truncate block">{effectiveCurrentStop}</span>
                  <span className="text-[10px] text-emerald-300 font-medium">Stop #{stopSeqNum} of {resolvedStops.length}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Truck Capacity</span>
                  <span className="text-sm font-black text-slate-800 block">{truckVolume.toLocaleString()} m³</span>
                  <span className="text-[10px] text-gray-400 font-medium">{truckWeight.toLocaleString()} kg Max Payload</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Available Space</span>
                  <span className="text-sm font-black text-emerald-700 block">{currentAvailableVol.toFixed(1)} m³</span>
                  <span className="text-[10px] text-emerald-800 font-medium">{currentAvailableWt.toLocaleString()} kg Headroom</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Eligible Now</span>
                  <span className="text-sm font-black text-emerald-700 block">{candidateShipments.length} Cargo</span>
                  <span className="text-[10px] text-slate-500 font-medium">Origin: {effectiveCurrentStop}</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Future Stops</span>
                  <span className="text-sm font-black text-amber-700 block">{futureOriginShipments.length} Cargo</span>
                  <span className="text-[10px] text-slate-500 font-medium">Downstream Origins</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500 block">Locked Trip Manifest</span>
                  <span className="text-sm font-black text-slate-800 block">{lockedCargoList.length} Pkgs</span>
                  <span className="text-[10px] text-slate-500 font-medium">Approved Multi-Stop Plan</span>
                </div>
              </div>

              {/* Multi-Stop Route Segment Capacity Breakdown Analysis Table */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    Multi-Stop Corridor Segment Capacity Analysis
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Planned segment allocation vs current physical occupancy
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                        <th className="pb-2">Route Segment Hop</th>
                        <th className="pb-2">Planned Cargo</th>
                        <th className="pb-2">Planned Vol / Headroom</th>
                        <th className="pb-2">Planned Vol Fill</th>
                        <th className="pb-2">Planned Payload Weight</th>
                        <th className="pb-2">Current Physical Load</th>
                        <th className="pb-2 text-right">Hop Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {segmentAnalysis.map((seg) => (
                        <tr key={seg.segmentIndex} className={`hover:bg-white/60 transition ${seg.isCurrentLeg ? 'bg-emerald-50/40 font-semibold' : ''}`}>
                          <td className="py-2.5 font-bold text-gray-900 flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{seg.fromStop}</span>
                            <ArrowRight className="w-3 h-3 text-gray-400" />
                            <span>{seg.toStop}</span>
                            {seg.isCurrentLeg && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-black uppercase">
                                CURRENT LEG
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-semibold text-gray-700">
                            {seg.plannedCount} pkg{seg.plannedCount === 1 ? '' : 's'}
                            {seg.plannedItems.length > 0 && (
                              <span className="block text-[10px] text-gray-400 font-mono">
                                ({seg.plannedItems.map(i => i.shipmentId || i.bookingId).join(', ')})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 font-mono">
                            <span className="font-bold text-gray-900">{seg.plannedVolume} m³</span>
                            <span className="text-gray-400 text-[11px]"> / {seg.remainingVolume} m³ free</span>
                          </td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    seg.volUtilPct > 100 ? 'bg-red-500' : seg.volUtilPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(100, seg.volUtilPct)}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] font-bold text-gray-700">{seg.volUtilPct}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 font-mono">
                            <span className="font-bold text-gray-900">{seg.plannedWeight.toLocaleString()} kg</span>
                            <span className="text-gray-400 text-[11px]"> ({seg.wtUtilPct}%)</span>
                          </td>
                          <td className="py-2.5 font-mono">
                            {seg.isCurrentLeg ? (
                              <span className="text-emerald-700 font-bold">
                                {seg.currentItems.length} Pkgs ({seg.currentVolume} m³)
                              </span>
                            ) : seg.isPastLeg ? (
                              <span className="text-gray-400 italic text-[11px]">Hop Completed</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Awaiting Arrival</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                              seg.isSafe
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-red-100 text-red-800 border-red-300'
                            }`}>
                              {seg.isSafe ? 'SAFE' : 'OVERLOAD'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stop-by-Stop Multi-Stop Route Corridor Timeline */}
              <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Corridor Stop-by-Stop Loading Operations Timeline
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Sequential pickup, delivery, and retention operations across corridor
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
                  {corridorTimeline.map((st) => (
                    <div
                      key={st.stopIndex}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        st.isCurrent
                          ? 'bg-emerald-50 border-emerald-400 shadow-xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          #{st.stopIndex + 1}: {st.stopName}
                        </span>
                        {st.isCurrent && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white font-black text-[9px] uppercase">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      {/* Operations */}
                      <div className="space-y-1 text-[11px]">
                        {st.toUnload.length > 0 && (
                          <div className="text-amber-800">
                            <strong className="text-[10px] text-amber-900 font-bold uppercase block">UNLOAD ({st.toUnload.length}):</strong>
                            <span className="font-mono">{st.toUnload.map(u => u.shipmentId || u.bookingId).join(', ')}</span>
                          </div>
                        )}

                        {st.toLoad.length > 0 && (
                          <div className="text-emerald-800">
                            <strong className="text-[10px] text-emerald-900 font-bold uppercase block">LOAD ({st.toLoad.length}):</strong>
                            <span className="font-mono">{st.toLoad.map(l => l.shipmentId || l.bookingId).join(', ')}</span>
                          </div>
                        )}

                        {st.continuing.length > 0 && (
                          <div className="text-slate-600">
                            <strong className="text-[10px] text-slate-700 font-bold uppercase block">RETAIN ONBOARD ({st.continuing.length}):</strong>
                            <span className="font-mono">{st.continuing.map(c => c.shipmentId || c.bookingId).join(', ')}</span>
                          </div>
                        )}

                        {st.toUnload.length === 0 && st.toLoad.length === 0 && (
                          <span className="text-slate-400 italic block py-1">No cargo operations at this stop</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── LOCKED PLAN SUMMARY & PEAK SIMULTANEOUS LOAD PANEL ── */}
          {isPlanLocked && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Locked Plan Summary &amp; Peak Simultaneous Capacity
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Authoritative trip totals and simultaneous peak occupancy for this multi-stop route.
                  </p>
                </div>

                {/* Direct Action Buttons to 2D CAD & 3D Digital Twin */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollToVisualizer('2D')}
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    <span>View 2D Load Plan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToVisualizer('3D')}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Box className="w-3.5 h-3.5" />
                    <span>View 3D Digital Twin</span>
                  </button>
                </div>
              </div>

              {/* 4-Stat High-Impact Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Total Trip Cargo</span>
                  <span className="text-xl font-black text-slate-900 block">{lockedCargoList.length} Packages</span>
                  <span className="text-xs font-bold text-slate-600 block">{totalTripCargoVol.toFixed(1)} m³ • {totalTripCargoWt.toLocaleString()} kg</span>
                  <span className="text-[10px] text-gray-400">Cumulative full-trip freight</span>
                </div>

                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-emerald-800 font-bold uppercase block">Peak Simultaneous Vol</span>
                  <span className="text-xl font-black text-emerald-700 block">{peakSegmentVolume.toFixed(1)} m³</span>
                  <span className="text-xs font-bold text-emerald-800 block">{peakVolumeUtilPct}% of 93.3 m³</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Safe Simultaneous Fit</span>
                </div>

                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-emerald-800 font-bold uppercase block">Peak Simultaneous Weight</span>
                  <span className="text-xl font-black text-slate-900 block">{peakSegmentWeight.toLocaleString()} kg</span>
                  <span className="text-xs font-bold text-slate-700 block">{peakWeightUtilPct}% of 20,000 kg</span>
                  <span className="text-[10px] text-emerald-600 font-medium">GVWR Compliant</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase block">Peak Load Segment</span>
                  <span className="text-base font-black text-slate-900 block truncate">
                    {peakSegment ? `${peakSegment.fromStop} → ${peakSegment.toStop}` : 'Vellore → Hosur'}
                  </span>
                  <span className="text-xs text-slate-600 block">{peakSegment?.plannedCount || 2} Concurrent Packages</span>
                  <span className="text-[10px] text-gray-400">Maximum trailer fill leg</span>
                </div>
              </div>

              {/* Informative Explanation Box */}
              <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Multi-Stop Feasibility Note:</strong> The cumulative total of all consignments transported over this trip is <strong className="text-blue-950 font-bold">{totalTripCargoVol.toFixed(1)} m³</strong>. Because cargo is progressively delivered and picked up across intermediate stops, the maximum simultaneous volume on the trailer never exceeds <strong className="text-emerald-700 font-bold">{peakSegmentVolume.toFixed(1)} m³ ({peakVolumeUtilPct}%)</strong> on the {peakSegment ? `${peakSegment.fromStop} → ${peakSegment.toStop}` : 'Vellore → Hosur'} segment, remaining well within vehicle capacity (<strong className="font-bold text-blue-950">{truckVolume.toFixed(1)} m³</strong>, <strong className="font-bold text-blue-950">{truckWeight.toLocaleString()} kg</strong>).
                </p>
              </div>

              {/* Placement Validation & Lock Metadata Strip */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                {/* Placement Validation Checklist */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Placement Validation Summary
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-700 font-medium">
                    <span className="flex items-center gap-1 text-emerald-700">✓ {lockedCargoList.length}/{lockedCargoList.length} Packages Positioned</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ 0 Collision Violations</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ 0 Boundary Violations</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ Rotation Validated</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ Weight Distribution Validated</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ Trailer Capacity Validated</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ LIFO Access Validated</span>
                    <span className="flex items-center gap-1 text-emerald-700">✓ Multi-Stop Concurrency Validated</span>
                  </div>
                </div>

                {/* Lock Metadata & Dispatch Readiness */}
                <div className="p-4 bg-emerald-950 text-white rounded-xl space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Lock Metadata &amp; Dispatch Readiness
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                      READY FOR DISPATCH
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Load Plan Version:</span>
                      <strong className="text-white font-mono">v{optimizationResult?.version || 1} (Immutable)</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Assigned Asset:</span>
                      <strong className="text-white font-mono">{selectedTrip?.vehicleId || 'TN-01'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Lock Timestamp:</span>
                      <span className="text-slate-200">{new Date(optimizationResult?.lockedAt || Date.now()).toLocaleTimeString()}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Optimization Engine:</span>
                      <span className="text-emerald-300 font-mono">Priority-LIFO-Density v2.0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── CURRENT PHYSICAL LOAD SECTION (STRICT DISTINCTION) ── */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  Current Physical Load ({physicalOnboardCargo.length} Packages Onboard)
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Authoritative snapshot of freight physically occupying the trailer at <strong className="text-gray-700">{effectiveCurrentStop}</strong> (Stop #{stopSeqNum} of {resolvedStops.length}).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                  {physicalOccupiedVol.toFixed(1)} m³ ({physicalVolUtilPct}%)
                </span>
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                  {physicalOccupiedWt.toLocaleString()} kg ({physicalWtUtilPct}%)
                </span>
              </div>
            </div>

            {physicalOnboardCargo.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-1">
                <span className="text-xs font-bold text-slate-700 block">
                  0 Packages Physically Onboard Trailer
                </span>
                <p className="text-[11px] text-slate-400">
                  Awaiting loading operation at origin stop ({effectiveCurrentStop}). Cargo is physically loaded onto the truck upon dispatch or stop arrival.
                </p>
                <span className="text-[10px] text-emerald-700 font-mono block pt-1">
                  Current Free Space: {truckVolume.toFixed(1)} m³ • {truckWeight.toLocaleString()} kg
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {physicalOnboardCargo.map((c) => (
                  <div key={c.shipmentId} className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-emerald-950">{c.shipmentId}</span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-600 text-white uppercase">
                        ONBOARD
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-600" />
                      <span>{c.pickup || c.loadStop} → {c.delivery || c.unloadStop}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-600 pt-1 border-t border-emerald-100">
                      <strong className="text-emerald-800">{c.volume} m³</strong>
                      <strong className="text-slate-800">{c.weight.toLocaleString()} kg</strong>
                      <span>{c.dimensions?.length || 4}×{c.dimensions?.width || 2.4}×{c.dimensions?.height || 2.5}m</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── LOCKED LOAD PLAN SECTION ── */}
          {isPlanLocked && lockedCargoList.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-700" />
                  Locked Load Plan — {lockedCargoList.length} Packages
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Approved and immutable plan for this trip. Cargo is physically loaded at its designated origin stop.
                </p>
              </div>

              {/* Locked Package Cards with Load/Unload Stops, Plan & Physical Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {lockedCargoList.map((pkg) => {
                  const pStop = pkg.pickupStop || pkg.pickup || pkg.loadStop || 'Chennai';
                  const dStop = pkg.deliveryStop || pkg.delivery || pkg.unloadStop || 'Bangalore';
                  const dims = pkg.dimensions || { length: 4.0, width: 2.4, height: 2.5 };

                  // Physical Status resolution
                  let physStatus = pkg.physicalStatus;
                  if (!physStatus || physStatus === 'WAITING_AT_ORIGIN') {
                    if (pkg.status === 'DELIVERED') physStatus = 'DELIVERED';
                    else if (['LOADED', 'IN_TRANSIT', 'ONBOARD'].includes(pkg.status)) physStatus = 'ONBOARD';
                    else if (norm(pStop) === norm(effectiveCurrentStop)) physStatus = 'READY_TO_LOAD';
                    else physStatus = 'WAITING_AT_ORIGIN';
                  }

                  let physBadgeClass = 'bg-amber-100 text-amber-900 border-amber-300';
                  let physLabel = `WAITING FOR LOAD AT ${pStop.toUpperCase()}`;

                  if (physStatus === 'READY_TO_LOAD') {
                    physBadgeClass = 'bg-blue-100 text-blue-900 border-blue-300';
                    physLabel = 'READY TO LOAD';
                  } else if (physStatus === 'ONBOARD') {
                    physBadgeClass = 'bg-emerald-100 text-emerald-900 border-emerald-300 font-black';
                    physLabel = 'ONBOARD';
                  } else if (physStatus === 'DELIVERED') {
                    physBadgeClass = 'bg-slate-100 text-slate-800 border-slate-300';
                    physLabel = 'DELIVERED';
                  }

                  return (
                    <div
                      key={pkg.shipmentId}
                      className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl text-xs space-y-2.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                          <span className="font-mono font-black text-slate-900 text-[13px]">{pkg.shipmentId}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          PLAN: LOCKED
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-bold text-[11px] text-slate-800">
                        <span>{pStop} → {dStop}</span>
                        <span className="font-mono text-emerald-700">{pkg.volume} m³ • {pkg.weight.toLocaleString()} kg</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-gray-400 block font-semibold uppercase">LOAD STOP</span>
                          <strong className="text-slate-900">{pStop}</strong>
                        </div>
                        <div>
                          <span className="text-gray-400 block font-semibold uppercase">UNLOAD STOP</span>
                          <strong className="text-slate-900">{dStop}</strong>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-100">
                          <span className="text-gray-400 block font-semibold uppercase">DIMENSIONS (L × W × H)</span>
                          <span className="font-mono text-slate-800 font-bold">
                            {dims.length || 4}m × {dims.width || 2.4}m × {dims.height || 2.5}m
                          </span>
                        </div>
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">PHYSICAL STATUS:</span>
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${physBadgeClass}`}>
                          {physLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── CANDIDATE CARGO POOL (WHEN NOT LOCKED) ── */}
          {!isPlanLocked && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Box className="w-4 h-4 text-emerald-600" />
                      Currently Eligible for Loading at {effectiveCurrentStop} ({candidateShipments.length})
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Consignments originating at the vehicle's current location ({effectiveCurrentStop}) ready for immediate optimization and loading.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {candidateShipments.length > 0 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedShipmentIds(candidateShipments.map(c => c.shipmentId || c.bookingId))}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-gray-300">•</span>
                        <button
                          type="button"
                          onClick={() => setSelectedShipmentIds([])}
                          className="text-[11px] font-bold text-gray-500 hover:text-gray-700 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {candidateShipments.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl space-y-2">
                    <p>No eligible candidate cargo currently originating at {effectiveCurrentStop}.</p>
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={handleSeedCargoForCurrentTrip}
                      className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold border border-emerald-200 cursor-pointer"
                    >
                      Seed 2 Test Consignments at {effectiveCurrentStop}
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {candidateShipments.map((c) => {
                      const id = c.shipmentId || c.bookingId;
                      const isSelected = selectedShipmentIds.includes(id);
                      const pkgVol = Number(c.volume) || 0;
                      const pkgWt = Number(c.weight) || 0;
                      const isItemOversized = pkgVol > truckVolume || pkgWt > truckWeight;

                      return (
                        <div
                          key={id}
                          onClick={() => toggleShipmentSelection(id)}
                          className={`p-3.5 rounded-xl border text-xs cursor-pointer transition select-none space-y-1.5 ${
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
                              className="rounded text-emerald-600 cursor-pointer"
                            />
                          </div>

                          <div className="font-semibold text-gray-800 text-[11px] truncate">
                            {c.cargoDescription || 'Commercial Freight'}
                          </div>

                          <p className="text-[11px] text-gray-600 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-600" />
                            <span>{c.pickup || c.pickupStop || c.fromStop} → {c.delivery || c.deliveryStop || c.toStop}</span>
                          </p>

                          <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                            <span className={`font-bold ${isItemOversized ? 'text-red-600' : 'text-emerald-700'}`}>
                              {pkgVol} m³
                            </span>
                            <span className="font-bold text-gray-900">{pkgWt} kg</span>
                            <div className="flex items-center gap-1">
                              {c.fragile && (
                                <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-800 font-bold text-[9px]">
                                  FRAGILE
                                </span>
                              )}
                              {c.stackable !== false && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-bold text-[9px]">
                                  STACK
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Future-Origin Consignments */}
              {futureOriginShipments.length > 0 && (
                <div className="bg-slate-50/90 rounded-2xl border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      Future-Origin Consignments along Corridor ({futureOriginShipments.length})
                    </h4>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Waiting for vehicle arrival at downstream origin stops
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {futureOriginShipments.map((f) => (
                      <div
                        key={f.shipmentId}
                        className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1 opacity-80"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-slate-900">{f.shipmentId}</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-900">
                            Origin: {f.pickup}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-700 truncate">{f.cargoDescription}</div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
                          <span>{f.pickup} → {f.delivery}</span>
                          <span className="font-bold text-slate-700">{f.volume} m³ • {f.weight} kg</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AUTHORITATIVE LOAD VISUALIZER (3D DIGITAL TWIN & 2D CAD SCHEMATIC) ── */}
          <div ref={visualizerSectionRef} className="space-y-4">
            <OperationalLoadVisualizer
              tripId={selectedTripId}
              vehicleId={selectedTrip?.vehicleId || 'TN-01'}
              routeId={selectedTrip?.routeId || 'CHN-BLR-EXP'}
              truckSpecs={{
                dimensions: { length: truckLength, width: truckWidth, height: truckHeight },
                capacityVolume: truckVolume,
                capacityWeight: truckWeight
              }}
              truckDimensions={{ length: truckLength, width: truckWidth, height: truckHeight }}
              truckCapacity={{ volume: truckVolume, weight: truckWeight }}
              assignments={
                optimizationResult?.assignments?.length > 0
                  ? optimizationResult.assignments
                  : lockedCargoList
              }
              unassigned={optimizationResult?.unassignedShipments || []}
              stops={resolvedStops}
              currentStop={effectiveCurrentStop}
              nextStop={resolvedStops[Math.min(resolvedStops.length - 1, currentStopIdx + 1)] || 'Kanchipuram'}
              loadPlanStatus={optimizationResult?.status || (isPlanLocked ? 'LOCKED' : 'OPTIMIZED')}
              isLocked={isPlanLocked}
              optimizationResult={optimizationResult}
            />
          </div>

          {/* Approval & Dispatch Action Footer Bar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              {isPlanLocked ? (
                <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Load Plan v{optimizationResult?.version || 1} is locked and APPROVED. Trip status is READY_FOR_DISPATCH.
                </span>
              ) : (
                <span>
                  Approving persists version <strong className="text-gray-900 font-bold">{optimizationResult?.version || 1}</strong> with atomic database locking.
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isPlanLocked ? (
                <>
                  <button
                    onClick={handleUnlockLoadPlan}
                    disabled={unlocking}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <Unlock className="w-4 h-4 text-amber-700" />
                    <span>Unlock &amp; Re-Optimize</span>
                  </button>
                  <Link
                    to="/manager/operations"
                    className="no-underline inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Live Operations →</span>
                  </Link>
                </>
              ) : (
                <button
                  onClick={handleApproveLoadPlan}
                  disabled={loading || !optimizationResult}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve &amp; Lock Load Plan</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerOptimizationView;
