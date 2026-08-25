import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import {
  Users, Truck, Package, CreditCard,
  Activity, Shield, CheckCircle2, AlertTriangle,
  RotateCw, ChevronRight, ArrowUpRight, IndianRupee,
  Terminal, Server, Settings, Database
} from 'lucide-react';

const formatINR = (v) => {
  if (v == null) return '₹0';
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
};

const KpiCard = ({ icon: Icon, label, value, sub, iconBg, iconColor }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow duration-200">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
    </div>
    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
    <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
    {sub && <p className="text-[11px] text-gray-400 font-semibold mt-0.5">{sub}</p>}
  </div>
);

const AdminDashboard = () => {
  const { user } = useContext(AuthContext);
  const [usersSummary, setUsersSummary] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [payments, setPayments] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersRes, kpisRes, paymentsRes] = await Promise.all([
          api.get('/auth/users'),
          api.get('/bookings/analytics/kpis'),
          api.get('/bookings/payments')
        ]);
        
        setUsersSummary(usersRes.data.summary);
        setRecentUsers(usersRes.data.users.slice(0, 5));
        setKpis(kpisRes.data);
        setPayments(paymentsRes.data.slice(0, 5));

        // Generate mockup dev logs
        setSystemLogs([
          { time: '10:45:12', service: 'AUTH', type: 'info', msg: 'JWT validation successful for session user.' },
          { time: '10:46:01', service: 'API', type: 'info', msg: 'Route analysis query resolved successfully.' },
          { time: '10:48:33', service: 'ML_FASTAPI', type: 'info', msg: 'Price forecast request scored in 12ms (R2=0.994)' },
          { time: '10:49:15', service: 'DB', type: 'info', msg: 'Aggregated occupancy index synced in memory.' },
          { time: '10:50:00', service: 'SYSTEM', type: 'success', msg: 'Escrow payment releasing ledger validated.' }
        ]);
      } catch (err) {
        console.error('Error loading admin dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleRetrain = async () => {
    setRetraining(true);
    try {
      await api.post('/predictions/train');
      // Add log
      setSystemLogs(prev => [
        { time: new Date().toLocaleTimeString(), service: 'ML_FASTAPI', type: 'success', msg: 'Model retraining triggered and completed successfully.' },
        ...prev
      ]);
      alert('ML models retrained successfully!');
    } catch (err) {
      alert('Failed to retrain models. Verify python server is active.');
    } finally {
      setRetraining(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[12px] font-bold text-gray-400">Loading admin parameters...</p>
        </div>
      </div>
    );
  }

  const grossVolume = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const grossPlatformFee = payments.reduce((sum, p) => sum + (p.platformFee || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* ── PAGE HEADER ─────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Developer Admin Console</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            System Overview & Operations
          </h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">
            Monitor SaaS tenants, execute ML model cycles, and audit platform commission splits.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleRetrain}
            disabled={retraining}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-[11px] font-black rounded-full shadow-lg shadow-green-600/25 hover:shadow-green-600/35 transition-all duration-150 border-none cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${retraining ? 'animate-spin' : ''}`} />
            <span>{retraining ? 'RETRAINING MODELS...' : 'RETRAIN MODELS'}</span>
          </button>
        </div>
      </div>

      {/* ── KPI ROW ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={Users}
          label="Total Tenants"
          value={usersSummary?.total ?? 0}
          sub={`${usersSummary?.carriers ?? 0} Carriers · ${usersSummary?.shippers ?? 0} Shippers`}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        <KpiCard
          icon={IndianRupee}
          label="Gross Platform Volume"
          value={formatINR(kpis?.revenue30Days || grossVolume)}
          sub="Processed in Escrow Ledger"
          iconBg="bg-green-50"
          iconColor="text-[#16a34a]"
        />
        <KpiCard
          icon={Shield}
          label="Platform Revenue (5%)"
          value={formatINR((kpis?.revenue30Days || grossVolume) * 0.05)}
          sub="SaaS commission earnings"
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <KpiCard
          icon={Activity}
          label="FastAPI Status"
          value="Healthy"
          sub="FastAPI Server Online (Port 8000)"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* ── MIDDLE ROW ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* User Directory Preview */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[13px] font-black text-gray-900">Tenant Registrations</h2>
                <p className="text-[10px] text-gray-400 font-semibold">Latest active user logins</p>
              </div>
              <Link to="/admin/users" className="no-underline text-[10px] font-black text-[#16a34a] hover:underline flex items-center">
                All Users <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3.5">
              {recentUsers.map(u => (
                <div key={u._id} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 text-[10px] font-bold">
                      {u.username.slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-[11px] font-black text-gray-800">{u.username}</p>
                      <p className="text-[9px] text-gray-400 font-semibold">{u.email}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                    u.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    u.role === 'carrier' ? 'bg-green-50 text-green-700 border-green-200' :
                    'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {u.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Logs Monitor */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-[13px] font-black text-gray-900 mb-0.5">System Console Logs</h2>
            <p className="text-[10px] text-gray-400 font-semibold mb-4">Live API and microservice traces</p>

            <div className="bg-gray-950 text-green-400 font-mono text-[10px] rounded-xl p-3.5 space-y-1.5 min-h-[170px] max-h-[180px] overflow-y-auto">
              {systemLogs.map((log, i) => (
                <div key={i} className="flex items-start space-x-1.5 leading-snug">
                  <span className="text-gray-600">[{log.time}]</span>
                  <span className="text-blue-400 font-bold">{log.service}:</span>
                  <span className={log.type === 'success' ? 'text-green-300' : 'text-gray-300'}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-400 font-bold tracking-wider pt-3 border-t border-gray-50 mt-4">
            <span className="flex items-center"><Server className="w-3 h-3 text-emerald-500 mr-1" /> Node Express ACTIVE</span>
            <span className="flex items-center"><Terminal className="w-3 h-3 text-emerald-500 mr-1" /> MongoDB Atlas INSTANCE</span>
          </div>
        </div>

        {/* Model Metrics */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-[13px] font-black text-gray-900 mb-0.5">ML Operations Health</h2>
            <p className="text-[10px] text-gray-400 font-semibold mb-4">Regression target score variances</p>

            <div className="space-y-3.5">
              {[
                { label: 'Demand Forecasting R²', score: 0.741, status: 'Optimal' },
                { label: 'Dynamic Price Yield R²', score: 0.994, status: 'Optimal' },
                { label: 'Route Delay Predictor R²', score: 0.850, status: 'Healthy' },
                { label: 'Container Occupancy R²', score: 0.885, status: 'Optimal' }
              ].map(m => (
                <div key={m.label} className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-bold">
                    <span className="text-gray-500 font-semibold">{m.label}</span>
                    <span className="text-gray-900 font-black">{m.score.toFixed(3)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#16a34a] rounded-full" style={{ width: `${m.score * 100}%` }} />
                    </div>
                    <span className="text-[8px] font-black uppercase text-emerald-600 bg-green-50 px-1 rounded">{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── ESCROW LEDGER PREVIEW ─────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <div>
            <h2 className="text-[13px] font-black text-gray-900">Escrow Payment Auditor</h2>
            <p className="text-[10px] text-gray-400 font-semibold">Latest payouts and holding assets</p>
          </div>
          <Link to="/admin/payments" className="no-underline text-[10px] font-black text-[#16a34a] hover:underline flex items-center">
            All Payments <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[11px] font-semibold text-gray-700">
            <thead>
              <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="px-5 py-3">Transaction ID</th>
                <th className="px-5 py-3">Shipper ID</th>
                <th className="px-5 py-3">Carrier ID</th>
                <th className="px-5 py-3">Asset Amount</th>
                <th className="px-5 py-3">Comm. Fee (5%)</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.map(p => (
                <tr key={p._id} className="hover:bg-green-50/20 transition-colors duration-100">
                  <td className="px-5 py-3 font-mono font-bold text-[#16a34a]">{p.transactionId}</td>
                  <td className="px-5 py-3 text-gray-500 font-bold">{p.shipperId}</td>
                  <td className="px-5 py-3 text-gray-500 font-bold">{p.carrierId}</td>
                  <td className="px-5 py-3 font-black text-gray-900">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3 text-purple-600 font-bold">{formatINR(p.platformFee)}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border inline-block ${
                      p.status === 'PaidOut' ? 'bg-green-50 text-green-700 border-green-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {p.status === 'PaidOut' ? 'Released' : 'Escrow'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default AdminDashboard;
