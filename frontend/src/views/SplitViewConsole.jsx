import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import RouteQrModal from '../components/ui/RouteQrModal';
import { Line } from 'react-chartjs-2';
import {
  Truck, Route as RouteIcon, Sparkles, Navigation, IndianRupee,
  TrendingUp, TrendingDown, Clock, AlertTriangle,
  CheckCircle, RefreshCw, Compass, Plus, X, Edit2,
  Trash2, QrCode, Box, Play, Layers, ShieldCheck,
  Calendar, RotateCw, MapPin
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

/* ── Form styling helper ───────────────────────────────────────── */
const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold transition-all duration-150';

const formatINR = (v) => {
  if (v == null) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

const shortINR = (v) => {
  if (v == null) return '₹0';
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v}`;
};

/* ── Circular progress gauge ───────────────────────────────────── */
const CircularProgress = ({ pct, label, sub, info }) => {
  const radius = 32, stroke = 5;
  const norm = radius - stroke;
  const circ = norm * 2 * Math.PI;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const color = pct >= 80 ? '#16a34a' : pct >= 65 ? '#d97706' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle stroke="#e5e7eb" strokeWidth={stroke} fill="transparent" r={norm} cx="40" cy="40" />
          <circle
            stroke={color} strokeWidth={stroke}
            strokeDasharray={`${circ} ${circ}`} style={{ strokeDashoffset: offset }}
            strokeLinecap="round" fill="transparent" r={norm} cx="40" cy="40"
          />
        </svg>
        <span className="absolute text-xs font-black text-gray-800">{pct}%</span>
      </div>
      <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-2">{label}</span>
      <span className="text-[9px] font-bold text-gray-300 mt-0.5">{sub}</span>
      {info && <span className="text-[10px] font-black text-[#16a34a] mt-1 bg-green-50 px-2 py-0.5 rounded-md border border-green-100">{info}</span>}
    </div>
  );
};

const SplitViewConsole = () => {
  const { user } = useContext(AuthContext);

  // Global Navigation tabs
  const [activeTab, setActiveTab] = useState('fleet'); // 'fleet' | 'routes' | 'consolidate'

  // Master lists
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [bookings, setBookings] = useState([]);
  
  // Selection keys
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [rightLoading, setRightLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Modal controllers
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddRoute, setShowAddRoute] = useState(false);

  // Add vehicle form state
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newType, setNewType] = useState('Heavy Truck');
  const [newVolume, setNewVolume] = useState(100);
  const [newWeight, setNewWeight] = useState(20000);
  const [newRouteLane, setNewRouteLane] = useState('');
  const [ratePerCbm, setRatePerCbm] = useState(150);
  const [ratePerKg, setRatePerKg] = useState(5);
  const [newBaseLocation, setNewBaseLocation] = useState('Chennai');

  // Add route form state
  const [newRouteId, setNewRouteId] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [distance, setDistance] = useState(150);
  const [baseRate, setBaseRate] = useState(30000);
  const [stopsStr, setStopsStr] = useState('');

  // ML / Predictions cache for selected vehicle
  const [occupancyPred, setOccupancyPred] = useState(null);
  const [delayPred, setDelayPred] = useState(null);
  const [pricePred, setPricePred] = useState(null);
  const [loadRecommendations, setLoadRecommendations] = useState([]);

  // ML Route Demand Forecast chart state
  const [routeForecast, setRouteForecast] = useState([]);

  // Consolidation Optimizer state
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [unassignedShipments, setUnassignedShipments] = useState([]);
  const [optResult, setOptResult] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [dbLoading, setDbLoading] = useState(false);

  // QR Modal & Stop Verification state
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrModalRoute, setQrModalRoute] = useState(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanToken, setScanToken] = useState('');
  const [scanVehicleId, setScanVehicleId] = useState('');
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanResultModal, setScanResultModal] = useState(null);
  const [transitStatusDetails, setTransitStatusDetails] = useState(null);
  const [transitHistory, setTransitHistory] = useState([]);

  const fetchData = async (showProgress = false) => {
    if (showProgress) setLoading(true);
    try {
      const [vRes, rRes, bRes] = await Promise.all([
        api.get('/vehicles/analytics/utilization'),
        api.get('/routes/analytics/performance'),
        api.get('/bookings?limit=1000')
      ]);
      setVehicles(vRes.data);
      setRoutes(rRes.data);
      setBookings(bRes.data);

      // Defaults
      if (vRes.data.length > 0 && !selectedVehicleId) {
        setSelectedVehicleId(vRes.data[0].vehicleId);
      }
      if (rRes.data.length > 0 && !selectedRouteId) {
        setSelectedRouteId(rRes.data[0].routeId);
      }
    } catch (err) {
      console.error(err);
      setError('Connection failure. Check if backend Node.js and MongoDB are online.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
  }, [user]);

  // Handle selected vehicle details, transit status & history
  const fetchVehicleDetails = async (vehicleId) => {
    if (!vehicleId) return;
    setRightLoading(true);
    try {
      const v = vehicles.find(x => x.vehicleId === vehicleId);
      const activeVehicle = v || vehicles[0];
      const todayStr = new Date().toISOString().split('T')[0];

      // Reset
      setOccupancyPred(null);
      setDelayPred(null);
      setPricePred(null);
      setLoadRecommendations([]);
      setTransitStatusDetails(null);
      setTransitHistory([]);

      // 1. Fetch live transit status & audit history
      try {
        const [statusRes, historyRes] = await Promise.all([
          api.get(`/transit/${activeVehicle.vehicleId}/status`),
          api.get(`/transit/${activeVehicle.vehicleId}/history`)
        ]);
        setTransitStatusDetails(statusRes.data);
        setTransitHistory(historyRes.data || []);
      } catch (e) {
        console.warn('Failed to load vehicle transit status', e);
      }

      // 2. Fetch live dynamic recommendations
      try {
        const { data } = await api.get(`/vehicles/${activeVehicle.vehicleId}/recommendations`);
        setLoadRecommendations(data.recommendations || []);
      } catch (e) {
        console.warn('Failed to load vehicle dynamic recommendations', e);
      }

      // 3. Fetch ML predictions from FastAPI
      if (activeVehicle.routeLane !== 'Inactive Lane' && activeVehicle.routeLane) {
        try {
          const payload = {
            vehicle_id: activeVehicle.vehicleId,
            route_id: activeVehicle.routeLane,
            date: todayStr,
            current_volume: parseFloat(activeVehicle.avgVolumeUtilization || 30),
            current_weight: parseFloat(activeVehicle.avgWeightUtilization || 2000)
          };
          const [occR, delayR, priceR] = await Promise.all([
            api.post('/predictions/occupancy', payload),
            api.post('/predictions/delay', { vehicle_id: activeVehicle.vehicleId, route_id: activeVehicle.routeLane, date: todayStr }),
            api.post('/predictions/price', { route_id: activeVehicle.routeLane, volume: payload.current_volume, weight: payload.current_weight, date: todayStr })
          ]);
          setOccupancyPred(occR.data);
          setDelayPred(delayR.data);
          setPricePred(priceR.data);
        } catch (e) {
          console.warn('FastAPI ML prediction service offline or unreachable.', e);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRightLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'fleet' && selectedVehicleId) {
      fetchVehicleDetails(selectedVehicleId);
    }
  }, [selectedVehicleId, activeTab, vehicles]);

  // Handle selected route details & predictions (Demand Forecast chart)
  const fetchRouteDetails = async (routeId) => {
    if (!routeId) return;
    setRightLoading(true);
    try {
      setRouteForecast([]);
      const { data } = await api.post('/predictions/demand', { route_id: routeId, days_ahead: 10 });
      setRouteForecast(data.forecast || []);
    } catch (e) {
      console.warn('Failed to fetch statsmodels demand forecast.', e);
    } finally {
      setRightLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'routes' && selectedRouteId) {
      fetchRouteDetails(selectedRouteId);
    }
  }, [selectedRouteId, activeTab, routes]);

  // Sync consolidation unassigned list
  const syncConsolidation = async () => {
    setDbLoading(true);
    setSyncMsg('');
    try {
      const { data } = await api.get('/bookings');
      const unassigned = data.filter(b => {
        const bDateStr = new Date(b.date).toISOString().split('T')[0];
        return b.vehicleId === 'UNASSIGNED' && 
               bDateStr === dispatchDate &&
               (b.status === 'Pending' || b.status === 'PENDING');
      });
      setUnassignedShipments(unassigned);
      setSyncMsg(`Synced! Found ${unassigned.length} pending shipments waiting for consolidation on ${dispatchDate}.`);
    } catch (e) {
      console.error(e);
      setSyncMsg('Sync failed. MongoDB check offline.');
    } finally {
      setDbLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'consolidate') {
      syncConsolidation();
    }
  }, [activeTab, dispatchDate]);

  // Action: Dispatch active truck
  const handleStartTrip = async (vehicleId) => {
    try {
      const { data } = await api.post(`/transit/dispatch/${vehicleId}`);
      alert(data.message || `Truck ${vehicleId} dispatched successfully!`);
      fetchData();
      fetchVehicleDetails(vehicleId);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to dispatch truck.');
    }
  };

  // Action: Execute Stop Verification Scan
  const handleExecuteScan = async (e) => {
    if (e) e.preventDefault();
    if (!scanVehicleId.trim() || !scanToken.trim()) {
      alert('Vehicle ID and QR Token are required.');
      return;
    }
    setScanSubmitting(true);
    try {
      const { data } = await api.post('/transit/verify-stop', {
        vehicleId: scanVehicleId.trim(),
        qrToken: scanToken.trim()
      });
      setShowScanModal(false);
      setScanResultModal(data);
      setScanToken('');
      fetchData();
      if (selectedVehicleId) fetchVehicleDetails(selectedVehicleId);
    } catch (err) {
      alert(err.response?.data?.message || 'Stop verification failed.');
    } finally {
      setScanSubmitting(false);
    }
  };

  // Action: Accept dyn recommendations load package
  const handleAcceptRecommendation = async (vehicleId, bookingId) => {
    try {
      await api.post(`/vehicles/${vehicleId}/accept-load`, { bookingId });
      alert(`Load recommendation accepted! Booking ${bookingId} added to active cargo transit.`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to accept recommendation.');
    }
  };

  // Action: Add vehicle
  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    try {
      await api.post('/vehicles', {
        vehicleId: newVehicleId.trim(),
        type: newType,
        capacityVolume: parseFloat(newVolume),
        capacityWeight: parseFloat(newWeight),
        routeLane: newRouteLane,
        ratePerCbm: parseFloat(ratePerCbm),
        ratePerKg: parseFloat(ratePerKg),
        baseLocation: newBaseLocation
      });
      setShowAddVehicle(false);
      setNewVehicleId(''); setNewVolume(100); setNewWeight(20000);
      fetchData();
      alert('Vehicle successfully registered!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add truck.');
    }
  };

  // Action: Add route
  const handleCreateRoute = async (e) => {
    e.preventDefault();
    try {
      const intermediate = stopsStr ? stopsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      const stops = [source.trim(), ...intermediate, destination.trim()];

      await api.post('/routes', {
        routeId: newRouteId.trim(),
        source: source.trim(),
        destination: destination.trim(),
        distance: parseFloat(distance),
        baseRate: parseFloat(baseRate),
        stops
      });
      setShowAddRoute(false);
      setNewRouteId(''); setSource(''); setDestination(''); setDistance(150); setBaseRate(30000); setStopsStr('');
      fetchData();
      alert('Shipping lane successfully registered!');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to register route.');
    }
  };

  // Action: Run optimizer
  const handleRunOptimizer = async () => {
    if (unassignedShipments.length === 0) {
      alert('No unassigned shipments on this date to optimize.');
      return;
    }
    const activeVehicles = vehicles.filter(v => v.status === 'Active');
    if (activeVehicles.length === 0) {
      alert('No active vehicles available to carry freight.');
      return;
    }

    setOptimizing(true);
    try {
      const formattedVehicles = activeVehicles.map(v => {
        const routeObj = routes.find(r => r.routeId === v.routeLane);
        const stops = routeObj ? (routeObj.stops && routeObj.stops.length > 1 ? routeObj.stops : [routeObj.source, routeObj.destination]) : ["Origin", "Destination"];
        
        // Calculate already occupied space/weight on the selected dispatch date
        const assignedOnDate = bookings.filter(b => 
          b.vehicleId === v.vehicleId && 
          new Date(b.date).toISOString().split('T')[0] === dispatchDate &&
          b.status !== 'Cancelled'
        );
        const usedVol = assignedOnDate.reduce((sum, b) => sum + b.volume, 0);
        const usedWt = assignedOnDate.reduce((sum, b) => sum + b.weight, 0);
        
        return {
          vehicleId: v.vehicleId,
          type: v.type,
          capacityVolume: Math.max(0, v.capacityVolume - usedVol),
          capacityWeight: Math.max(0, v.capacityWeight - usedWt),
          routeStops: stops,
          routeLane: v.routeLane
        };
      });

      const payload = {
        shipments: unassignedShipments.map(s => ({
          bookingId: s.bookingId,
          volume: s.volume,
          weight: s.weight,
          routeId: s.routeId || 'UNASSIGNED',
          fromStop: s.fromStop,
          toStop: s.toStop
        })),
        vehicles: formattedVehicles.map(v => ({
          vehicleId: v.vehicleId,
          capacityVolume: v.capacityVolume,
          capacityWeight: v.capacityWeight,
          type: v.type,
          routeStops: v.routeStops
        }))
      };

      const { data } = await api.post('/predictions/optimize', payload);
      setOptResult(data);
      alert('Multi-Dimensional Consolidation optimized successfully!');
    } catch (err) {
      console.error(err);
      alert('Optimization solver failed. Verify analytics microservice.');
    } finally {
      setOptimizing(false);
    }
  };

  // Action: Apply optimizer results
  const handleApplyAssignments = async () => {
    if (!optResult || optResult.consolidations.length === 0) return;
    setApplying(true);
    try {
      const assignments = [];
      optResult.consolidations.forEach(c => {
        const dbVeh = vehicles.find(v => v.vehicleId === c.vehicleId);
        const resolvedRouteId = dbVeh ? dbVeh.routeLane : 'UNASSIGNED';

        c.shipments.forEach(s => {
          assignments.push({
            bookingId: s.bookingId,
            vehicleId: c.vehicleId,
            routeId: resolvedRouteId,
            status: 'In Transit' // dispatch immediately
          });
        });
      });

      await api.post('/bookings/bulk-update', { assignments });
      alert(`Consolidated and dispatched ${assignments.length} bookings successfully!`);
      setOptResult(null);
      fetchData();
      syncConsolidation();
    } catch (e) {
      alert('Bulk update failed. Database connection offline.');
    } finally {
      setApplying(false);
    }
  };

  // Action: Remove vehicle
  const handleRemoveVehicle = async (vehicleId) => {
    if (!window.confirm(`Remove truck ${vehicleId} from fleet?`)) return;
    try {
      await api.delete(`/vehicles/${vehicleId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove truck.');
    }
  };

  // Route chart rendering configuration
  const chartData = {
    labels: routeForecast.map((_, i) => `+${i + 1}d`),
    datasets: [{
      label: 'Predicted Daily Bookings',
      data: routeForecast.map(f => f.predicted_bookings_count),
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22,163,74,0.06)',
      borderWidth: 2.5, tension: 0.4, fill: true,
      pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#16a34a',
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10, weight: '700' } } },
      y: { grid: { color: '#f3f4f6' }, ticks: { color: '#9ca3af', font: { size: 10 } } }
    }
  };

  const selectedVehicleObj = vehicles.find(v => v.vehicleId === selectedVehicleId);
  const selectedRouteObj = routes.find(r => r.routeId === selectedRouteId);

  return (
    <div className="space-y-6">
      
      {/* ── HEADER ────────────────────────────────────────────────── */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">BI Control Tower</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">BI Split-View Control Console</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Manage dispatches, analyze live occupancy, run dynamic consolidations, and inspect forecasting models.</p>
        </div>

        {/* Global actions */}
        <div className="flex items-center space-x-2.5">
          {activeTab === 'fleet' && (
            <button onClick={() => setShowAddVehicle(true)} className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[11px] font-black shadow-md border-none cursor-pointer">
              <Plus className="w-3.5 h-3.5" /><span>Register Truck</span>
            </button>
          )}
          {activeTab === 'routes' && (
            <button onClick={() => setShowAddRoute(true)} className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[11px] font-black shadow-md border-none cursor-pointer">
              <Plus className="w-3.5 h-3.5" /><span>Add Lane</span>
            </button>
          )}
          <button onClick={() => fetchData(true)} className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 cursor-pointer shadow-sm">
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── COCKPIT split pane layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[68vh] items-stretch">
        
        {/* LEFT COLUMN: Master selector list (5 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            {/* Master sub-header tabs */}
            <div className="bg-gray-50/70 border-b border-gray-100 p-2 flex space-x-1">
              {[
                { id: 'fleet', label: 'Fleet Space', icon: Truck },
                { id: 'routes', label: 'Route Lanes', icon: RouteIcon },
                { id: 'consolidate', label: 'Consolidate', icon: Sparkles }
              ].map(t => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-xl text-[11px] font-black transition-all border-none cursor-pointer ${
                      active ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700 bg-transparent'
                    }`}
                  >
                    <t.icon className={`w-3.5 h-3.5 ${active ? 'text-[#16a34a]' : ''}`} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* List containers */}
            <div className="p-4 overflow-y-auto max-h-[58vh]">
              {/* FLEET LIST */}
              {activeTab === 'fleet' && (
                <div className="space-y-2">
                  {vehicles.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No fleet trucks found.</p>
                  ) : vehicles.map(v => {
                    const sel = v.vehicleId === selectedVehicleId;
                    const color = v.avgVolumeUtilization >= 80 ? 'bg-green-600' : v.avgVolumeUtilization >= 65 ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <div
                        key={v.vehicleId}
                        onClick={() => setSelectedVehicleId(v.vehicleId)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                          sel ? 'bg-green-50/20 border-[#16a34a]' : 'bg-transparent border-gray-100 hover:bg-gray-50/50'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-[12px] font-black text-gray-800">{v.vehicleId}</span>
                            <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{v.type}</span>
                          </div>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            v.transitStatus === 'Idle' ? 'bg-gray-100 text-gray-500 border-gray-200' :
                            v.transitStatus === 'At Stop' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-green-50 text-green-700 border-green-200'
                          }`}>{v.transitStatus}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(v.avgVolumeUtilization || 0, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-gray-700 shrink-0">{v.avgVolumeUtilization || 0}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ROUTES LIST */}
              {activeTab === 'routes' && (
                <div className="space-y-2">
                  {routes.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-8">No shipping lanes registered.</p>
                  ) : routes.map(r => {
                    const sel = r.routeId === selectedRouteId;
                    return (
                      <div
                        key={r.routeId}
                        onClick={() => setSelectedRouteId(r.routeId)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer text-left ${
                          sel ? 'bg-green-50/20 border-[#16a34a]' : 'bg-transparent border-gray-100 hover:bg-gray-50/50'
                        }`}
                      >
                        <span className="text-[12px] font-black text-gray-800 block">{r.routeId}</span>
                        <div className="flex items-center space-x-1 mt-1 text-[11px] text-gray-500 font-bold">
                          <Navigation className="w-3 h-3 text-[#16a34a]" />
                          <span className="truncate">{r.source} ➔ {r.destination}</span>
                        </div>
                        <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-gray-50 text-[10px] font-black text-gray-400">
                          <span>{r.distance} KM</span>
                          <span className="text-gray-700">{formatINR(r.baseRate)} / m³</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* CONSOLIDATION CONTROLS */}
              {activeTab === 'consolidate' && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 text-left">
                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Dispatch Schedule Date</label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                      <input
                        type="date"
                        value={dispatchDate}
                        onChange={(e) => setDispatchDate(e.target.value)}
                        className={`${inputCls} pl-10`}
                      />
                    </div>
                  </div>

                  <button
                    onClick={syncConsolidation}
                    disabled={dbLoading}
                    className="w-full py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-black rounded-xl text-[11px] flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${dbLoading ? 'animate-spin' : ''}`} />
                    <span>Sync Pending Shipments</span>
                  </button>

                  {syncMsg && (
                    <div className="bg-green-50 border border-green-100 text-[#16a34a] p-3 rounded-xl text-[10px] font-bold leading-relaxed text-left flex items-start space-x-2">
                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{syncMsg}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sync indicator */}
          <div className="bg-gray-50 border-t border-gray-100 px-4.5 py-3 flex justify-between items-center text-[10px] font-bold text-gray-400">
            <span>Database Synchronized</span>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          </div>
        </div>

        {/* RIGHT COLUMN: Slide-in Detail cockpit (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col relative overflow-hidden">
          
          {rightLoading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
              <div className="w-6 h-6 border-3 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* DETAIL COCKPIT: FLEET VEHICLES */}
          {activeTab === 'fleet' && (
            selectedVehicleObj ? (
              <div className="space-y-6 text-left flex-1 flex flex-col justify-between">
                <div>
                  {/* Header */}
                  <div className="flex justify-between items-start flex-wrap gap-4 pb-5 border-b border-gray-50">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-lg font-black text-gray-900">{selectedVehicleObj.vehicleId}</h2>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-wider">{selectedVehicleObj.type}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-semibold mt-1">
                        Assigned Route: <span className="text-gray-700 font-black">{selectedVehicleObj.routeLane || 'None'}</span>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {(selectedVehicleObj.transitStatus === 'READY' || selectedVehicleObj.transitStatus === 'Idle') && selectedVehicleObj.routeLane && (
                        <button
                          onClick={() => handleStartTrip(selectedVehicleObj.vehicleId)}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[11px] font-black shadow-md border-none cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Dispatch Truck</span>
                        </button>
                      )}
                      
                      {(selectedVehicleObj.transitStatus === 'IN_TRANSIT' || selectedVehicleObj.transitStatus === 'AT_STOP' || selectedVehicleObj.transitStatus === 'DISPATCHED' || selectedVehicleObj.transitStatus === 'In Transit') && (
                        <button
                          onClick={() => { setScanVehicleId(selectedVehicleObj.vehicleId); setShowScanModal(true); }}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-black shadow-md border-none cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Verify Stop QR</span>
                        </button>
                      )}

                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-widest ${
                        selectedVehicleObj.transitStatus === 'READY' || selectedVehicleObj.transitStatus === 'Idle' ? 'bg-gray-50 text-gray-500 border-gray-200' :
                        selectedVehicleObj.transitStatus === 'AT_STOP' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                        selectedVehicleObj.transitStatus === 'COMPLETED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        'bg-green-50 text-green-700 border-green-200'
                      }`}>{selectedVehicleObj.transitStatus}</span>
                    </div>
                  </div>

                  {/* Circular Space Gauges */}
                  {(() => {
                    const volPct = selectedVehicleObj.avgVolumeUtilization || 0;
                    const totalVol = selectedVehicleObj.capacityVolume || 0;
                    const usedVol = parseFloat((totalVol * (volPct / 100)).toFixed(1));
                    const remVol = parseFloat(Math.max(0, totalVol - usedVol).toFixed(1));

                    const wtPct = selectedVehicleObj.avgWeightUtilization || 0;
                    const totalWt = selectedVehicleObj.capacityWeight || 0;
                    const usedWt = parseFloat((totalWt * (wtPct / 100)).toFixed(1));
                    const remWt = parseFloat(Math.max(0, totalWt - usedWt).toFixed(1));

                    return (
                      <div className="grid grid-cols-3 gap-6 py-6 border-b border-gray-50">
                        <CircularProgress 
                          pct={volPct} 
                          label="Volume Space" 
                          sub={`${totalVol} m³ limit`} 
                          info={`Rem: ${remVol} m³`}
                        />
                        <CircularProgress 
                          pct={wtPct} 
                          label="Weight Cargo" 
                          sub={`${(totalWt / 1000).toFixed(0)} Tons limit`} 
                          info={`Rem: ${(remWt / 1000).toFixed(1)} T`}
                        />
                    
                    {/* Route progression details */}
                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex flex-col justify-center">
                      <div className="flex items-center space-x-2 text-[#16a34a] mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-wider">Estimated Arrival Time (ETA)</span>
                      </div>
                      {selectedVehicleObj.transitStatus !== 'Idle' && selectedVehicleObj.transitStatus !== 'READY' ? (
                        <div className="space-y-1">
                          <p className="text-[11px] text-gray-800 font-black">
                            {selectedVehicleObj.transitStatus === 'AT_STOP' ? `At Verified Stop: ${selectedVehicleObj.currentStop}` : `En Route to ${transitStatusDetails?.nextStop || 'Next Stop'}`}
                          </p>
                          <p className="text-[9px] text-gray-400 font-semibold leading-normal">
                            ETA predicted based on schedule. Physical stop arrival is strictly authority-verified via QR scans.
                          </p>
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 font-bold py-1">Truck is idle at terminal depot.</p>
                      )}
                    </div>
                  </div>
                );
              })()}

                  {/* ML Predictions row */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-5 border-b border-gray-50">
                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">ML Expected Occupancy</span>
                      <p className="text-lg font-black text-gray-900">{occupancyPred ? `${occupancyPred.predicted_utilization_percent}%` : '—'}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-1">{occupancyPred?.recommendation || 'No predictions generated. Retrain the model.'}</p>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">ML Delay Prediction</span>
                      <p className="text-lg font-black text-gray-900">{delayPred ? `${delayPred.predicted_delay_hours} hrs` : '—'}</p>
                      <p className="text-[10px] text-gray-400 font-semibold mt-1">Status: <span className="font-bold text-gray-800">{delayPred?.status || 'Calculating'}</span> · Confidence: {delayPred ? `${Math.round(delayPred.confidence * 100)}%` : '—'}</p>
                    </div>
                  </div>

                  {/* Recommended Loading Sequence (LIFO rear-to-front order) */}
                  <div className="py-5 border-b border-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Recommended Loading Sequence</h3>
                        <span className="text-[9px] text-gray-400 font-semibold block">LIFO arrangement: Downstream destinations loaded deepest (front to rear)</span>
                      </div>
                      <span className="text-[9px] font-black text-[#16a34a] bg-green-50 px-2 py-0.5 rounded border border-green-100">
                        {transitStatusDetails?.recommendedLoadingSequence?.length || 0} Cargo Units
                      </span>
                    </div>

                    {!transitStatusDetails?.recommendedLoadingSequence || transitStatusDetails.recommendedLoadingSequence.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No packages currently loaded on this truck.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {transitStatusDetails.recommendedLoadingSequence.map(item => (
                          <div key={item.bookingId} className="flex justify-between items-center bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-[10px]">
                            <div className="flex items-center space-x-2.5">
                              <span className="w-5 h-5 rounded-full bg-[#16a34a] text-white flex items-center justify-center font-black text-[9px]">
                                #{item.positionNumber}
                              </span>
                              <div>
                                <span className="font-black text-gray-800">{item.bookingId}</span>
                                <span className="text-gray-400 font-semibold block">{item.fromStop} ➔ {item.toStop}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-[#16a34a] block">{item.volume} m³ · {item.weight} kg</span>
                              <span className="text-[8px] font-black uppercase text-gray-400">{item.positionLabel}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Stop Verification History (Audit Trail) */}
                  <div className="py-5">
                    <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-3">Stop Verification Audit History</h3>
                    {transitHistory.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No stop verification scans recorded for this vehicle yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {transitHistory.map(evt => (
                          <div key={evt._id} className="bg-gray-50/70 p-3 rounded-xl border border-gray-100 text-[10px] space-y-1.5">
                            <div className="flex justify-between items-center font-black text-gray-800">
                              <div className="flex items-center space-x-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-[#16a34a]" />
                                <span>{evt.locationName} Stop (Scan #{evt.sequenceNumber})</span>
                              </div>
                              <span className="text-[9px] text-gray-400 font-semibold">{new Date(evt.timestamp).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-gray-500 font-bold text-[9px]">
                              <span>Unloaded: {evt.packagesUnloaded?.length || 0} pkgs · Loaded: {evt.packagesLoaded?.length || 0} pkgs</span>
                              <span>Volume after: {evt.volumeAfter} m³ · Weight after: {evt.weightAfter} kg</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveVehicle(selectedVehicleObj.vehicleId)}
                  className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[11px] font-bold border border-red-100 cursor-pointer flex items-center justify-center space-x-1.5 mt-4"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Retire Truck from active Fleet</span>
                </button>
              </div>
            ) : (
              <p className="text-gray-400 italic text-center py-20">Select a vehicle from the master list to inspect metrics.</p>
            )
          )}

          {/* DETAIL COCKPIT: ROUTES & DEMAND FORECAST */}
          {activeTab === 'routes' && (
            selectedRouteObj ? (
              <div className="space-y-6 text-left flex-1 flex flex-col justify-between">
                <div>
                  {/* Header */}
                  <div className="flex justify-between items-start flex-wrap gap-4 pb-5 border-b border-b-gray-50">
                    <div>
                      <h2 className="text-lg font-black text-gray-900">{selectedRouteObj.routeId}</h2>
                      <div className="flex items-center space-x-2 mt-1">
                        <Navigation className="w-4 h-4 text-[#16a34a]" />
                        <span className="text-sm font-black text-gray-800">{selectedRouteObj.source} ➔ {selectedRouteObj.destination}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => { setQrModalRoute(selectedRouteObj); setShowQrModal(true); }}
                        className="flex items-center space-x-1.5 px-3.5 py-2 bg-green-50 hover:bg-green-100 text-[#16a34a] border border-green-200 rounded-xl text-[11px] font-black cursor-pointer shadow-sm transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>View / Print Stop QR Tokens</span>
                      </button>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 uppercase tracking-widest">{selectedRouteObj.distance} KM Distance</span>
                    </div>
                  </div>

                  {/* Route Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-5 border-b border-gray-50">
                    {[
                      { label: 'Total Runs', value: selectedRouteObj.totalBookings || 0, sub: 'Dispatches' },
                      { label: 'Revenue', value: formatINR(selectedRouteObj.totalRevenue || 0), sub: 'Gross cash yield' },
                      { label: 'Net Profit', value: formatINR(selectedRouteObj.totalProfit || 0), sub: 'Profit after operating cost' },
                      { label: 'Profit Margin', value: `${selectedRouteObj.profitMargin || 0}%`, sub: 'ROI yield rate' }
                    ].map(st => (
                      <div key={st.label} className="bg-gray-50 border border-gray-100 p-3.5 rounded-2xl">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">{st.label}</span>
                        <span className="text-sm font-black text-gray-800 block">{st.value}</span>
                        <span className="text-[8px] text-gray-400 font-bold uppercase mt-1 block">{st.sub}</span>
                      </div>
                    ))}
                  </div>

                  {/* ML Holt-Winters forecast chart */}
                  <div className="py-5 border-b border-gray-50">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">ML Route Demand Forecast</h3>
                        <p className="text-[10px] text-gray-400 font-semibold">Statsmodels Holt-Winters Exponential Smoothing projection</p>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[#16a34a] bg-green-50 border border-green-100 px-3 py-1 rounded-full text-[9px] font-black">
                        <TrendingUp className="w-3.5 h-3.5 animate-pulse" />
                        <span>Forecast Active</span>
                      </div>
                    </div>

                    <div className="h-44">
                      {routeForecast.length === 0 ? (
                        <div className="h-full flex items-center justify-center bg-gray-50/50 rounded-xl border border-gray-100">
                          <p className="text-xs text-gray-400 italic">No forecast data loaded. Make sure analytics FastAPI is running.</p>
                        </div>
                      ) : (
                        <Line data={chartData} options={chartOptions} />
                      )}
                    </div>
                  </div>

                  {/* Route stops timeline */}
                  <div className="py-5">
                    <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-3.5">Lane Stop Sequence Details</h3>
                    <div className="flex items-center space-x-2 flex-wrap">
                      {selectedRouteObj.stops && selectedRouteObj.stops.map((stop, i) => (
                        <React.Fragment key={i}>
                          <div className="flex items-center space-x-1.5 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100 text-[11px] font-bold text-gray-700">
                            <MapPin className="w-3 h-3 text-[#16a34a]" />
                            <span>{stop}</span>
                          </div>
                          {i < selectedRouteObj.stops.length - 1 && <span className="text-gray-300 font-bold">➔</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={async () => {
                    if (window.confirm(`Delete route lane ${selectedRouteObj.routeId}?`)) {
                      try { await api.delete(`/routes/${selectedRouteObj.routeId}`); alert('Route removed successfully.'); fetchData(); } 
                      catch (e) { alert('Failed to delete route.'); }
                    }
                  }}
                  className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[11px] font-bold border border-red-100 cursor-pointer flex items-center justify-center space-x-1.5 mt-4"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Shipping Route Lane</span>
                </button>
              </div>
            ) : (
              <p className="text-gray-400 italic text-center py-20">Select a route lane from the master list to inspect forecasting.</p>
            )
          )}

          {/* DETAIL COCKPIT: SPACE PACKING OPTIMIZER */}
          {activeTab === 'consolidate' && (
            <div className="space-y-6 text-left flex-1 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="pb-5 border-b border-gray-50 flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Multi-Dimensional Space Consolidation Optimizer</h2>
                    <p className="text-[11px] text-gray-400 font-semibold mt-1">Pack pending bookings into active carrier truck volumes leg-by-leg to eliminate underutilization.</p>
                  </div>

                  <button
                    onClick={handleRunOptimizer}
                    disabled={optimizing || unassignedShipments.length === 0}
                    className="flex items-center space-x-1.5 px-4.5 py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white rounded-xl text-[11px] font-black shadow-md border-none cursor-pointer transition-all"
                  >
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>{optimizing ? 'Calculating Packing...' : 'Run Consolidation Optimizer'}</span>
                  </button>
                </div>

                {/* Unassigned dispatches status */}
                <div className="py-4 border-b border-gray-50">
                  <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest mb-3">Pending Cargo Queue for {dispatchDate}</h3>
                  {unassignedShipments.length === 0 ? (
                    <div className="bg-gray-50 p-6 rounded-2xl text-center border border-gray-100">
                      <p className="text-xs text-gray-400 italic">All shipments have been dispatched! No pending bookings require packing optimization today.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-36 overflow-y-auto">
                      {unassignedShipments.map(bkg => (
                        <div key={bkg.bookingId} className="bg-white border border-gray-150 p-2.5 rounded-xl text-left">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[11px] font-bold text-gray-800">{bkg.bookingId}</span>
                            <span className="text-[8px] bg-gray-100 text-gray-600 px-1 rounded font-black">{bkg.volume} m³</span>
                          </div>
                          <span className="text-[8px] text-gray-400 font-bold block truncate">{bkg.fromStop} ➔ {bkg.toStop}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Optimization Results */}
                {optResult && (
                  <div className="py-5 space-y-4">
                    <div className="flex items-center space-x-2 text-[#16a34a] mb-2">
                      <ShieldCheck className="w-5 h-5" />
                      <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Optimized Packing Output (LIFO Ordered)</h3>
                    </div>

                    {/* Optimizer KPI stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Trucks Used', value: optResult.metrics.trucksUsed },
                        { label: 'Trucks Saved', value: optResult.metrics.trucksSaved, cls: 'text-green-600 font-black' },
                        { label: 'Avg Vol Utilization', value: `${optResult.metrics.avgVolumeUtilization}%` },
                        { label: 'Avg Wt Utilization', value: `${optResult.metrics.avgWeightUtilization}%` }
                      ].map(m => (
                        <div key={m.label} className="bg-green-50/20 border border-green-100 p-3 rounded-xl">
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">{m.label}</span>
                          <span className={`text-sm font-black text-gray-800 mt-1 block ${m.cls || ''}`}>{m.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Pack listings */}
                    <div className="space-y-3.5 max-h-[30vh] overflow-y-auto pr-2 mt-4">
                      {optResult.consolidations.map(c => (
                        <div key={c.vehicleId} className="border border-gray-100 bg-gray-50/50 p-4 rounded-2xl text-left space-y-3">
                          <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                            <div>
                              <span className="text-[12px] font-black text-gray-900">{c.vehicleId}</span>
                              <span className="text-[9px] text-gray-400 font-bold block mt-0.5">{c.type}</span>
                            </div>
                            <span className="text-[9px] text-[#16a34a] font-black uppercase tracking-wider bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full">
                              Peak Occupancy: {c.peakVolumeUtilizationPercent}%
                            </span>
                          </div>

                          {/* Packing legs */}
                          <div className="space-y-2">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Leg-by-Leg Space Consolidation Packing</span>
                            {c.legs.map((leg, li) => (
                              <div key={li} className="flex justify-between items-center text-[10px] font-semibold text-gray-600 bg-white p-2 rounded-xl border border-gray-100">
                                <span className="truncate">{leg.fromStop} ➔ {leg.toStop}</span>
                                <div className="flex items-center space-x-3 shrink-0">
                                  <span>Space utilization: <span className="font-bold text-gray-800">{leg.volumeUtilizationPercent}%</span></span>
                                  <span>Weight: <span className="font-bold text-gray-800">{leg.weightUtilizationPercent}%</span></span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Consolidated bookings */}
                          <div className="space-y-1.5">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Consolidated Packages ({c.shipments.length})</span>
                            <div className="flex flex-wrap gap-2">
                              {c.shipments.map(s => (
                                <span key={s.bookingId} className="px-2 py-1 bg-white border border-gray-150 rounded-lg text-[9px] font-bold text-gray-700">
                                  {s.bookingId} ({s.volume} m³)
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {optResult && (
                <button
                  onClick={handleApplyAssignments}
                  disabled={applying}
                  className="w-full py-3.5 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl text-[12px] shadow-lg shadow-green-600/20 border-none cursor-pointer mt-4"
                >
                  {applying ? 'Applying & Dispatching Fleet...' : 'Confirm Consolidation & Dispatch Trucks'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL: REGISTER VEHICLE ─────────────────────────────── */}
      {showAddVehicle && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-lg w-full p-6 text-left space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">Register Fleet Truck</h3>
              <button onClick={() => setShowAddVehicle(false)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 border-none cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleCreateVehicle} className="space-y-4 text-[11px] font-bold text-gray-500">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Vehicle ID / Plate No.</label>
                  <input type="text" value={newVehicleId} onChange={e => setNewVehicleId(e.target.value)} required placeholder="e.g. TN-37-TRK-987" className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Truck Model Type</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)} className={inputCls}>
                    {['Heavy Truck', 'Medium Truck', 'Light Van', 'Mini Truck', 'Pickup Truck', '14 ft Truck', '17 ft Truck', '20 ft Truck', '32 ft Truck', 'Container Truck'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Volume Capacity (m³)</label>
                  <input type="number" value={newVolume} onChange={e => setNewVolume(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Weight Capacity (kg)</label>
                  <input type="number" value={newWeight} onChange={e => setNewWeight(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Assigned Route Lane</label>
                  <select value={newRouteLane} onChange={e => setNewRouteLane(e.target.value)} className={inputCls}>
                    <option value="">No Active Route Lane</option>
                    {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} ➔ {r.destination}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Base Depot Location</label>
                  <input type="text" value={newBaseLocation} onChange={e => setNewBaseLocation(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Volume Rate (₹ / m³)</label>
                  <input type="number" value={ratePerCbm} onChange={e => setRatePerCbm(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Weight Rate (₹ / kg)</label>
                  <input type="number" value={ratePerKg} onChange={e => setRatePerKg(e.target.value)} className={inputCls} />
                </div>
              </div>



              <button type="submit" className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-[12px] shadow-md border-none cursor-pointer">Register Vehicle</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTER ROUTE ────────────────────────────────── */}
      {showAddRoute && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl max-w-lg w-full p-6 text-left space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-[14px] font-black text-gray-900 uppercase tracking-widest">Register Shipping Lane</h3>
              <button onClick={() => setShowAddRoute(false)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 border-none cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleCreateRoute} className="space-y-4 text-[11px] font-bold text-gray-500">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Route ID</label>
                  <input type="text" value={newRouteId} onChange={e => setNewRouteId(e.target.value)} required placeholder="e.g. RTE-009" className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Source (Origin)</label>
                  <input type="text" value={source} onChange={e => setSource(e.target.value)} required placeholder="Chennai" className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Destination</label>
                  <input type="text" value={destination} onChange={e => setDestination(e.target.value)} required placeholder="Coimbatore" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block uppercase tracking-wider mb-1">Distance (KM)</label>
                  <input type="number" value={distance} onChange={e => setDistance(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block uppercase tracking-wider mb-1">Base Price Rate (₹ / m³)</label>
                  <input type="number" value={baseRate} onChange={e => setBaseRate(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block uppercase tracking-wider mb-1">Intermediate Stops (comma-separated, in sequence order)</label>
                <input type="text" value={stopsStr} onChange={e => setStopsStr(e.target.value)} placeholder="e.g. Villupuram, Trichy" className={inputCls} />
                <span className="text-[9px] text-gray-400 font-semibold mt-1.5 block">Stops will automatically be registered sequentially, creating distinct shipping segments and stop QR codes.</span>
              </div>

              <button type="submit" className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-[12px] shadow-md border-none cursor-pointer">Register Lane</button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ROUTE QR CODES ───────────────────────────────── */}
      {showQrModal && (
        <RouteQrModal
          route={qrModalRoute}
          onClose={() => { setShowQrModal(false); setQrModalRoute(null); }}
          onRefresh={() => {
            fetchData();
            if (selectedRouteId) fetchRouteDetails(selectedRouteId);
          }}
        />
      )}

      {/* ── MODAL: STOP VERIFICATION SCANNER INPUT ─────────────── */}
      {showScanModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-md w-full p-6 text-left space-y-4">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2 text-[#16a34a]">
                <QrCode className="w-5 h-5" />
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Verify Physical Stop</h3>
              </div>
              <button onClick={() => setShowScanModal(false)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 border-none cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <form onSubmit={handleExecuteScan} className="space-y-4 text-[11px] font-bold text-gray-500">
              <div>
                <label className="block uppercase tracking-wider mb-1">Truck Vehicle ID</label>
                <input
                  type="text"
                  value={scanVehicleId}
                  onChange={e => setScanVehicleId(e.target.value)}
                  required
                  placeholder="e.g. TRUCK-101"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block uppercase tracking-wider mb-1">Scanned Stop QR Token String</label>
                <input
                  type="text"
                  value={scanToken}
                  onChange={e => setScanToken(e.target.value)}
                  required
                  placeholder="e.g. STPTKN-a1b2c3d4..."
                  className={inputCls}
                />
              </div>

              <div className="bg-amber-50 border border-amber-100 text-amber-800 p-3 rounded-xl text-[10px] font-semibold">
                Scanning this QR token will verify physical truck arrival, execute atomic cargo loading/unloading, and recalculate segment capacity.
              </div>

              <button
                type="submit"
                disabled={scanSubmitting}
                className="w-full py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-xs shadow-md border-none cursor-pointer flex items-center justify-center space-x-2"
              >
                {scanSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>AUTHORIZE STOP SCAN</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: VERIFICATION RESULT SUMMARY ──────────────────── */}
      {scanResultModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full p-6 text-left space-y-5">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2 text-[#16a34a]">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <h3 className="text-base font-black text-gray-900">Stop Verification Executed</h3>
                  <span className="text-[10px] text-gray-400 font-semibold">{scanResultModal.arrivalTime}</span>
                </div>
              </div>
              <button onClick={() => setScanResultModal(null)} className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-gray-100 border-none cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="bg-green-50/70 border border-green-100 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between text-xs font-black text-gray-900">
                <span>Verified Stop: <span className="text-[#16a34a]">{scanResultModal.stop}</span></span>
                <span>Vehicle: {scanResultModal.vehicleId}</span>
              </div>
              <p className="text-[11px] text-gray-600 font-semibold">{scanResultModal.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Unloaded at Stop</span>
                <span className="text-lg font-black text-amber-600">{scanResultModal.operations?.unloadedCount || 0} Packages</span>
              </div>
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Loaded at Stop</span>
                <span className="text-lg font-black text-green-600">{scanResultModal.operations?.loadedCount || 0} Packages</span>
              </div>
            </div>

            {scanResultModal.capacityAfter && (
              <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-100 text-[10px] font-semibold space-y-1">
                <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Post-Stop Capacity Status</span>
                <div className="flex justify-between text-gray-800">
                  <span>Volume: {scanResultModal.capacityAfter.usedVolume} / {scanResultModal.capacityAfter.capacityVolume} m³</span>
                  <span className="text-[#16a34a] font-bold">({scanResultModal.capacityAfter.remainingVolume} m³ remaining)</span>
                </div>
                <div className="flex justify-between text-gray-800">
                  <span>Weight: {scanResultModal.capacityAfter.usedWeight} / {scanResultModal.capacityAfter.capacityWeight} kg</span>
                  <span className="text-[#16a34a] font-bold">({scanResultModal.capacityAfter.remainingWeight} kg remaining)</span>
                </div>
              </div>
            )}

            <button
              onClick={() => setScanResultModal(null)}
              className="w-full py-3 bg-gray-900 hover:bg-black text-white font-black rounded-xl text-xs shadow-md border-none cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default SplitViewConsole;
