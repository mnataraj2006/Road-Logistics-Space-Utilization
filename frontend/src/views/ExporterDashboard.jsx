import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Package, ArrowRight, TrendingUp, IndianRupee,
  Clock, MapPin, CheckCircle2, AlertCircle,
  Navigation, Truck, Search, ChevronRight,
  BarChart3, Zap, Activity
} from 'lucide-react';

/* ─── helpers ──────────────────────────────────────────────── */
const fmt = (v) => v?.toLocaleString('en-IN') ?? '0';
const fmtINR = (v) => `₹${fmt(Math.round(v || 0))}`;

const StatusBadge = ({ status }) => {
  const map = {
    Completed: 'bg-green-50 text-green-700 border-green-200',
    Pending:   'bg-amber-50 text-amber-700 border-amber-200',
    Cancelled: 'bg-red-50   text-red-600   border-red-200',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${map[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  );
};

/* ─── KPI Card ─────────────────────────────────────────────── */
const KpiCard = ({ icon: Icon, label, value, sub, iconBg, iconColor, trend }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      {trend !== undefined && (
        <div className={`flex items-center space-x-1 text-[10px] font-black ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          <TrendingUp className="w-3 h-3" />
          <span>{trend >= 0 ? '+' : ''}{trend}%</span>
        </div>
      )}
    </div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 font-semibold mt-0.5">{sub}</p>}
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   EXPORTER DASHBOARD
═══════════════════════════════════════════════════════════════ */
const ExporterDashboard = () => {
  const { user } = useContext(AuthContext);
  const [kpis,      setKpis]      = useState(null);
  const [bookings,  setBookings]  = useState([]);
  const [payments,  setPayments]  = useState([]);
  const [routes,    setRoutes]    = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [kRes, bRes, pRes, rRes] = await Promise.all([
          api.get('/bookings/analytics/kpis'),
          api.get('/bookings?limit=8'),
          api.get('/bookings/payments'),
          api.get('/routes'),
        ]);
        setKpis(kRes.data);
        setBookings(bRes.data);
        setPayments(pRes.data.slice(0, 4));
        setRoutes(rRes.data);
      } catch (err) {
        console.error('Exporter dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[12px] font-bold text-gray-400">Loading your dashboard…</p>
        </div>
      </div>
    );
  }

  const pending   = bookings.filter(b => b.status === 'Pending').length;
  const completed = bookings.filter(b => b.status === 'Completed').length;

  return (
    <div className="space-y-7">

      {/* ── PAGE HEADER ──────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Exporter Dashboard</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            Welcome back, <span className="text-[#16a34a]">{user?.username}</span>
          </h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">
            Here's your cargo activity and shipment overview for the past 30 days.
          </p>
        </div>

        <Link to="/find-space"
          className="no-underline flex items-center space-x-2 px-5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-[12px] font-black rounded-full shadow-lg shadow-green-600/25 hover:shadow-green-600/35 transition-all duration-150">
          <Search className="w-3.5 h-3.5" />
          <span>FIND CARGO SPACE</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ── KPI ROW ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Package}
          label="Total Bookings"
          value={kpis?.bookingsCount30Days ?? 0}
          sub="Last 30 days"
          iconBg="bg-green-50"
          iconColor="text-[#16a34a]"
          trend={8}
        />
        <KpiCard
          icon={IndianRupee}
          label="Total Spend"
          value={fmtINR(kpis?.revenue30Days)}
          sub="Cargo freight costs"
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
          trend={-3}
        />
        <KpiCard
          icon={Clock}
          label="Pending Dispatch"
          value={pending}
          sub="Awaiting carrier pickup"
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Delivered"
          value={completed}
          sub="Successfully completed"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          trend={12}
        />
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Shipments — 2 cols wide */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <div>
              <h2 className="text-[13px] font-black text-gray-900">Recent Shipments</h2>
              <p className="text-[10px] text-gray-400 font-semibold">Your latest cargo bookings</p>
            </div>
            <Link to="/shipments" className="no-underline flex items-center space-x-1 text-[11px] font-black text-[#16a34a] hover:underline">
              <span>View All</span><ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest">
                  <th className="px-6 py-3">Booking ID</th>
                  <th className="px-6 py-3">Route</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Volume</th>
                  <th className="px-6 py-3">Cost</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-[11px] font-semibold text-gray-700">
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400 text-[12px]">
                      No bookings yet — <Link to="/find-space" className="text-[#16a34a] font-black">find cargo space</Link>
                    </td>
                  </tr>
                ) : bookings.map(b => (
                  <tr key={b.bookingId} className="hover:bg-green-50/30 transition-colors duration-100">
                    <td className="px-6 py-3.5">
                      <span className="font-mono font-bold text-gray-800 block">{b.bookingId}</span>
                      {b.cargoDescription && (
                        <span className="text-[9px] text-gray-500 font-bold block mt-0.5 max-w-[120px] truncate" title={b.cargoDescription}>
                          {b.cargoDescription}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
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
                    <td className="px-6 py-3.5 text-gray-400">
                      {new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </td>
                    <td className="px-6 py-3.5">{b.volume} m³</td>
                    <td className="px-6 py-3.5">
                      <span className="font-bold text-gray-900 block">{fmtINR(b.revenue)}</span>
                      {b.invoiceNumber && (
                        <span className="block text-[8px] text-gray-400 font-semibold mt-0.5">
                          Inv: {b.invoiceNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* Active Routes Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[12px] font-black text-gray-900 mb-1">Active Shipping Lanes</h3>
            <p className="text-[10px] text-gray-400 font-semibold mb-4">Carrier routes open for booking</p>
            <div className="space-y-2.5">
              {routes.slice(0, 4).map(r => (
                <div key={r.routeId} className="flex items-center justify-between group">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                      <Truck className="w-3.5 h-3.5 text-[#16a34a]" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-gray-800">{r.source} → {r.destination}</p>
                      <p className="text-[9px] text-gray-400 font-semibold">{r.distance} km</p>
                    </div>
                  </div>
                  <Link to="/find-space"
                    className="no-underline opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-black text-[#16a34a] flex items-center space-x-0.5">
                    <span>Book</span><ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
            <Link to="/find-space"
              className="no-underline mt-4 w-full py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-[11px] font-black rounded-xl flex items-center justify-center space-x-1.5 transition-all duration-150 shadow-md shadow-green-600/15">
              <Search className="w-3.5 h-3.5" />
              <span>SEARCH ALL ROUTES</span>
            </Link>
          </div>

          {/* Recent Payments */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[12px] font-black text-gray-900">Recent Payments</h3>
              <Link to="/payments" className="no-underline text-[10px] font-black text-[#16a34a] hover:underline flex items-center">
                View All<ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-3">
              {payments.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-4">No payment records yet.</p>
              ) : payments.map(p => (
                <div key={p._id} className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-black text-gray-800">{p.bookingId}</p>
                    <p className="text-[9px] text-gray-400 font-semibold font-mono">{p.transactionId?.slice(0, 14)}…</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] font-black text-gray-900">{fmtINR(p.amount)}</p>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                      p.status === 'PaidOut' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {p.status === 'PaidOut' ? 'Released' : 'Escrow'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM STATS BAR ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Activity,  label: 'Avg Occupancy',   value: `${kpis?.avgOccupancy30Days ?? 0}%`,      color: 'text-green-600',  bg: 'bg-green-50' },
          { icon: BarChart3, label: 'Volume Shipped',   value: `${kpis?.volume30Days ?? 0} m³`,          color: 'text-blue-600',   bg: 'bg-blue-50'  },
          { icon: Zap,       label: 'Total Weight',     value: `${fmt(kpis?.weight30Days)} kg`,           color: 'text-purple-600', bg: 'bg-purple-50'},
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center space-x-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
              <p className="text-[17px] font-black text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExporterDashboard;
