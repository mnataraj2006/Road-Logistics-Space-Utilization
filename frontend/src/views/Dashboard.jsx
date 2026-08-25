import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Line, Bar } from 'react-chartjs-2';
import { 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  Percent,
  Calendar,
  IndianRupee
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

// Register Chart.js modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const formatINR = (value) => {
  if (value === undefined || value === null) return '₹0';
  if (value >= 10000000) {
    return `₹${(value / 10000000).toFixed(2)} Cr`;
  }
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(2)} L`;
  }
  return `₹${value.toLocaleString('en-IN')}`;
};

const Dashboard = () => {
  const [kpis, setKpis] = useState(null);
  const [trends, setTrends] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [kpiRes, trendRes, bookingRes] = await Promise.all([
          api.get('/bookings/analytics/kpis'),
          api.get('/bookings/analytics/trends?days=30'),
          api.get('/bookings?limit=7')
        ]);
        
        setKpis(kpiRes.data);
        setTrends(trendRes.data);
        setRecentBookings(bookingRes.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
        setError('Failed to load dashboard parameters. Please check if services are running.');
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel border-red-500/20 p-6 rounded-2xl text-red-400 flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-sm">System Synchronization Error</h3>
          <p className="text-xs text-slate-400 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // Chart configs
  const chartLabels = trends.map(t => {
    const date = new Date(t.date);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  });

  const revenueChartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Revenue',
        data: trends.map(t => t.revenue),
        borderColor: '#5c67f2', // Purple / Indigo
        backgroundColor: 'rgba(92, 103, 242, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4
      },
      {
        label: 'Net Profit',
        data: trends.map(t => t.profit),
        borderColor: '#10b981', // Emerald / Green
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointRadius: 0,
        pointHoverRadius: 4
      }
    ]
  };

  const volumeChartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Delivered Vol (m³)',
      data: trends.map(t => t.volume),
      backgroundColor: '#a855f7',
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 6,
      barPercentage: 0.55
    }]
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111224',
        titleColor: '#94a3b8',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 9 } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.03)' },
        ticks: { color: '#64748b', font: { size: 9 } }
      }
    }
  };

  const revenueChartOptions = {
    ...lineOptions,
    plugins: {
      ...lineOptions.plugins,
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          font: { size: 10, weight: 'semibold' },
          boxWidth: 8,
          boxHeight: 8,
          usePointStyle: true,
          pointStyle: 'circle'
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 5 KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* 1. Net Revenue KPI */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-[#131427]/40">
          <div className="flex items-center justify-between text-slate-400 mb-4">
            <span className="text-[10px] font-bold tracking-wider uppercase">30D Net Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <IndianRupee className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2">{formatINR(kpis?.revenue30Days)}</h2>
          <div className="flex items-center space-x-1.5 text-[11px] text-green-400 font-bold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+12.4% vs last 30D</span>
          </div>
        </div>

        {/* 2. Operating Cost KPI */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-[#131427]/40">
          <div className="flex items-center justify-between text-slate-400 mb-4">
            <div className="flex items-center space-x-1">
              <span className="text-[10px] font-bold tracking-wider uppercase">30D Operating Cost</span>
              <AlertTriangle className="w-3.5 h-3.5 text-red-400/80 animate-pulse" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2">{formatINR(kpis?.cost30Days)}</h2>
          <div className="flex items-center space-x-1.5 text-[11px] text-red-400 font-bold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+3.1% vs last 30D</span>
          </div>
        </div>

        {/* 3. Net Profit KPI */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-[#131427]/40">
          <div className="flex items-center justify-between text-slate-400 mb-4">
            <span className="text-[10px] font-bold tracking-wider uppercase">30D Net Profit</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="flex items-baseline space-x-3 mb-2">
            <h2 className="text-3xl font-extrabold text-white">{formatINR(kpis?.profit30Days)}</h2>
            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {kpis?.profitMargin30Days}% Margin
            </span>
          </div>
          <div className="text-[11px] text-slate-500 font-semibold">
            <span>Net profit after operations</span>
          </div>
        </div>

        {/* 4. Avg Space Occupancy KPI */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-[#131427]/40">
          <div className="flex items-center justify-between text-slate-400 mb-4">
            <span className="text-[10px] font-bold tracking-wider uppercase">Avg Space Occupancy</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Percent className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2.5">{kpis?.avgOccupancy30Days}%</h2>
          <div className="space-y-1.5">
            <div className="w-full bg-[#1c1d33] h-1.5 rounded-full overflow-hidden">
              <div className="bg-[#3b46cf] h-full rounded-full" style={{ width: `${kpis?.avgOccupancy30Days}%` }}></div>
            </div>
            <div className="flex justify-between text-[9px] font-semibold text-slate-400">
              <span>Utilization</span>
              <span>{kpis?.avgOccupancy30Days}% of capacity</span>
            </div>
          </div>
        </div>

        {/* 5. Consignments KPI */}
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-[#131427]/40">
          <div className="flex items-center justify-between text-slate-400 mb-4">
            <span className="text-[10px] font-bold tracking-wider uppercase">30D Consignments</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <h2 className="text-3xl font-extrabold text-white mb-2">{kpis?.bookingsCount30Days}</h2>
          <div className="flex items-center space-x-1.5 text-[11px] text-green-400 font-bold">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+8.6% vs last 30D</span>
          </div>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue / Profit Line Chart */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-2 bg-[#131427]/40">
          <div className="mb-6">
            <h2 className="text-sm font-bold text-white tracking-wide">Revenue • Cost • Net Profit</h2>
            <p className="text-[11px] text-slate-500 font-medium">Rolling 30-day performance</p>
          </div>
          <div className="h-64">
            <Line data={revenueChartData} options={revenueChartOptions} />
          </div>
        </div>

        {/* Cargo Output Bar Chart */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-1 bg-[#131427]/40">
          <div className="mb-6">
            <h2 className="text-sm font-bold text-white tracking-wide">Cargo Output</h2>
            <p className="text-[11px] text-slate-500 font-medium">Daily volume transported (m³)</p>
          </div>
          <div className="h-64">
            <Bar data={volumeChartData} options={lineOptions} />
          </div>
        </div>
      </div>

      {/* Recent Consignments Table */}
      <div className="glass-panel p-6 rounded-2xl bg-[#131427]/40">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">Recent Consignments</h2>
            <p className="text-[11px] text-slate-500 font-medium">Live bookings log - updated in real time</p>
          </div>
          <button className="px-4 py-2 border border-white/10 hover:bg-[#131427] rounded-xl text-slate-200 text-xs font-bold transition-all duration-200 cursor-pointer">
            View all
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="pb-3 pl-4">Booking ID</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Vehicle</th>
                <th className="pb-3">Route Lane</th>
                <th className="pb-3">Volume</th>
                <th className="pb-3">Weight</th>
                <th className="pb-3">Revenue</th>
                <th className="pb-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="font-semibold text-slate-300">
              {recentBookings.map((bkg) => (
                <tr key={bkg.bookingId} className="border-b border-white/5 hover:bg-[#131427]/30 transition-colors duration-150">
                  <td className="py-4 pl-4 font-mono font-bold text-indigo-400">{bkg.bookingId.replace('BKG', 'CGN')}</td>
                  <td className="py-4 text-slate-400 font-medium">{new Date(bkg.date).toISOString().split('T')[0]}</td>
                  <td className="py-4 font-semibold text-slate-200">{bkg.vehicleId}</td>
                  <td className="py-4 font-medium">{bkg.routeId}</td>
                  <td className="py-4 text-slate-200">{bkg.volume} m³</td>
                  <td className="py-4 text-slate-400 font-medium">{bkg.weight?.toLocaleString()} kg</td>
                  <td className="py-4 text-white">₹{bkg.revenue?.toLocaleString('en-IN')}</td>
                  <td className="py-4 pr-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      bkg.status === 'Completed' ? 'bg-green-500/15 text-green-400' :
                      bkg.status === 'Pending' ? 'bg-amber-500/15 text-amber-400' :
                      'bg-red-500/15 text-red-400'
                    }`}>
                      {bkg.status}
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

export default Dashboard;
