import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Truck, AlertTriangle, CheckCircle, Trash2,
  Plus, X, TrendingDown, Activity
} from 'lucide-react';

const CUSTOMERS = [
  { id: 'CUST-001', name: 'Apex Retail Group (Enterprise)'    },
  { id: 'CUST-002', name: 'Global Manufacturing (Enterprise)' },
  { id: 'CUST-004', name: 'West Coast Distributors (SMB)'     },
  { id: 'CUST-006', name: 'Local Artisan Crafts (SMB)'        },
];

/* ── Circular gauge ────────────────────────────────────────── */
const CircularProgress = ({ pct, label, sub }) => {
  const radius = 32, stroke = 5;
  const norm = radius - stroke;
  const circ = norm * 2 * Math.PI;
  const offset = circ - (Math.min(pct, 100) / 100) * circ;
  const color = pct >= 85 ? '#16a34a' : pct >= 65 ? '#d97706' : '#ef4444';
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
      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1.5">{label}</span>
      <span className="text-[9px] font-bold text-gray-300 mt-0.5">{sub}</span>
    </div>
  );
};

/* ── Shared input class ────────────────────────────────────── */
const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold';

/* ═══════════════════════════════════════════════════════════════
   SPACE ANALYSIS
═══════════════════════════════════════════════════════════════ */
const SpaceAnalysis = () => {
  const { user } = useContext(AuthContext);
  const [vehicles,         setVehicles]         = useState([]);
  const [routes,           setRoutes]           = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [showAddModal,     setShowAddModal]     = useState(false);
  const [showLoadModal,    setShowLoadModal]    = useState(false);
  const [selectedVehicle,  setSelectedVehicle]  = useState(null);

  // Add truck form
  const [newVehicleId, setNewVehicleId] = useState('');
  const [newType,      setNewType]      = useState('Heavy Truck');
  const [newVolume,    setNewVolume]    = useState(100);
  const [newWeight,    setNewWeight]    = useState(20000);
  const [newRouteLane, setNewRouteLane] = useState('');
  const [ratePerCbm,   setRatePerCbm]   = useState(150);
  const [ratePerKg,    setRatePerKg]    = useState(5);
  const [newBaseLocation, setNewBaseLocation] = useState('Chennai');
  const [addError,     setAddError]     = useState('');
  const [addLoading,   setAddLoading]   = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [newAssignedDriverId, setNewAssignedDriverId] = useState('');

  // Edit truck form
  const [showEditModal,     setShowEditModal]     = useState(false);
  const [editVehicle,       setEditVehicle]       = useState(null);
  const [editRouteLane,     setEditRouteLane]     = useState('');
  const [editRatePerCbm,     setEditRatePerCbm]     = useState(150);
  const [editRatePerKg,      setEditRatePerKg]      = useState(5);
  const [editAssignedDriverId, setEditAssignedDriverId] = useState('');
  const [editError,         setEditError]         = useState('');
  const [editLoading,       setEditLoading]       = useState(false);

  // Load package form
  const [selectedRoute,    setSelectedRoute]    = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('CUST-001');
  const [packageVolume,    setPackageVolume]    = useState(10);
  const [packageWeight,    setPackageWeight]    = useState(2000);
  const [loadError,        setLoadError]        = useState('');
  const [loadLoading,      setLoadLoading]      = useState(false);

  const fetchUtilization = async (showLoadingState = false) => {
    try {
      if (showLoadingState) setLoading(true);
      const { data } = await api.get('/vehicles/analytics/utilization');
      setVehicles(data);
    } catch (err) {
      setError('Failed to load fleet space metrics. Check Express Server connection.');
    } finally {
      if (showLoadingState) setLoading(false);
    }
  };

  useEffect(() => {
    fetchUtilization(true);
    const carrierParam = user ? `?carrierId=${user.username}` : '';
    api.get(`/routes${carrierParam}`).then(({ data }) => {
      setRoutes(data);
      if (data.length > 0) {
        setSelectedRoute(data[0].routeId);
        setNewRouteLane(data[0].routeId);
      }
    }).catch(console.error);

    api.get('/auth/drivers').then(({ data }) => {
      setAvailableDrivers(data);
    }).catch(console.error);
  }, [user]);

  const handleRemoveVehicle = async (vehicleId) => {
    if (!window.confirm(`Remove truck ${vehicleId} from fleet?`)) return;
    try {
      await api.delete(`/vehicles/${vehicleId}`);
      fetchUtilization();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove truck.');
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setAddLoading(true); setAddError('');
    try {
      await api.post('/vehicles', {
        vehicleId: newVehicleId,
        type: newType,
        capacityVolume: parseFloat(newVolume),
        capacityWeight: parseFloat(newWeight),
        routeLane: newRouteLane,
        ratePerCbm: parseFloat(ratePerCbm),
        ratePerKg: parseFloat(ratePerKg),
        baseLocation: newBaseLocation,
        assignedDriverId: newAssignedDriverId
      });
      setShowAddModal(false);
      setNewVehicleId(''); setNewType('Heavy Truck'); setNewVolume(100); setNewWeight(20000);
      setRatePerCbm(150); setRatePerKg(5); setNewBaseLocation('Chennai'); setNewAssignedDriverId('');
      fetchUtilization();
    } catch (err) {
      setAddError(err.response?.data?.message || 'Failed to add truck.');
    } finally { setAddLoading(false); }
  };

  const handleEditVehicle = async (e) => {
    e.preventDefault();
    setEditLoading(true); setEditError('');
    try {
      await api.put(`/vehicles/${editVehicle.vehicleId}`, {
        routeLane: editRouteLane,
        ratePerCbm: parseFloat(editRatePerCbm),
        ratePerKg: parseFloat(editRatePerKg),
        assignedDriverId: editAssignedDriverId
      });
      setShowEditModal(false);
      setEditVehicle(null);
      fetchUtilization();
    } catch (err) {
      setEditError(err.response?.data?.message || 'Failed to update truck.');
    } finally { setEditLoading(false); }
  };

  const handleLoadPackage = async (e) => {
    e.preventDefault();
    setLoadLoading(true); setLoadError('');
    try {
      await api.post('/bookings', {
        date: new Date().toISOString().split('T')[0],
        vehicleId: selectedVehicle.vehicleId,
        customerId: selectedCustomer,
        routeId: selectedRoute,
        volume: parseFloat(packageVolume),
        weight: parseFloat(packageWeight),
        status: 'Completed',
      });
      setShowLoadModal(false); setPackageVolume(10); setPackageWeight(2000);
      fetchUtilization();
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load package.');
    } finally { setLoadLoading(false); }
  };

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-600 p-5 rounded-2xl flex items-start space-x-3">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div><h3 className="font-bold text-sm">Fleet Aggregation Error</h3><p className="text-xs mt-1">{error}</p></div>
    </div>
  );

  const sortedVehicles = [...vehicles].sort((a, b) => a.avgVolumeUtilization - b.avgVolumeUtilization);
  const underutilized = sortedVehicles.length > 0 ? sortedVehicles[0] : null;
  const optimized = sortedVehicles.length > 0 ? sortedVehicles[sortedVehicles.length - 1] : null;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Carrier Portal</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Fleet & Occupancy Analysis</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Live fleet capacity utilization and consolidation opportunities.</p>
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          {/* Legend */}
          <div className="flex items-center space-x-4 text-[10px] font-bold text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            {[['bg-green-500','Optimal (≥80%)'],['bg-amber-500','Moderate (65%-79%)'],['bg-red-500','Critical (<65%)']].map(([cls,lbl]) => (
              <span key={lbl} className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${cls} inline-block`} />
                <span>{lbl}</span>
              </span>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[12px] font-bold transition-all duration-150 shadow-md shadow-green-600/20 cursor-pointer border-none"
          >
            <Plus className="w-4 h-4" /><span>Add Truck</span>
          </button>
        </div>
      </div>

      {/* Fleet Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {vehicles.map((veh) => {
          const isOptimal  = veh.statusLevel === 'Optimal';
          const isModerate = veh.statusLevel === 'Moderate';
          const isCritical = veh.statusLevel === 'Underutilized';
          const usedVol = Math.round(veh.capacityVolume * (veh.avgVolumeUtilization / 100));
          const usedWt  = ((veh.capacityWeight * (veh.avgWeightUtilization / 100)) / 1000).toFixed(1);
          const maxWt   = (veh.capacityWeight / 1000).toFixed(1);

          const statusBadgeCls = isOptimal  ? 'bg-green-50 text-green-700 border-green-200' :
                                 isModerate ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                              'bg-red-50 text-red-600 border-red-200';
          const barColor = isOptimal ? '#16a34a' : '#d97706';

          const matchedRoute = routes.find(r => r.routeId === veh.routeLane);
          const stopPath = matchedRoute && matchedRoute.stops ? matchedRoute.stops.join(' → ') : (veh.routeLane || 'Inactive');

          return (
            <div key={veh.vehicleId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
              {/* Header */}
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-[#16a34a]" />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 text-sm">{veh.vehicleId}</h3>
                    <p className="text-[10px] text-gray-400 font-bold mt-0.5">{veh.type} · {stopPath}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusBadgeCls}`}>
                    {isCritical ? 'Underutilized' : veh.statusLevel}
                  </span>
                  <button
                    onClick={() => {
                      setEditVehicle(veh);
                      setEditRouteLane(veh.routeLane || '');
                      setEditRatePerCbm(veh.ratePerCbm || 150);
                      setEditRatePerKg(veh.ratePerKg || 5);
                      setEditAssignedDriverId(veh.assignedDriverId || '');
                      setShowEditModal(true);
                    }}
                    className="px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 rounded-lg text-[10px] font-black transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleRemoveVehicle(veh.vehicleId)}
                    className="text-gray-300 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer border-none bg-transparent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Circular gauges */}
              <div className="flex justify-around items-center mb-5 py-3 border-y border-gray-50">
                <CircularProgress pct={Math.round(veh.avgVolumeUtilization)} label="Volume" sub={`${usedVol}m³/${veh.capacityVolume}m³`} />
                <CircularProgress pct={Math.round(veh.avgWeightUtilization)} label="Weight" sub={`${usedWt}t/${maxWt}t`} />
              </div>

              {/* Progress bars */}
              <div className="space-y-3.5 mb-4 text-[10px] font-bold">
                {[
                  { label: 'Volume utilization', pct: veh.avgVolumeUtilization, color: barColor },
                  { label: 'Weight utilization', pct: veh.avgWeightUtilization, color: '#16a34a' },
                ].map(({ label, pct, color }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-400 font-semibold">{label}</span>
                      <span className="font-black text-gray-700">{Math.round(pct)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-50 pt-4 space-y-3">
                {isCritical && (
                  <div className="flex items-start space-x-2 bg-amber-50 border border-amber-200 p-3 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 font-semibold leading-relaxed">
                      Underutilized by {100 - Math.round(veh.avgVolumeUtilization)}%. Consider consolidating with SMB freight on {veh.routeLane}.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 pb-2 border-b border-gray-50 mb-2">
                  <div>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Volume Rate</span>
                    <span className="font-black text-[#16a34a] text-[12px]">₹{veh.ratePerCbm || 0}/m³</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Weight Rate</span>
                    <span className="font-black text-[#16a34a] text-[12px]">₹{veh.ratePerKg || 0}/kg</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-50 mb-3">
                  <div>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Total Runs</span>
                    <span className="font-black text-gray-900 text-[13px]">{veh.totalTrips} trips</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Underutil. Rate</span>
                    <span className={`font-black text-[13px] ${veh.underutilizationRate > 40 ? 'text-red-500' : 'text-gray-700'}`}>
                      {veh.underutilizationRate}%
                    </span>
                  </div>
                </div>

                {/* Theater-style Volumetric Grid Visualizer */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-wider">
                    <span>Container Load Layout</span>
                    <span className="text-[#16a34a] font-extrabold">{Math.round(veh.avgVolumeUtilization)}% Occupied</span>
                  </div>

                  <div className="grid grid-cols-10 gap-1 p-2.5 bg-slate-50 rounded-xl border border-slate-100 justify-center">
                    {Array.from({ length: 30 }).map((_, i) => {
                      const totalSlots = 30;
                      const occupiedLimit = Math.round((veh.avgVolumeUtilization / 100) * totalSlots);
                      const isOccupied = i < occupiedLimit;

                      return (
                        <div
                          key={i}
                          title={isOccupied ? `Occupied Cargo Slot ${i+1}` : `Empty Available Slot ${i+1}`}
                          className={`w-full aspect-square rounded-sm border flex items-center justify-center transition-all duration-300 ${
                            isOccupied 
                              ? 'bg-green-500 border-green-600 shadow-sm text-white scale-[1.03]' 
                              : 'bg-white border-dashed border-gray-200 text-gray-300 hover:border-green-300 hover:scale-[1.05]'
                          }`}
                        >
                          <div className={`w-1 h-1 rounded-sm ${isOccupied ? 'bg-white/70' : 'bg-transparent'}`} />
                        </div>
                      );
                    })}
                  </div>

                  {/* Grid Legend */}
                  <div className="flex justify-center space-x-4 text-[8px] font-black uppercase tracking-wider text-gray-400 pt-0.5">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded bg-green-500 inline-block border border-green-600" />
                      <span>Loaded Cargo</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded bg-white inline-block border border-dashed border-gray-200" />
                      <span>Available Space</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[13px] font-black text-gray-900 flex items-center space-x-2 mb-1">
          <Activity className="w-4 h-4 text-[#16a34a]" />
          <span>Space Optimization Recommendations</span>
        </h2>
        <p className="text-[11px] text-gray-400 font-semibold mb-5">Algorithmic analysis of underutilized capacity logs.</p>
        
        {vehicles.length === 0 ? (
          <div className="bg-gray-50 border border-gray-100 p-6 rounded-2xl text-center">
            <p className="text-[11px] text-gray-400 font-bold leading-relaxed max-w-md mx-auto">
              No optimization recommendations available yet. Register vehicles in your fleet and dispatch bookings to start generating space optimization insights.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {underutilized && (
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start space-x-3">
                <TrendingDown className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-[12px] text-gray-900">Consolidation Opportunity ({underutilized.vehicleId})</h4>
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold leading-relaxed">
                    {underutilized.vehicleId} ({underutilized.routeLane || 'Inactive Lane'}) averages only {underutilized.avgVolumeUtilization}% volume utilization. Recommend routing SMB packages onto this vehicle to improve fill rate.
                  </p>
                </div>
              </div>
            )}
            {optimized && (
              <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex items-start space-x-3">
                <CheckCircle className="w-4 h-4 text-[#16a34a] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-[12px] text-gray-900">Optimal Lane Performance ({optimized.vehicleId})</h4>
                  <p className="text-[10px] text-gray-500 mt-1 font-semibold leading-relaxed">
                    {optimized.vehicleId} ({optimized.routeLane || 'Inactive Lane'}) runs at {optimized.avgVolumeUtilization}% avg occupancy. Base lane rates are yielding high margins — fully optimized.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────── */}
      {/* Add Truck Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[15px] font-black text-gray-900">Add New Fleet Vehicle</h2>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>
            {addError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2 rounded-xl mb-4">{addError}</div>}
            <form onSubmit={handleAddVehicle} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Vehicle ID</label>
                <input type="text" value={newVehicleId} onChange={e => setNewVehicleId(e.target.value)} placeholder="e.g. TRK-007" required className={inputCls} />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Type</label>
                <select value={newType} onChange={e => { setNewType(e.target.value); if (e.target.value==='Heavy Truck'){setNewVolume(100);setNewWeight(20000);}else if(e.target.value==='Medium Truck'){setNewVolume(50);setNewWeight(10000);}else{setNewVolume(15);setNewWeight(3000);} }} className={inputCls}>
                  <option>Heavy Truck</option><option>Medium Truck</option><option>Light Van</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Volume Cap. (m³)</label>
                  <input type="number" value={newVolume} onChange={e => setNewVolume(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Weight Cap. (kg)</label>
                  <input type="number" value={newWeight} onChange={e => setNewWeight(e.target.value)} required className={inputCls} />
                </div>
              </div>
              
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Assigned Shipping Lane</label>
                <select value={newRouteLane} onChange={e => setNewRouteLane(e.target.value)} required className={inputCls}>
                  {routes.map(r => (
                    <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} → {r.destination}</option>
                  ))}
                  {routes.length === 0 && <option value="">No Active Routes - Create First</option>}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Base Location</label>
                <input type="text" value={newBaseLocation} onChange={e => setNewBaseLocation(e.target.value)} placeholder="e.g. Chennai" required className={inputCls} />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Assigned Driver</label>
                <select value={newAssignedDriverId} onChange={e => setNewAssignedDriverId(e.target.value)} className={inputCls}>
                  <option value="">-- Select Driver (Optional) --</option>
                  {availableDrivers.map(d => (
                    <option key={d.username} value={d.username}>{d.name || d.username} ({d.driverStatus})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rate / m³ (₹)</label>
                  <input type="number" value={ratePerCbm} onChange={e => setRatePerCbm(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rate / kg (₹)</label>
                  <input type="number" value={ratePerKg} onChange={e => setRatePerKg(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <button type="submit" disabled={addLoading} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer mt-1 border-none text-[12px]">
                {addLoading ? 'Adding…' : 'Add Vehicle'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Truck Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[15px] font-black text-gray-900">Edit Truck {editVehicle?.vehicleId}</h2>
              <button onClick={() => setShowEditModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>
            {editError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2 rounded-xl mb-4">{editError}</div>}
            <form onSubmit={handleEditVehicle} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Assigned Shipping Lane</label>
                <select value={editRouteLane} onChange={e => setEditRouteLane(e.target.value)} required className={inputCls}>
                  {routes.map(r => (
                    <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} → {r.destination}</option>
                  ))}
                  {routes.length === 0 && <option value="">No Active Routes - Create First</option>}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Assigned Driver</label>
                <select value={editAssignedDriverId} onChange={e => setEditAssignedDriverId(e.target.value)} className={inputCls}>
                  <option value="">-- Select Driver (Optional) --</option>
                  {availableDrivers.map(d => (
                    <option key={d.username} value={d.username}>{d.name || d.username} ({d.driverStatus})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rate / m³ (₹)</label>
                  <input type="number" value={editRatePerCbm} onChange={e => setEditRatePerCbm(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Rate / kg (₹)</label>
                  <input type="number" value={editRatePerKg} onChange={e => setEditRatePerKg(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <button type="submit" disabled={editLoading} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer mt-1 border-none text-[12px]">
                {editLoading ? 'Updating…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Load Package Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[15px] font-black text-gray-900">Load Package onto {selectedVehicle?.vehicleId}</h2>
              <button onClick={() => setShowLoadModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2.5 rounded-xl mb-4">{loadError}</div>}
            <form onSubmit={handleLoadPackage} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Select Customer</label>
                <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} className={inputCls}>
                  {CUSTOMERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Shipping Lane</label>
                <select value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} className={inputCls}>
                  {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} → {r.destination}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Volume (m³)</label>
                  <input type="number" value={packageVolume} onChange={e => setPackageVolume(e.target.value)} required min="0.1" step="0.1" className={inputCls} />
                </div>
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Weight (kg)</label>
                  <input type="number" value={packageWeight} onChange={e => setPackageWeight(e.target.value)} required min="1" className={inputCls} />
                </div>
              </div>
              <button type="submit" disabled={loadLoading} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer mt-1 border-none text-[12px]">
                {loadLoading ? 'Loading cargo…' : 'Record Cargo Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpaceAnalysis;
