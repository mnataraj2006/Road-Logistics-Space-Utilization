import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Navigation, IndianRupee, TrendingUp, Compass, 
  AlertTriangle, Plus, X, MapPin, Edit2, Trash2, QrCode 
} from 'lucide-react';

const formatINR = (v) => {
  if (v == null) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
};
const shortINR = (v) => {
  if (v == null) return '₹0';
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)} K`;
  return `₹${v}`;
};

const YIELD = {
  inactive: { badge: 'Inactive Lane',    badgeCls: 'bg-gray-100 text-gray-500 border-gray-200',   border: 'border-gray-100 opacity-70' },
  low:      { badge: 'Low Yield',        badgeCls: 'bg-red-50 text-red-600 border-red-200',        border: 'border-gray-100' },
  moderate: { badge: 'Moderate Yield',   badgeCls: 'bg-amber-50 text-amber-700 border-amber-200',  border: 'border-amber-100' },
  high:     { badge: 'High Yield Lane',  badgeCls: 'bg-green-50 text-green-700 border-green-200',  border: 'border-green-100' },
};

const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[11px] font-semibold';

const RoutesRevenue = () => {
  const [routes,  setRoutes]  = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Re-organization layout tab states
  const [activeTab, setActiveTab] = useState('lanes'); // 'lanes' | 'performance'
  const [yieldSubTab, setYieldSubTab] = useState('lane'); // 'lane' | 'city'

  // Route creation form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [distance, setDistance] = useState(150);
  const [baseRate, setBaseRate] = useState(30000);
  const [stopsStr, setStopsStr] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [selectedQRStop, setSelectedQRStop] = useState(null);

  // Route edit form state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editRouteId, setEditRouteId] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editDistance, setEditDistance] = useState(150);
  const [editBaseRate, setEditBaseRate] = useState(30000);
  const [editStopsStr, setEditStopsStr] = useState('');

  const fetchRoutes = () => {
    setLoading(true);
    Promise.all([
      api.get('/routes/analytics/performance'),
      api.get('/bookings?limit=1000')
    ])
      .then(([routesRes, bookingsRes]) => {
        setRoutes(routesRes.data);
        setBookings(bookingsRes.data);
      })
      .catch(err => { 
        console.error(err); 
        setError('Failed to load shipping lane performance. Verify database connections.'); 
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const intermediate = stopsStr ? stopsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      const stops = [source.trim(), ...intermediate, destination.trim()];

      await api.post('/routes', {
        routeId: routeId.trim(),
        source: source.trim(),
        destination: destination.trim(),
        distance: parseFloat(distance),
        baseRate: parseFloat(baseRate),
        stops
      });

      // Clear form
      setRouteId('');
      setSource('');
      setDestination('');
      setDistance(150);
      setBaseRate(30000);
      setStopsStr('');
      setShowAddForm(false);
      
      // Refresh list
      fetchRoutes();
      alert('Operating shipping lane registered successfully.');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to register shipping lane.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteRoute = async (id) => {
    if (!window.confirm(`Are you sure you want to delete route ${id}? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.delete(`/routes/${id}`);
      fetchRoutes();
      alert(`Shipping lane ${id} removed successfully.`);
    } catch (err) {
      alert(err.response?.data?.message || `Failed to delete shipping lane ${id}.`);
    }
  };

  const handleEditClick = (route) => {
    setEditRouteId(route.routeId);
    setEditSource(route.source);
    setEditDestination(route.destination);
    setEditDistance(route.distance);
    setEditBaseRate(route.baseRate);
    setEditStopsStr(route.stops ? route.stops.filter(s => s !== route.source && s !== route.destination).join(', ') : '');
    setFormError('');
    setShowEditForm(true);
  };

  const handleUpdateRoute = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const intermediate = editStopsStr ? editStopsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
      const stops = [editSource.trim(), ...intermediate, editDestination.trim()];

      await api.put(`/routes/${editRouteId}`, {
        source: editSource.trim(),
        destination: editDestination.trim(),
        distance: parseFloat(editDistance),
        baseRate: parseFloat(editBaseRate),
        stops
      });

      setShowEditForm(false);
      fetchRoutes();
      alert('Shipping lane updated successfully.');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to update shipping lane.');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) return (
    <div className="h-[60vh] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-600 p-5 rounded-2xl flex items-start space-x-3">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div><h3 className="font-bold text-sm">Route Analytics Error</h3><p className="text-xs mt-1">{error}</p></div>
    </div>
  );

  const getCityList = () => {
    const cityMetrics = {};
    bookings.forEach(b => {
      if (b.fromStop) {
        if (!cityMetrics[b.fromStop]) {
          cityMetrics[b.fromStop] = { city: b.fromStop, loadedVolume: 0, unloadedVolume: 0, loadedWeight: 0, bookingsSourced: 0, revenueSourced: 0 };
        }
        cityMetrics[b.fromStop].loadedVolume += b.volume;
        cityMetrics[b.fromStop].loadedWeight += b.weight;
        cityMetrics[b.fromStop].bookingsSourced += 1;
        cityMetrics[b.fromStop].revenueSourced += b.revenue;
      }
      if (b.toStop) {
        if (!cityMetrics[b.toStop]) {
          cityMetrics[b.toStop] = { city: b.toStop, loadedVolume: 0, unloadedVolume: 0, loadedWeight: 0, bookingsSourced: 0, revenueSourced: 0 };
        }
        cityMetrics[b.toStop].unloadedVolume += b.volume;
      }
    });
    return Object.values(cityMetrics).sort((a, b) => b.revenueSourced - a.revenueSourced);
  };
  const cityList = getCityList();

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Carrier Portal</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Route & Revenue Analytics</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Define your operating lanes and monitor yield performance indices.</p>
        </div>

        {/* Action button & Legend */}
        {activeTab === 'lanes' && (
          <div className="flex items-center space-x-3 flex-wrap gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center space-x-2 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[12px] font-bold transition-all duration-150 shadow-md shadow-green-600/20 cursor-pointer border-none"
            >
              <Plus className="w-4 h-4" />
              <span>Create Route Lane</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('lanes')}
          className={`py-2.5 px-5 font-bold text-xs border-b-2 transition-all border-none bg-transparent cursor-pointer ${
            activeTab === 'lanes'
              ? 'border-[#16a34a] text-[#16a34a] border-solid'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Operating Lanes
        </button>
        <button
          onClick={() => setActiveTab('performance')}
          className={`py-2.5 px-5 font-bold text-xs border-b-2 transition-all border-none bg-transparent cursor-pointer ${
            activeTab === 'performance'
              ? 'border-[#16a34a] text-[#16a34a] border-solid'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          Yield Performance Reports
        </button>
      </div>

      {/* Collapsible Create Route Form Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[14px] font-black text-gray-900">Define Carrier Shipping Lane</h2>
              <button onClick={() => setShowAddForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-3">{formError}</div>}

            <form onSubmit={handleCreateRoute} className="space-y-3.5 text-[10px] font-semibold">
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Route ID</label>
                <input type="text" value={routeId} onChange={e => setRouteId(e.target.value)} placeholder="e.g. RTE-009" required className={inputCls} />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Origin City</label>
                  <input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. Mumbai" required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Destination City</label>
                  <input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Bengaluru" required className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Intermediate Stops (comma-separated)</label>
                <input type="text" value={stopsStr} onChange={e => setStopsStr(e.target.value)} placeholder="e.g. Thane, Lonavala" className={inputCls} />
                <span className="text-[9px] text-gray-400 block mt-1">Order stops chronologically along the dispatch lane.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Distance (km)</label>
                  <input type="number" value={distance} onChange={e => setDistance(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Price / m³ (₹)</label>
                  <input type="number" value={baseRate} onChange={e => setBaseRate(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <button type="submit" disabled={formLoading} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer border-none text-[12px]">
                {formLoading ? 'Registering Shipping Lane...' : 'Register Lane'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Collapsible Edit Route Form Modal */}
      {showEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[14px] font-black text-gray-900">Edit Carrier Shipping Lane</h2>
              <button onClick={() => setShowEditForm(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-3">{formError}</div>}

            <form onSubmit={handleUpdateRoute} className="space-y-3.5 text-[10px] font-semibold">
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Route ID (read-only)</label>
                <input type="text" value={editRouteId} disabled className="w-full bg-gray-100 border border-gray-200 px-3 py-2 rounded-xl text-gray-400 text-[11px] font-semibold cursor-not-allowed outline-none" />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Origin City</label>
                  <input type="text" value={editSource} onChange={e => setEditSource(e.target.value)} placeholder="e.g. Mumbai" required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Destination City</label>
                  <input type="text" value={editDestination} onChange={e => setEditDestination(e.target.value)} placeholder="e.g. Bengaluru" required className={inputCls} />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Intermediate Stops (comma-separated)</label>
                <input type="text" value={editStopsStr} onChange={e => setEditStopsStr(e.target.value)} placeholder="e.g. Thane, Lonavala" className={inputCls} />
                <span className="text-[9px] text-gray-400 block mt-1">Order stops chronologically along the dispatch lane.</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Distance (km)</label>
                  <input type="number" value={editDistance} onChange={e => setEditDistance(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Price / m³ (₹)</label>
                  <input type="number" value={editBaseRate} onChange={e => setEditBaseRate(e.target.value)} required className={inputCls} />
                </div>
              </div>

              <button type="submit" disabled={formLoading} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer border-none text-[12px]">
                {formLoading ? 'Saving Shipping Lane Changes...' : 'Save Lane Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT ─────────────────────────────────── */}
      {routes.length === 0 ? (
        <div className="min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white p-6">
          <div className="text-center text-gray-400 max-w-sm text-[12px] font-semibold">
            <Navigation className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p>No active shipping lanes found. Click "Create Route Lane" above to start operating your route networks.</p>
          </div>
        </div>
      ) : activeTab === 'lanes' ? (
        /* TAB 1: OPERATING LANES (Cleaner Cards + Edit/Delete Actions) */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {routes.map((route) => (
            <div key={route.routeId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative hover:shadow-md transition-all duration-200 flex flex-col justify-between">
              <div>
                <div className="flex items-start space-x-3 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Navigation className="w-4 h-4 text-[#16a34a]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <span className="font-black text-gray-900 text-sm">{route.source}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="font-black text-gray-900 text-sm">{route.destination}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold tracking-wide font-mono mt-0.5">
                      {route.routeId} · {route.distance} km
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 p-3.5 rounded-xl mb-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider">Base Tariff Rate:</span>
                    <span className="text-gray-800 font-bold">{shortINR(route.baseRate)} / m³</span>
                  </div>
                  {route.stopsDetails && route.stopsDetails.length > 0 ? (
                    <div className="pt-2.5 border-t border-gray-200/50">
                      <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider block mb-1.5">Operating Route Stops Details:</span>
                      <div className="space-y-1">
                        {route.stopsDetails.map((stop) => (
                          <div key={stop.stopId || stop.locationName} className="flex items-center justify-between bg-white border border-gray-100 px-2 py-1 rounded text-[10px] text-gray-700">
                            <span className="font-bold">{stop.sequenceNumber}. {stop.locationName}</span>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{stop.stopType.replace('_', ' ')}</span>
                              <button 
                                onClick={() => setSelectedQRStop(stop)}
                                className="bg-transparent border-none text-[#16a34a] hover:text-[#15803d] p-0 font-bold cursor-pointer text-[9px] flex items-center shrink-0"
                                title="View Stop QR"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : route.stops && route.stops.length > 0 && (
                    <div className="pt-2 border-t border-gray-200/50">
                      <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider block mb-1">Stops:</span>
                      <div className="flex items-center flex-wrap gap-1 leading-none">
                        {route.stops.map((stop, i) => (
                          <span key={stop} className="text-gray-700 bg-white border border-gray-100 px-1.5 py-0.5 rounded text-[9.5px]">
                            {stop}
                            {i < route.stops.length - 1 && <span className="text-gray-300 ml-1">→</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 mt-2 pt-3 border-t border-gray-100">
                <button 
                  onClick={() => handleEditClick(route)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 text-gray-500 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg text-[10px] font-black transition-all cursor-pointer border-solid"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Edit Lane</span>
                </button>
                <button 
                  onClick={() => handleDeleteRoute(route.routeId)}
                  className="flex items-center space-x-1 px-2.5 py-1.5 text-gray-500 hover:text-red-600 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-lg text-[10px] font-black transition-all cursor-pointer border-solid"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Lane</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TAB 2: YIELD PERFORMANCE REPORTS */
        <div className="space-y-6">
          {/* Sub-tab Selection bar */}
          <div className="flex bg-gray-100 p-1 rounded-xl w-fit space-x-1 border border-gray-200/50">
            <button
              onClick={() => setYieldSubTab('lane')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black border-none cursor-pointer ${
                yieldSubTab === 'lane' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Lane-wise Yield
            </button>
            <button
              onClick={() => setYieldSubTab('city')}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black border-none cursor-pointer ${
                yieldSubTab === 'city' ? 'bg-white text-gray-900 shadow-sm' : 'bg-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              City-hub Yield
            </button>
          </div>

          {yieldSubTab === 'lane' ? (
            /* Sub-tab A: Lane-wise Yield Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {routes.map((route) => {
                const margin = route.profitMargin || 0;
                const tier = route.totalBookings === 0 ? 'inactive' : margin >= 50 ? 'high' : margin >= 25 ? 'moderate' : 'low';
                const { badge, badgeCls, border } = YIELD[tier];

                return (
                  <div key={route.routeId} className={`bg-white rounded-2xl border ${border} shadow-sm p-6 relative hover:shadow-md transition-all duration-200`}>
                    <span className={`absolute top-5 right-5 border px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${badgeCls}`}>
                      {badge}
                    </span>

                    <div className="flex items-start space-x-3 mb-5">
                      <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Navigation className="w-4 h-4 text-[#16a34a]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          <span className="font-black text-gray-900 text-sm">{route.source}</span>
                          <span className="text-gray-400 text-xs">→</span>
                          <span className="font-black text-gray-900 text-sm">{route.destination}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold tracking-wide font-mono mt-0.5">
                          {route.routeId} · {route.distance} km
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 bg-gray-50 border border-gray-100 p-3.5 rounded-xl mb-4 text-[10px] font-semibold">
                      {[
                        { label: 'Revenue',   value: formatINR(route.totalRevenue),    cls: 'text-gray-900'   },
                        { label: 'Op. Cost',  value: formatINR(route.totalCost),       cls: 'text-red-500'    },
                        { label: 'Net Profit',value: formatINR(route.totalProfit),      cls: 'text-[#16a34a]'  },
                        { label: 'Bookings',  value: route.totalBookings,              cls: 'text-gray-700'   },
                        { label: 'Volume',    value: `${route.totalVolume?.toLocaleString()} m³`, cls: 'text-gray-700' },
                        { label: 'Base Rate', value: shortINR(route.baseRate),         cls: 'text-blue-600'   },
                      ].map(({ label, value, cls }, i) => (
                        <div key={label} className={i > 2 ? 'pt-2.5 border-t border-gray-200' : ''}>
                          <span className="text-gray-400 block font-black mb-0.5 uppercase tracking-wider text-[8px]">{label}</span>
                          <span className={`font-black text-[12px] ${cls}`}>{value}</span>
                          {label === 'Net Profit' && (
                            <span className="text-[9px] font-semibold text-gray-400 block mt-0.5">{route.profitMargin}% margin</span>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[10px] border-t border-gray-50 pt-4 font-semibold">
                      {[
                        { icon: IndianRupee, label: 'Avg Order',         value: shortINR(route.avgRevenuePerBooking) },
                        { icon: TrendingUp,  label: 'Avg Profit/Order',  value: shortINR(route.avgProfitPerBooking) },
                        { icon: Compass,     label: 'Avg Space/Order',   value: `${route.avgLoadVolume} m³` },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start space-x-2">
                          <Icon className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-gray-400 block font-black uppercase tracking-wider text-[8px]">{label}</span>
                            <span className="font-black text-gray-800 mt-0.5 block">{value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Sub-tab B: City-hub Yield Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {cityList.length === 0 ? (
                <p className="text-[11px] text-gray-400 font-semibold py-8 col-span-3 text-center">No city activities recorded yet. Complete shipments to view city yields.</p>
              ) : cityList.map(item => {
                const isExporter = item.loadedVolume > item.unloadedVolume;
                return (
                  <div key={item.city} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative hover:shadow-md transition-all duration-200 flex flex-col justify-between">
                    <div>
                      <span className={`absolute top-5 right-5 border px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider ${
                        isExporter ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {isExporter ? 'Net Exporter' : 'Net Importer'}
                      </span>
                      
                      <div className="flex items-start space-x-3 mb-5">
                        <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                          <MapPin className="w-4 h-4 text-gray-400" />
                        </div>
                        <div>
                          <h3 className="font-black text-gray-900 text-sm leading-none">{item.city}</h3>
                          <p className="text-[9px] text-gray-400 font-extrabold tracking-wide mt-1.5 uppercase">Hub Yield Index</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-100 p-3.5 rounded-xl text-[10px] font-semibold mb-4">
                        <div>
                          <span className="text-gray-400 block font-black mb-0.5 uppercase tracking-wider text-[8px]">Revenue Sourced</span>
                          <span className="font-black text-[12px] text-gray-900">{formatINR(item.revenueSourced)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block font-black mb-0.5 uppercase tracking-wider text-[8px]">Bookings Sourced</span>
                          <span className="font-black text-[12px] text-gray-700">{item.bookingsSourced} trips</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-[10.5px] font-bold text-gray-500 border-t border-gray-100 pt-3.5">
                      <div className="flex justify-between">
                        <span>Cargo Loaded at Stop:</span>
                        <span className="text-gray-800 font-extrabold">{item.loadedVolume.toFixed(1)} m³ / {item.loadedWeight.toLocaleString()} kg</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cargo Unloaded at Stop:</span>
                        <span className="text-gray-800 font-extrabold">{item.unloadedVolume.toFixed(1)} m³</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* STOP QR CODE DISPLAY MODAL / LIGHTBOX */}
      {selectedQRStop && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-150 max-w-sm w-full p-6 space-y-5 shadow-2xl relative">
            <div className="text-center">
              <span className="text-[9px] font-black text-[#16a34a] bg-green-50 px-2 py-0.5 rounded-full border border-green-200 uppercase tracking-widest">
                Stop QR Reference
              </span>
              <h3 className="text-lg font-black text-gray-900 mt-2">{selectedQRStop.locationName}</h3>
              <p className="text-[10px] font-semibold text-gray-400 mt-0.5">Stop Sequence #{selectedQRStop.sequenceNumber} • {selectedQRStop.stopType}</p>
            </div>

            <div className="w-48 h-48 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm p-4">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${selectedQRStop.qrToken}`}
                alt={`QR code for stop ${selectedQRStop.locationName}`}
                className="w-full h-full object-contain"
              />
            </div>

            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block text-center">Stop Verification Token</span>
              <span className="block font-mono font-bold text-gray-800 text-[12px] text-center select-all mt-1">{selectedQRStop.qrToken}</span>
            </div>

            <button
              onClick={() => setSelectedQRStop(null)}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-[12px] font-black transition-colors border-none cursor-pointer text-center block"
            >
              Close Stop Window
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoutesRevenue;
