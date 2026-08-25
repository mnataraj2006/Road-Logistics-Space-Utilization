import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Server, Cpu, Database, Network, Activity,
  CheckCircle, AlertTriangle, RefreshCw, Terminal,
  Plus, Trash2, Navigation, MapPin
} from 'lucide-react';

const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold';

const AdminSystem = () => {
  const [expressStatus, setExpressStatus] = useState('Checking...');
  const [fastApiStatus, setFastApiStatus] = useState('Checking...');
  const [dbStatus, setDbStatus] = useState('Checking...');
  const [pingTime, setPingTime] = useState(null);
  const [loading, setLoading] = useState(false);

  // Route builder state
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeId, setRouteId] = useState('');
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [distance, setDistance] = useState(150);
  const [baseRate, setBaseRate] = useState(30000);
  const [stopsStr, setStopsStr] = useState(''); // Comma-separated intermediate stops
  const [errorMsg, setErrorMsg] = useState('');

  const fetchRoutes = async () => {
    setRoutesLoading(true);
    try {
      const { data } = await api.get('/routes');
      setRoutes(data);
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      setRoutesLoading(false);
    }
  };

  const checkHealth = async () => {
    setLoading(true);
    const start = performance.now();
    try {
      const res = await api.get('/bookings/analytics/kpis');
      if (res.status === 200) {
        setExpressStatus('Online');
        setDbStatus('Connected');
      } else {
        setExpressStatus('Degraded');
      }
    } catch {
      setExpressStatus('Offline');
      setDbStatus('Disconnected');
    }

    try {
      const res = await api.post('/predictions/demand', { route_id: 'RTE-001', days_ahead: 1 });
      if (res.status === 200) {
        setFastApiStatus('Online');
      } else {
        setFastApiStatus('Offline');
      }
    } catch {
      setFastApiStatus('Offline');
    }
    
    setPingTime(Math.round(performance.now() - start));
    setLoading(false);
  };

  useEffect(() => {
    checkHealth();
    fetchRoutes();
  }, []);

  const handleFactoryReset = () => {
    if (!window.confirm('Wipe all simulated database tables (vehicles, routes, bookings, payments, and users) and restore only the default credentials? This is irreversible.')) return;
    localStorage.clear();
    localStorage.setItem('db_users', JSON.stringify([
      { _id: 'usr_admin', username: 'admin', email: 'admin@roadlogistics.com', password: 'admin123', role: 'admin' },
      { _id: 'usr_manager', username: 'manager', email: 'manager@roadlogistics.com', password: 'admin123', role: 'carrier' },
      { _id: 'usr_carrier2', username: 'carrier2', email: 'carrier2@roadlogistics.com', password: 'admin123', role: 'carrier' },
      { _id: 'usr_shipper', username: 'shipper', email: 'shipper@roadlogistics.com', password: 'admin123', role: 'shipper' }
    ]));
    localStorage.setItem('db_routes', JSON.stringify([
      { routeId: 'RTE-001', source: 'Mumbai', destination: 'Pune', distance: 148, baseRate: 34500, stops: ['Mumbai', 'Thane', 'Lonavala', 'Pune'], carrierId: 'manager' },
      { routeId: 'RTE-002', source: 'Bengaluru', destination: 'Chennai', distance: 346, baseRate: 48000, stops: ['Bengaluru', 'Hosur', 'Chennai'], carrierId: 'carrier2' }
    ]));
    localStorage.setItem('db_vehicles', JSON.stringify([
      { vehicleId: 'TRK-001', type: 'Heavy Truck', capacityVolume: 100, capacityWeight: 20000, status: 'Active', carrierId: 'manager', routeLane: 'RTE-001', ratePerCbm: 150, ratePerKg: 5 },
      { vehicleId: 'TRK-002', type: 'Medium Truck', capacityVolume: 50, capacityWeight: 10000, status: 'Active', carrierId: 'manager', routeLane: 'RTE-001', ratePerCbm: 120, ratePerKg: 4 },
      { vehicleId: 'TRK-003', type: 'Heavy Truck', capacityVolume: 100, capacityWeight: 20000, status: 'Active', carrierId: 'carrier2', routeLane: 'RTE-002', ratePerCbm: 180, ratePerKg: 6 },
      { vehicleId: 'TRK-004', type: 'Light Van', capacityVolume: 15, capacityWeight: 3000, status: 'Active', carrierId: 'carrier2', routeLane: 'RTE-002', ratePerCbm: 100, ratePerKg: 3 }
    ]));
    localStorage.setItem('db_bookings', JSON.stringify([]));
    localStorage.setItem('db_payments', JSON.stringify([]));
    alert('Simulated database successfully wiped clean and reset to default credentials.');
    window.location.reload();
  };

  const handleAddRoute = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      // Assemble stops array: starts with source, followed by intermediate stops, ends with destination
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

      // Reset form
      setRouteId('');
      setSource('');
      setDestination('');
      setDistance(150);
      setBaseRate(30000);
      setStopsStr('');
      fetchRoutes();
      alert('Route lane created successfully!');
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to add route.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Admin Console</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">System Health & Diagnostics</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Audit developer endpoints, FastAPI server nodes, and database cluster metrics.</p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleFactoryReset}
            className="flex items-center space-x-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[12px] font-bold transition-all duration-150 border border-red-200 cursor-pointer shadow-sm shadow-red-100"
          >
            <span>Reset Database</span>
          </button>
          <button
            onClick={checkHealth}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white rounded-xl text-[12px] font-bold transition-all duration-150 shadow-md shadow-green-600/20 cursor-pointer border-none"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Pinging Services...' : 'Refresh Health'}</span>
          </button>
        </div>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Node Express */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Server className="w-5 h-5" />
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
              expressStatus === 'Online' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
            }`}>{expressStatus}</span>
          </div>
          <div>
            <h3 className="font-black text-gray-900 text-sm">Node Express API</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">REST Services • Port 5000</p>
            <div className="border-t border-gray-50 mt-4 pt-3 flex justify-between text-[11px] font-semibold text-gray-500">
              <span>Ping latency:</span>
              <span className="font-black text-gray-900">{pingTime ? `${pingTime}ms` : 'Checking...'}</span>
            </div>
          </div>
        </div>

        {/* FastAPI */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
              fastApiStatus === 'Online' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
            }`}>{fastApiStatus}</span>
          </div>
          <div>
            <h3 className="font-black text-gray-900 text-sm">FastAPI Analytics Node</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Scikit-Learn Server • Port 8000</p>
            <div className="border-t border-gray-50 mt-4 pt-3 flex justify-between text-[11px] font-semibold text-gray-500">
              <span>Model Retraining:</span>
              <span className="font-black text-gray-900">Statsmodels / Random Forest</span>
            </div>
          </div>
        </div>

        {/* Database */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
              dbStatus === 'Connected' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
            }`}>{dbStatus}</span>
          </div>
          <div>
            <h3 className="font-black text-gray-900 text-sm">MongoDB Database</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Atlas Cluster Cluster</p>
            <div className="border-t border-gray-50 mt-4 pt-3 flex justify-between text-[11px] font-semibold text-gray-500">
              <span>Atlas Connection:</span>
              <span className="font-black text-gray-900">Secured with TLS 1.3</span>
            </div>
          </div>
        </div>
      </div>

      {/* Route Builder & stops segment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Add Route Form (1 col) */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-[13px] font-black text-gray-900 mb-0.5">Create Shipping Lane</h2>
          <p className="text-[10px] text-gray-400 font-semibold mb-4">Define a new route with multiple stops</p>

          {errorMsg && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl mb-3">{errorMsg}</div>}

          <form onSubmit={handleAddRoute} className="space-y-3.5 text-xs font-semibold">
            <div>
              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Route ID</label>
              <input type="text" value={routeId} onChange={e => setRouteId(e.target.value)} placeholder="e.g. RTE-001" required className={inputCls} />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Origin Stop</label>
                <input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="Mumbai" required className={inputCls} />
              </div>
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Destination Stop</label>
                <input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="Pune" required className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Intermediate Stops (comma-separated)</label>
              <input type="text" value={stopsStr} onChange={e => setStopsStr(e.target.value)} placeholder="Thane, Lonavala" className={inputCls} />
              <span className="text-[9px] text-gray-400 mt-1 block">Stops will be ordered between origin and destination.</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Distance (km)</label>
                <input type="number" value={distance} onChange={e => setDistance(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Base Rate (₹)</label>
                <input type="number" value={baseRate} onChange={e => setBaseRate(e.target.value)} required className={inputCls} />
              </div>
            </div>

            <button type="submit" className="w-full py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[11px] font-black transition-all duration-150 cursor-pointer border-none flex items-center justify-center space-x-1.5 shadow-md shadow-green-600/15">
              <Plus className="w-3.5 h-3.5" />
              <span>Create Shipping Lane</span>
            </button>
          </form>
        </div>

        {/* Routes List with stops path (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-[13px] font-black text-gray-900 mb-0.5">Shipping Lane Directory</h2>
            <p className="text-[10px] text-gray-400 font-semibold mb-4">Active multi-stop shipping lanes inside system database</p>

            {routesLoading ? (
              <div className="py-12 text-center text-gray-400 text-xs">Loading route directory...</div>
            ) : routes.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-xs">No active shipping lanes. Create your first route on the left.</div>
            ) : (
              <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                {routes.map(r => (
                  <div key={r.routeId} className="flex items-start justify-between bg-gray-50 border border-gray-100 rounded-xl p-3.5">
                    <div className="space-y-1.5 flex-1 min-w-0 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[10px] font-black bg-green-50 text-[#16a34a] px-1.5 py-0.5 rounded border border-green-100">
                          {r.routeId}
                        </span>
                        <span className="text-[11px] font-black text-gray-800">
                          {r.source} → {r.destination}
                        </span>
                      </div>
                      
                      {/* Stop Sequence Itinerary Path */}
                      <div className="flex items-center space-x-1.5 flex-wrap text-[10px] font-semibold text-gray-500">
                        <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="font-bold uppercase tracking-wider text-[8px] text-gray-400">Path:</span>
                        {r.stops && r.stops.map((stop, i) => (
                          <React.Fragment key={stop}>
                            <span className="text-gray-800">{stop}</span>
                            {i < r.stops.length - 1 && <span className="text-gray-300">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[12px] font-black text-gray-900">{r.distance} km</p>
                      <p className="text-[9px] text-[#16a34a] font-bold">Base: ₹{r.baseRate.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Diagnostics Logs Console Output */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-[13px] font-black text-gray-900 mb-0.5">System Memory Usage & Diagnostics</h2>
        <p className="text-[10px] text-gray-400 font-semibold mb-4">Resource stats scored from microservices</p>

        <div className="space-y-4">
          {[
            { label: 'Platform API CPU Load', value: '4.2%', width: 'w-[4.2%]', status: 'Optimal' },
            { label: 'V8 Node Memory Pool', value: '112MB / 512MB', width: 'w-[22%]', status: 'Optimal' },
            { label: 'FastAPI Memory Footprint', value: '185MB / 1024MB', width: 'w-[18%]', status: 'Optimal' },
            { label: 'MongoDB Connection Pool', value: '12 / 100 active connections', width: 'w-[12%]', status: 'Healthy' }
          ].map(stat => (
            <div key={stat.label} className="space-y-1.5 font-bold text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-500 font-semibold">{stat.label}</span>
                <div className="space-x-2">
                  <span className="text-gray-900 font-black">{stat.value}</span>
                  <span className="text-[9px] font-black uppercase text-emerald-600 bg-green-50 px-1.5 py-0.2 rounded border border-green-100">{stat.status}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                <div className={`h-full bg-[#16a34a] rounded-full ${stat.width}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default AdminSystem;
