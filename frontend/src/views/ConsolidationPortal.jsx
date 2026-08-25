import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Truck, Box, ArrowRight, Sparkles, Play,
  CheckCircle, RefreshCw, MapPin,
  AlertCircle, Coins, Leaf, Calendar
} from 'lucide-react';

const formatINR = (v) => v != null ? `₹${v.toLocaleString('en-IN')}` : '₹0';

const ConsolidationPortal = () => {
  const { user } = useContext(AuthContext);
  const [routes, setRoutes] = useState([]);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Real database-driven states (network-wide)
  const [shipments, setShipments] = useState([]);
  const [vehicles, setVehicles] = useState([]);

  const [loading, setLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [optResult, setOptResult] = useState(null);

  // Load route lanes on mount
  useEffect(() => {
    setLoading(true);
    api.get('/routes')
      .then(res => {
        setRoutes(res.data);
        loadFromDatabase(dispatchDate, res.data);
      })
      .catch(err => {
        console.error('Fetch error:', err);
        setError('Failed to load route lanes.');
        setLoading(false);
      });
  }, []);

  // Fetch active unassigned bookings and active vehicles network-wide
  const loadFromDatabase = async (dateStr = dispatchDate, lanesList = routes) => {
    setDbLoading(true);
    setError(null);
    setSuccessMsg('');
    try {
      const [vRes, bRes] = await Promise.all([
        api.get('/vehicles'),
        api.get('/bookings')
      ]);

      // Get all active vehicles
      const activeVehicles = vRes.data.filter(v => v.status === 'Active');
      
      const formattedVehicles = activeVehicles.map(v => {
        // Find corresponding route details to fetch stops timeline
        const route = lanesList.find(r => r.routeId === v.routeLane);
        const stops = route ? (route.stops && route.stops.length > 1 ? route.stops : [route.source, route.destination]) : ["Origin", "Destination"];
        return {
          vehicleId: v.vehicleId,
          type: v.type,
          capacityVolume: v.capacityVolume,
          capacityWeight: v.capacityWeight,
          routeStops: stops,
          routeLane: v.routeLane // Keep lane reference to assign to shipments
        };
      });

      // Filter bookings with vehicleId === 'UNASSIGNED', status === 'Pending' for the selected date (network-wide)
      const unassignedBookings = bRes.data.filter(b => {
        const bDateStr = new Date(b.date).toISOString().split('T')[0];
        return b.vehicleId === 'UNASSIGNED' && 
               bDateStr === dateStr &&
               b.status === 'Pending';
      });

      const formattedShipments = unassignedBookings.map(b => ({
        bookingId: b.bookingId,
        volume: b.volume,
        weight: b.weight,
        fromStop: b.fromStop,
        toStop: b.toStop,
        routeId: 'UNASSIGNED'
      }));

      setVehicles(formattedVehicles);
      setShipments(formattedShipments);
      setOptResult(null);

      if (formattedShipments.length === 0) {
        setSuccessMsg(`Network database synchronized. No unassigned bookings found in MongoDB for date ${dateStr}. Use Shipment Manager to book shipments.`);
      } else {
        setSuccessMsg(`Successfully synchronized! Loaded ${formattedShipments.length} pending shipments and ${formattedVehicles.length} active carrier vehicles network-wide.`);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to sync fleet and bookings from MongoDB.");
    } finally {
      setDbLoading(false);
      setLoading(false);
    }
  };

  const handleDateChange = (dateStr) => {
    setDispatchDate(dateStr);
    loadFromDatabase(dateStr);
  };

  // Run the packing optimization model
  const handleRunOptimizer = async () => {
    if (shipments.length === 0) {
      setError('No unassigned shipments found for this date to optimize.');
      return;
    }
    if (vehicles.length === 0) {
      setError('No active fleet vehicles found in the database to allocate cargo.');
      return;
    }

    setOptimizing(true);
    setError(null);
    setSuccessMsg('');

    try {
      const payload = {
        shipments: shipments.map(s => ({
          bookingId: s.bookingId,
          volume: s.volume,
          weight: s.weight,
          routeId: s.routeId,
          fromStop: s.fromStop,
          toStop: s.toStop
        })),
        vehicles: vehicles.map(v => ({
          vehicleId: v.vehicleId,
          capacityVolume: v.capacityVolume,
          capacityWeight: v.capacityWeight,
          type: v.type,
          routeStops: v.routeStops
        }))
      };

      const { data } = await api.post('/predictions/optimize', payload);
      setOptResult(data);
      setSuccessMsg("Consolidation optimized successfully across all matching lanes.");
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'Optimization solver failed.');
    } finally {
      setOptimizing(false);
    }
  };

  // Commit vehicle & route assignments to MongoDB
  const handleApplyAssignments = async () => {
    if (!optResult || optResult.consolidations.length === 0) return;
    setApplying(true);
    setError(null);
    setSuccessMsg('');

    try {
      const assignments = [];
      optResult.consolidations.forEach(c => {
        // Find corresponding vehicle in our state vehicles list to get its routeLane
        const dbVeh = vehicles.find(v => v.vehicleId === c.vehicleId);
        const resolvedRouteId = dbVeh ? dbVeh.routeLane : 'UNASSIGNED';

        c.shipments.forEach(s => {
          assignments.push({
            bookingId: s.bookingId,
            vehicleId: c.vehicleId,
            routeId: resolvedRouteId, // Sets the system-decided route lane!
            status: 'In Transit' // mark as dispatched
          });
        });
      });

      await api.post('/bookings/bulk-update', { assignments });
      setSuccessMsg(`Successfully consolidated and dispatched ${assignments.length} bookings onto optimized carrier trucks in MongoDB.`);
      
      // Reload updated database lists
      loadFromDatabase(dispatchDate);
    } catch (err) {
      console.error(err);
      setError('Failed to apply assignments to MongoDB. Check database connection.');
    } finally {
      setApplying(false);
    }
  };

  const costSaved = optResult ? optResult.metrics.trucksSaved * 12500 : 0;
  const co2Saved = optResult ? optResult.metrics.trucksSaved * 185 : 0;

  if (loading && routes.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span>
            </span>
            <span className="text-[10px] font-black text-green-600 uppercase tracking-[0.18em]">Space Decision Support</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Consolidation & Space Optimizer</h1>
          <p className="text-[12px] text-slate-500 font-semibold mt-0.5">
            Optimize shipping capacity dynamically. The solver matches pending bookings to the best route lane and truck in the network.
          </p>
        </div>

        {/* Date selection control and Database Sync */}
        <div className="flex flex-col sm:flex-row gap-4 items-end w-full sm:w-auto shrink-0">
          <div className="space-y-1 w-full sm:w-56">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Dispatch Date</label>
            <input 
              type="date"
              value={dispatchDate}
              onChange={e => handleDateChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 text-[12px] font-bold h-[38px]"
            />
          </div>
          
          <button
            onClick={() => loadFromDatabase(dispatchDate)}
            disabled={dbLoading}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer border-none disabled:opacity-50 shadow-md shadow-green-600/10 h-[38px] shrink-0 font-bold"
          >
            {dbLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync DB</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-start space-x-3 text-[12px] font-bold">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-2xl flex items-start space-x-3 text-[12px] font-bold">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-green-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Unified Manifest Summary Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Card: Pending Shipments Manifest */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-50 pb-3">
            <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Box className="w-4.5 h-4.5 text-green-600" />
              <span>Pending Shipments Manifest ({shipments.length})</span>
            </h2>
            <span className="text-[10px] bg-amber-50 text-amber-700 font-extrabold px-2 py-0.5 rounded-full">
              Requires Allocation
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-[11px] font-bold text-slate-700">
            {shipments.map(s => (
              <div key={s.bookingId} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-slate-200 transition">
                <div>
                  <p className="text-slate-850 font-black">{s.bookingId}</p>
                  <p className="text-slate-400 font-semibold mt-0.5">
                    {s.volume} m³ / {s.weight} kg • <span className="text-green-600">{s.fromStop} ➔ {s.toStop}</span>
                  </p>
                </div>
                <span className="text-[10px] text-green-700 bg-white border border-green-150 px-2 py-0.5 rounded shadow-sm">
                  Unrouted
                </span>
              </div>
            ))}
            {shipments.length === 0 && (
              <div className="text-center text-slate-400 font-bold py-12 space-y-1">
                <p>No unassigned shipments on this date.</p>
                <p className="text-[10px] text-slate-350 font-semibold">Book new shipments in the Shipment Manager tab.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Card: Available Active Fleet */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-50 pb-3">
            <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Truck className="w-4.5 h-4.5 text-green-600" />
              <span>Available Active Fleet ({vehicles.length})</span>
            </h2>
            <span className="text-[10px] bg-green-50 text-green-700 font-extrabold px-2 py-0.5 rounded-full">
              Network Active
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-[11px] font-bold text-slate-700">
            {vehicles.map(v => (
              <div key={v.vehicleId} className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-slate-200 transition">
                <div>
                  <p className="text-slate-850 font-black">{v.vehicleId} • <span className="text-green-600">{v.type}</span></p>
                  <p className="text-slate-400 font-semibold mt-0.5">
                    Lanes: {v.routeLane} • Limits: {v.capacityVolume} m³ / {v.capacityWeight} kg
                  </p>
                </div>
                <span className="text-[10px] text-slate-450 font-semibold">
                  Carrier Ready
                </span>
              </div>
            ))}
            {vehicles.length === 0 && (
              <div className="text-center text-slate-400 font-bold py-12 space-y-1">
                <p>No active vehicles registered in MongoDB.</p>
                <p className="text-[10px] text-slate-350 font-semibold">Activate carrier trucks in the Fleet Analytics tab.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Central Run Optimizer button */}
      <div className="flex justify-center py-2">
        <button
          onClick={handleRunOptimizer}
          disabled={optimizing || shipments.length === 0 || vehicles.length === 0}
          className="w-full md:w-80 bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs py-4 px-6 rounded-2xl transition shadow-lg shadow-green-600/25 flex items-center justify-center space-x-2 border-none cursor-pointer disabled:opacity-50"
        >
          {optimizing ? (
            <RefreshCw className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <>
              <Play className="w-4.5 h-4.5" />
              <span>Run Automated Space Optimization</span>
            </>
          )}
        </button>
      </div>

      {/* Output Results Panel */}
      {optResult ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Commit and Dispatch action banner */}
          <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs font-bold text-emerald-800 space-y-0.5">
              <p className="font-extrabold text-sm flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Optimal Routing & Packing Decided!</span>
              </p>
              <p className="text-[11px] font-semibold text-emerald-600 leading-relaxed">
                Heuristic solver completed multi-route packing. Click dispatch to save route and vehicle allocations in MongoDB.
              </p>
            </div>
            <button
              onClick={handleApplyAssignments}
              disabled={applying}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold text-[11px] px-5 py-3 rounded-xl transition cursor-pointer border-none shrink-0 disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-md shadow-green-600/10 font-bold"
            >
              {applying ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Commit & Dispatch Fleet</span>
                </>
              )}
            </button>
          </div>

          {/* Executive KPI summary panels */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* trucks saved */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                <Truck className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Trucks Saved</span>
                <span className="text-xl font-black text-slate-800">{optResult.metrics.trucksSaved}</span>
              </div>
            </div>

            {/* cost saved */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Coins className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Estimated Savings</span>
                <span className="text-xl font-black text-slate-800">{formatINR(costSaved)}</span>
              </div>
            </div>

            {/* carbon saved */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center space-x-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Leaf className="w-5.5 h-5.5" />
              </div>
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">CO2 Saved</span>
                <span className="text-xl font-black text-slate-800">{co2Saved} kg</span>
              </div>
            </div>
          </div>

          {/* consolidation details */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Optimized Bin Packing Placements</h3>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Leg-by-leg truck occupancy configurations</p>
            </div>

            <div className="space-y-6">
              {optResult.consolidations.map(c => {
                // Find matching vehicle to show its routeLane in results
                const routeId = vehicles.find(v => v.vehicleId === c.vehicleId)?.routeLane || 'UNASSIGNED';

                return (
                  <div key={c.vehicleId} className="border border-slate-100 rounded-2xl p-5 space-y-4">
                    
                    {/* Truck name & peak occupancies */}
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="bg-green-50 text-green-700 text-[10px] font-black px-2 py-1 rounded-md uppercase tracking-wider">
                          {c.type}
                        </span>
                        <span className="text-xs font-black text-slate-800">{c.vehicleId}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">
                          Lane: {routeId}
                        </span>
                      </div>
                      <div className="flex space-x-4 text-[10px] font-black text-slate-500">
                        <span>Peak Vol: <span className="text-green-600">{c.peakVolumeUtilizationPercent}%</span></span>
                        <span>Peak Wt: <span className="text-green-600">{c.peakWeightUtilizationPercent}%</span></span>
                      </div>
                    </div>

                    {/* Leg-by-leg detail cards */}
                    <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Capacity state per route leg</p>
                      {c.legs.map((leg, legIdx) => (
                        <div key={legIdx} className="grid grid-cols-12 gap-3 items-center text-[10px] font-bold py-1.5 border-b border-slate-100/50 last:border-b-0">
                          
                          {/* Leg Name */}
                          <div className="col-span-4 text-slate-600 flex items-center space-x-1">
                            <span className="truncate">{leg.fromStop}</span>
                            <ArrowRight className="w-3.5 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{leg.toStop}</span>
                          </div>

                          {/* Volume bar */}
                          <div className="col-span-4 space-y-0.5">
                            <div className="flex justify-between text-[8px] text-slate-400">
                              <span>Vol: {leg.volumeUtilizationPercent}%</span>
                              <span>Rem: {leg.remainingVolume} m³</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-green-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${leg.volumeUtilizationPercent}%` }}
                              />
                            </div>
                          </div>

                          {/* Weight bar */}
                          <div className="col-span-4 space-y-0.5">
                            <div className="flex justify-between text-[8px] text-slate-400">
                              <span>Wt: {leg.weightUtilizationPercent}%</span>
                              <span>Rem: {leg.remainingWeight} kg</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-green-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${leg.weightUtilizationPercent}%` }}
                              />
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>

                    {/* Packed Shipments in LIFO order */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <span>Loaded Packages (LIFO Sequence)</span>
                        <span className="text-green-600 italic">Pack rear to front</span>
                      </div>
                      
                      {/* Theater slot grid for vehicle load layout */}
                      <div className="grid grid-cols-10 gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100 justify-center mb-3">
                        {Array.from({ length: 20 }).map((_, i) => {
                          const totalSlots = 20;
                          const occupiedLimit = Math.round((c.peakVolumeUtilizationPercent / 100) * totalSlots);
                          const isOccupied = i < occupiedLimit;

                          return (
                            <div
                              key={i}
                              title={isOccupied ? `Occupied Capacity` : `Available Space`}
                              className={`w-full aspect-square rounded-sm border flex items-center justify-center transition-all duration-300 ${
                                isOccupied 
                                  ? 'bg-green-500 border-green-600 shadow-sm' 
                                  : 'bg-white border-dashed border-gray-200'
                              }`}
                            />
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {c.shipments.map((s, sIdx) => (
                          <div key={s.bookingId} className="bg-white border border-slate-100 p-3 rounded-xl flex items-center space-x-2 text-[10px] font-bold shadow-sm relative overflow-hidden">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
                            <span className="text-slate-400 font-extrabold text-[9px] shrink-0 bg-slate-50 w-5 h-5 rounded-md flex items-center justify-center">
                              {sIdx + 1}
                            </span>
                            <div className="truncate">
                              <p className="text-slate-800 font-extrabold truncate">{s.bookingId}</p>
                              <p className="text-slate-400 truncate">
                                {s.volume} m³ / {s.weight} kg • <span className="text-green-500">{s.fromStop}➔{s.toStop}</span>
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* leftover / unassigned cargo block */}
          {optResult.unassignedShipments.length > 0 && (
            <div className="bg-red-50/50 rounded-2xl border border-red-100/50 p-6 space-y-4">
              <h3 className="text-sm font-extrabold text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4.5 h-4.5 text-red-600" />
                <span>Unassigned Cargo Backlog ({optResult.unassignedShipments.length})</span>
              </h3>
              <p className="text-[10px] text-red-500 font-bold">Cargo that exceeded active fleet capacities across the route legs</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {optResult.unassignedShipments.map(s => (
                  <div key={s.bookingId} className="bg-white border border-red-100/30 p-3 rounded-xl flex items-center justify-between text-[10px] font-bold shadow-sm">
                    <div>
                      <p className="text-slate-800 font-extrabold">{s.bookingId}</p>
                      <p className="text-slate-500 font-semibold">
                        {s.volume} m³ / {s.weight} kg • <span className="text-red-500">{s.fromStop} ➔ {s.toStop}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center text-center space-y-4 min-h-[300px]">
          <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center text-green-600 shadow-md shadow-green-600/10">
            <Sparkles className="w-7 h-7 animate-pulse" />
          </div>
          <div className="max-w-md space-y-1.5">
            <h3 className="text-base font-extrabold text-slate-800">Awaiting Capacity Dispatch Optimization</h3>
            <p className="text-[12px] text-slate-500 font-semibold leading-relaxed">
              Verify your Dispatch Date above. Click the run button to automatically allocate all pending bookings onto optimized fleet trucks and assign their route lanes.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};

export default ConsolidationPortal;
