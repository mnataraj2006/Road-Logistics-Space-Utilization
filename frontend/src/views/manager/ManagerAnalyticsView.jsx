import React, { useState, useEffect } from 'react';
import {
  BarChart3, TrendingUp, Zap, Layers, Truck, CheckCircle2,
  AlertTriangle, DollarSign, ArrowRight, RefreshCw, Activity,
  PieChart, ShieldCheck, Clock
} from 'lucide-react';
import axios from 'axios';

const ManagerAnalyticsView = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get('/api/analytics/performance', { headers: authHeader });
      setData(res.data.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to fetch live logistics performance analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const cap = data?.capacity || {
    averageVolumeUtilization: 0,
    averageWeightUtilization: 0,
    peakSegmentUtilization: 0,
    unusedVolume: 0,
    unusedWeight: 0,
    totalCapacityVolume: 0,
    totalCapacityWeight: 0
  };

  const opt = data?.optimization || {
    optimizerSuccessRate: 0,
    allocationRate: 0,
    unassignedShipments: 0,
    avgRuntimeMs: 0,
    planImprovementVsBaseline: 0,
    truckReductionVsBaseline: 0,
    utilizationGainPoints: 0,
    comparison: {
      baseline: { truckCount: 0, averageVolumeUtilization: 0, label: 'Naive First-Fit LTL (Baseline)' },
      optimized: { truckCount: 0, averageVolumeUtilization: 0, label: 'Multi-Stop Space Optimizer' },
      improvement: { trucksSaved: 0, percentagePointsGain: 0, summary: '0 fewer trucks, +0 percentage-point volume gain' }
    }
  };

  const ops = data?.operations || {
    stopsCompleted: 0,
    packagesLoaded: 0,
    packagesUnloaded: 0,
    reoptimizationCount: 0,
    loadPlanChanges: 0,
    delayedOperations: 0,
    tripCompletionRate: 0
  };

  const fin = data?.financial || {
    totalRevenue: 0,
    revenuePerUtilizedM3: 0,
    revenuePerTrip: 0,
    estimatedOperatingCost: 0,
    contributionMargin: 0,
    contributionMarginPercent: 0,
    currency: 'INR'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            Logistics Performance & Space Optimization Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time capacity fill factors, before vs. after baseline comparisons, operational flow, and deterministic financial yield.
          </p>
        </div>

        <button
          onClick={fetchAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition border-none cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Metrics</span>
        </button>
      </div>

      {/* ── 1. PROMINENT BEFORE VS AFTER OPTIMIZATION COMPARATIVE BENCHMARK ── */}
      <div className="bg-linear-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-6 shadow-md space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-emerald-700/50 pb-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
              Deterministic Objective Benchmark
            </span>
            <h2 className="text-lg font-black text-white">
              Before Optimization (Baseline) vs. After Optimization
            </h2>
          </div>
          <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold border border-emerald-400/30">
            {opt.comparison?.improvement?.summary || `${opt.comparison?.improvement?.trucksSaved ?? 0} fewer trucks, +${opt.comparison?.improvement?.percentagePointsGain ?? 0} percentage-point volume gain`}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Baseline Card */}
          <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
            <span className="text-xs font-bold text-gray-300 uppercase tracking-wide block">
              Baseline (Naive First-Fit LTL)
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-200">
                {opt.comparison?.baseline?.truckCount ?? 0}
              </span>
              <span className="text-xs text-gray-400 font-semibold">Trucks required</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-300 pt-1 border-t border-white/10">
              <span>Avg Volume Fill:</span>
              <strong className="text-amber-400 text-sm">
                {opt.comparison?.baseline?.averageVolumeUtilization ?? 0}%
              </strong>
            </div>
          </div>

          {/* Arrow / VS */}
          <div className="text-center space-y-1">
            <div className="inline-flex p-3 bg-emerald-500/20 rounded-full text-emerald-300">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <span className="block text-xs font-black text-emerald-300 uppercase tracking-widest">
              Optimizer Impact
            </span>
          </div>

          {/* Optimized Card */}
          <div className="p-5 bg-emerald-500/10 border border-emerald-400/30 rounded-2xl space-y-2 shadow-inner">
            <span className="text-xs font-bold text-emerald-300 uppercase tracking-wide block">
              Multi-Stop Space Optimizer
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400">
                {opt.comparison?.optimized?.truckCount ?? 0}
              </span>
              <span className="text-xs text-emerald-200 font-semibold">Trucks required</span>
            </div>
            <div className="flex items-center justify-between text-xs text-emerald-200 pt-1 border-t border-emerald-400/20">
              <span>Avg Volume Fill:</span>
              <strong className="text-emerald-300 text-sm">
                {opt.comparison?.optimized?.averageVolumeUtilization ?? 0}%
              </strong>
            </div>
          </div>
        </div>

        {/* Improvement Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 text-center text-xs">
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Fleet Savings</span>
            <span className="text-base font-black text-emerald-400">
              {opt.comparison?.improvement?.trucksSaved ?? 0} Fewer Trucks
            </span>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Utilization Gain</span>
            <span className="text-base font-black text-emerald-400">
              +{opt.comparison?.improvement?.percentagePointsGain ?? 0}% pts
            </span>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Optimizer Runtime</span>
            <span className="text-base font-black text-white">
              {opt.avgRuntimeMs ?? 0} ms
            </span>
          </div>
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Allocation Rate</span>
            <span className="text-base font-black text-emerald-400">
              {opt.allocationRate ?? 0}%
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. FOUR CORE METRIC DOMAIN CATEGORIES ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* A. CAPACITY & HEADROOM METRICS */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              1. Capacity & Segment Utilization
            </h3>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Physical Space
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Avg Volume Fill
              </span>
              <span className="text-2xl font-black text-emerald-600 block">
                {cap.averageVolumeUtilization}%
              </span>
              <span className="text-[10px] text-gray-500 block">Across occupied hops</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Avg Weight Fill
              </span>
              <span className="text-2xl font-black text-gray-900 block">
                {cap.averageWeightUtilization}%
              </span>
              <span className="text-[10px] text-gray-500 block">GVWR compliant</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Peak Segment Fill
              </span>
              <span className="text-2xl font-black text-amber-600 block">
                {cap.peakSegmentUtilization}%
              </span>
              <span className="text-[10px] text-amber-800 block">Highest density hop</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Unused Headroom
              </span>
              <span className="text-2xl font-black text-blue-600 block">
                {cap.unusedVolume} m³
              </span>
              <span className="text-[10px] text-gray-500 block">{cap.unusedWeight.toLocaleString()} kg free payload</span>
            </div>
          </div>
        </div>

        {/* B. OPTIMIZER EFFICIENCY & CONSTRAINTS */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600" />
              2. Optimizer Decision Engine
            </h3>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              Algorithmic Fit
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Optimizer Success
              </span>
              <span className="text-2xl font-black text-emerald-600 block">
                {opt.optimizerSuccessRate}%
              </span>
              <span className="text-[10px] text-gray-500 block">Plans approved</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Allocation Rate
              </span>
              <span className="text-2xl font-black text-gray-900 block">
                {opt.allocationRate}%
              </span>
              <span className="text-[10px] text-gray-500 block">Candidate cargo fit</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Unassigned Cargo
              </span>
              <span className="text-2xl font-black text-purple-600 block">
                {opt.unassignedShipments}
              </span>
              <span className="text-[10px] text-purple-700 block">Audited constraints</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Efficiency Gain
              </span>
              <span className="text-2xl font-black text-emerald-600 block">
                +{opt.utilizationGainPoints}%
              </span>
              <span className="text-[10px] text-emerald-800 block">Vs single LTL</span>
            </div>
          </div>
        </div>

        {/* C. PHYSICAL OPERATIONS & LIFECYCLE EXECUTION */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              3. Physical Operations & Transit Flow
            </h3>
            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              Live Lifecycle
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Stops Completed
              </span>
              <span className="text-2xl font-black text-gray-900 block">
                {ops.stopsCompleted}
              </span>
              <span className="text-[10px] text-gray-500 block">Verified via QR tokens</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Loads & Unloads
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-emerald-600">{ops.packagesLoaded}L</span>
                <span className="text-xs text-gray-400 font-bold">/</span>
                <span className="text-xl font-black text-amber-600">{ops.packagesUnloaded}U</span>
              </div>
              <span className="text-[10px] text-gray-500 block">Consignments processed</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                In-Transit Re-opts
              </span>
              <span className="text-2xl font-black text-purple-600 block">
                {ops.reoptimizationCount}
              </span>
              <span className="text-[10px] text-purple-700 block">Dynamic replans</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Trip Completion
              </span>
              <span className="text-2xl font-black text-emerald-600 block">
                {ops.tripCompletionRate}%
              </span>
              <span className="text-[10px] text-emerald-800 block">0 Delayed dispatches</span>
            </div>
          </div>
        </div>

        {/* D. FINANCIAL YIELD & CONTRIBUTION MARGIN */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              4. Deterministic Financial Yield & Contribution
            </h3>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              Auditable Yield
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Total Revenue
              </span>
              <span className="text-2xl font-black text-gray-900 block">
                ₹{fin.totalRevenue.toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-500 block">Deterministic pricing</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Revenue / m³
              </span>
              <span className="text-2xl font-black text-emerald-600 block">
                ₹{fin.revenuePerUtilizedM3}
              </span>
              <span className="text-[10px] text-gray-500 block">Per utilized space</span>
            </div>

            <div className="p-3.5 bg-gray-50 rounded-2xl space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                Estimated Op Cost
              </span>
              <span className="text-2xl font-black text-gray-700 block">
                ₹{fin.estimatedOperatingCost.toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-500 block">Distance + driver tolls</span>
            </div>

            <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-1">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
                Contribution Margin
              </span>
              <span className="text-2xl font-black text-emerald-700 block">
                ₹{fin.contributionMargin.toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-800 font-bold block">
                {fin.contributionMarginPercent}% Margin
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerAnalyticsView;
