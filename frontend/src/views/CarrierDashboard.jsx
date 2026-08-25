import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Truck, IndianRupee, TrendingUp, TrendingDown,
  BarChart3, Package, Navigation, Clock,
  CheckCircle2, Zap, Activity, ChevronRight,
  ArrowUpRight, Route, Layers, Play, MapPin
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

/* ─── helpers ──────────────────────────────────────────────── */
const fmtINR = (v) => {
  if (!v) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};
const fmt = (v) => (v ?? 0).toLocaleString('en-IN');

const StatusBadge = ({ status }) => {
  const map = {
    Completed: 'bg-green-50 text-green-700 border-green-200',
    Pending:   'bg-amber-50 text-amber-700 border-amber-200',
    Cancelled: 'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${map[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  );
};

/* ─── KPI Card ─────────────────────────────────────────────── */
const KpiCard = ({ icon: Icon, label, value, sub, iconBg, iconColor, trend, trendLabel }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      {trend !== undefined && (
        <div className={`flex items-center space-x-1 text-[10px] font-black px-2 py-1 rounded-full ${
          trend >= 0 ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'
        }`}>
          {trend >= 0
            ? <TrendingUp className="w-3 h-3" />
            : <TrendingDown className="w-3 h-3" />}
          <span>{trend >= 0 ? '+' : ''}{trend}%</span>
        </div>
      )}
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
    {sub && <p className="text-[11px] text-gray-400 font-semibold mt-0.5">{sub}</p>}
  </div>
);

/* ── Utilization Bar ───────────────────────────────────────── */
const UtilBar = ({ pct }) => {
  const color = pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#ef4444';
  return (
    <div className="flex items-center space-x-2.5 flex-1">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-black w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   CARRIER DASHBOARD
═══════════════════════════════════════════════════════════════ */
const CarrierDashboard = () => {
  const { user } = useContext(AuthContext);

  const [kpis,        setKpis]        = useState(null);
  const [trends,      setTrends]      = useState([]);
  const [bookings,    setBookings]    = useState([]);
  const [fleet,       setFleet]       = useState([]);
  const [routePerf,   setRoutePerf]   = useState([]);
  const [vehicles,    setVehicles]    = useState([]);
  const [routes,      setRoutes]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [transitLoading, setTransitLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [kRes, tRes, bRes, fRes, rRes, vListRes, routesRes] = await Promise.all([
          api.get('/bookings/analytics/kpis'),
          api.get('/bookings/analytics/trends?days=14'),
          api.get('/bookings?limit=8'),
          api.get('/vehicles/analytics/utilization'),
          api.get('/routes/analytics/performance'),
          api.get('/vehicles'),
          api.get('/routes')
        ]);
        setKpis(kRes.data);
        setTrends(tRes.data);
        setBookings(bRes.data);
        setFleet(fRes.data);
        setRoutePerf(rRes.data.slice(0, 4));
        setVehicles(vListRes.data);
        setRoutes(routesRes.data);
      } catch (err) {
        console.error('CarrierDashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleTransitAction = async (vehicleId, action, stopName = '', routeIndex = 0) => {
    setTransitLoading(true);
    try {
      await api.post(`/vehicles/${vehicleId}/transit-state`, { action, stopName, routeIndex });
      
      const [kRes, fRes, bRes, vListRes] = await Promise.all([
        api.get('/bookings/analytics/kpis'),
        api.get('/vehicles/analytics/utilization'),
        api.get('/bookings?limit=8'),
        api.get('/vehicles'),
      ]);
      setKpis(kRes.data);
      setFleet(fRes.data);
      setBookings(bRes.data);
      setVehicles(vListRes.data);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to update transit state.');
    } finally {
      setTransitLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[12px] font-bold text-gray-400">Loading fleet data…</p>
        </div>
      </div>
    );
  }

  /* ── Chart data ── */
  const chartLabels = trends.slice(-14).map(t =>
    new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  );
  const revenueData  = trends.slice(-14).map(t => t.revenue  || 0);
  const bookingData  = trends.slice(-14).map(t => (t.completed || 0) + (t.cancelled || 0));

  const lineChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Revenue (₹)',
        data: revenueData,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.08)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#16a34a',
      },
    ],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: '#fff',
      titleColor: '#111827',
      bodyColor: '#6b7280',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      padding: 10,
      callbacks: {
        label: (ctx) => `  Revenue: ${fmtINR(ctx.raw)}`,
      }
    }},
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10, weight: '700' } } },
      y: { grid: { color: '#f3f4f6' }, border: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 }, callback: (v) => fmtINR(v) } },
    },
  };

  const pending   = bookings.filter(b => b.status === 'Pending').length;
  const completed = bookings.filter(b => b.status === 'Completed').length;
  const optimalFleet = fleet.filter(v => v.statusLevel === 'Optimal').length;

  return (
    <div className="space-y-6">

      {/* ── PAGE HEADER ─────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Carrier Dashboard</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Welcome back, <span className="text-[#16a34a]">{user?.username}</span>
          </h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">
            Fleet operations, revenue analytics, and route performance — last 30 days.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Link to="/console"
            className="no-underline flex items-center space-x-1.5 px-4 py-2.5 border-2 border-gray-200 hover:border-green-300 bg-white text-gray-700 hover:text-[#16a34a] text-[11px] font-black rounded-full transition-all duration-150">
            <Zap className="w-3.5 h-3.5" /><span>ML Forecasts</span>
          </Link>
          <Link to="/console"
            className="no-underline flex items-center space-x-1.5 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-[11px] font-black rounded-full shadow-lg shadow-green-600/25 hover:shadow-green-600/35 transition-all duration-150">
            <Truck className="w-3.5 h-3.5" /><span>FLEET OVERVIEW</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ── KPI ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={IndianRupee} label="Revenue (30d)"
          value={fmtINR(kpis?.revenue30Days)} sub="Net carrier earnings"
          iconBg="bg-green-50" iconColor="text-[#16a34a]" trend={11}
        />
        <KpiCard
          icon={Truck} label="Active Vehicles"
          value={kpis?.activeVehicles ?? 0} sub={`${optimalFleet} running optimal`}
          iconBg="bg-blue-50" iconColor="text-blue-600"
        />
        <KpiCard
          icon={Activity} label="Fleet Occupancy"
          value={`${kpis?.avgOccupancy30Days ?? 0}%`} sub="Avg. space utilization"
          iconBg="bg-purple-50" iconColor="text-purple-600" trend={5}
        />
        <KpiCard
          icon={Package} label="Total Dispatches"
          value={kpis?.bookingsCount30Days ?? 0} sub={`${pending} pending · ${completed} done`}
          iconBg="bg-amber-50" iconColor="text-amber-600" trend={8}
        />
      </div>

      {/* ── MIDDLE ROW: Chart + Fleet ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Revenue Trend Chart — 3 cols */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[13px] font-black text-gray-900">Revenue Trend</h2>
              <p className="text-[10px] text-gray-400 font-semibold">14-day daily freight earnings</p>
            </div>
            <div className="flex items-center space-x-1.5 text-[#16a34a] bg-green-50 px-3 py-1.5 rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black">+11% this month</span>
            </div>
          </div>
          <div className="h-52">
            <Line data={lineChartData} options={lineChartOptions} />
          </div>

          {/* Summary pills */}
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-gray-50">
            {[
              { label: 'Total Revenue', value: fmtINR(kpis?.revenue30Days),              color: 'text-[#16a34a]' },
              { label: 'Net Profit',    value: fmtINR(kpis?.profit30Days),               color: 'text-blue-600'  },
              { label: 'Profit Margin', value: `${kpis?.profitMargin30Days ?? 0}%`,      color: 'text-purple-600'},
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <p className={`text-[15px] font-black ${color}`}>{value}</p>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Fleet Utilization — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[13px] font-black text-gray-900">Fleet Status</h2>
              <p className="text-[10px] text-gray-400 font-semibold">Vehicle utilization rates</p>
            </div>
            <Link to="/space" className="no-underline flex items-center space-x-1 text-[10px] font-black text-[#16a34a] hover:underline">
              <span>Details</span><ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-3.5">
            {fleet.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-6">No fleet data available.</p>
            ) : fleet.slice(0, 6).map(v => (
              <div key={v.vehicleId} className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                  <Truck className="w-3.5 h-3.5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-black text-gray-800 truncate">{v.vehicleId}</span>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${
                      v.statusLevel === 'Optimal'      ? 'bg-green-50 text-green-700' :
                      v.statusLevel === 'Moderate'     ? 'bg-amber-50 text-amber-700' :
                                                         'bg-red-50 text-red-600'
                    }`}>{v.statusLevel}</span>
                  </div>
                  <UtilBar pct={v.avgVolumeUtilization} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOTTOM ROW: Bookings + Routes ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Dispatches — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <div>
              <h2 className="text-[13px] font-black text-gray-900">Recent Dispatches</h2>
              <p className="text-[10px] text-gray-400 font-semibold">Latest bookings on your fleet</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">Shipper</th>
                  <th className="px-5 py-3">Route</th>
                  <th className="px-5 py-3">Volume</th>
                  <th className="px-5 py-3">Revenue</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[11px] font-semibold text-gray-700">
                {bookings.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No dispatches yet.</td></tr>
                ) : bookings.map(b => (
                  <tr key={b.bookingId} className="hover:bg-green-50/20 transition-colors duration-100">
                    <td className="px-5 py-3">
                      <span className="font-mono font-bold text-gray-800 block">{b.bookingId}</span>
                      {b.cargoDescription && (
                        <span className="text-[9px] text-gray-500 font-bold block mt-0.5 max-w-[120px] truncate" title={b.cargoDescription}>
                          {b.cargoDescription}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{b.shipperId || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center space-x-1.5 mb-0.5">
                        <Navigation className="w-3.5 h-3.5 text-[#16a34a] shrink-0" />
                        <span className="font-bold text-gray-800">{b.routeId}</span>
                      </div>
                      {b.fromStop && b.toStop ? (
                        <span className="text-[9px] text-gray-400 font-bold block">{b.fromStop} → {b.toStop}</span>
                      ) : (
                        <span className="text-[9px] text-gray-400 block font-semibold">Entire Lane Path</span>
                      )}
                    </td>
                    <td className="px-5 py-3">{b.volume} m³</td>
                    <td className="px-5 py-3">
                      <span className="font-bold text-gray-900 block">{fmtINR(b.revenue)}</span>
                      {b.invoiceNumber && (
                        <span className="block text-[8px] text-gray-400 font-semibold mt-0.5">
                          Inv: {b.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Route Performance — 1 col */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[13px] font-black text-gray-900">Top Routes</h2>
              <p className="text-[10px] text-gray-400 font-semibold">By total revenue</p>
            </div>
            <Link to="/routes" className="no-underline flex items-center space-x-1 text-[10px] font-black text-[#16a34a] hover:underline">
              <span>All</span><ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-4">
            {routePerf.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-6">No route data available.</p>
            ) : routePerf.map((r, i) => (
              <div key={r.routeId} className="flex items-center space-x-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 ${
                  i === 0 ? 'bg-green-100 text-green-700' :
                  i === 1 ? 'bg-blue-100 text-blue-700' :
                  i === 2 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'
                }`}>#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-black text-gray-800 truncate">{r.source} → {r.destination}</p>
                  <p className="text-[9px] text-gray-400 font-semibold">{r.totalBookings} trips · {r.distance} km</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-black text-gray-900">{fmtINR(r.totalRevenue)}</p>
                  <p className={`text-[9px] font-black ${r.profitMargin >= 30 ? 'text-green-600' : 'text-amber-600'}`}>
                    {r.profitMargin}% margin
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-gray-50">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-[14px] font-black text-[#16a34a]">{kpis?.totalRoutes ?? 0}</p>
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider mt-0.5">Active Lanes</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-[14px] font-black text-blue-600">{fmt(kpis?.volume30Days)} m³</p>
              <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider mt-0.5">Vol. Shipped</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CarrierDashboard;
