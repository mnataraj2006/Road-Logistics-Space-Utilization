import React, { useState, useEffect, useCallback } from "react";
import {
  BrainCircuit, TrendingUp, Clock, IndianRupee, RotateCw,
  CheckCircle, AlertTriangle, XCircle, Info, Sparkles,
  Truck, RefreshCw, ChevronDown, Activity, Layers, WifiOff, Zap
} from "lucide-react";
import api from "../../services/api";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const formatINR = (v) => {
  if (v == null) return "₹—";
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
};

const inputCls =
  "w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl " +
  "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 " +
  "focus:outline-none text-gray-800 text-xs font-semibold transition-all";

const BADGE = {
  "On Time":     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  "Minor Delay": "bg-amber-50  text-amber-700  border border-amber-200",
  "Major Delay": "bg-red-50    text-red-700    border border-red-200",
};

const todayStr    = () => new Date().toISOString().split("T")[0];
const tomorrowStr = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

/* ── sub-components ──────────────────────────────────────────────── */
const StatusDot = ({ ok }) => (
  <span
    className={`inline-block w-2 h-2 rounded-full ${
      ok ? "bg-emerald-500 animate-pulse" : "bg-red-400"
    }`}
  />
);

const PredictionCard = ({ icon: Icon, label, value, sub, badge, unavailable, accent = "emerald" }) => (
  <div
    className={`bg-white rounded-2xl border p-5 shadow-sm flex flex-col gap-2 transition-all duration-200 ${
      unavailable ? "border-gray-100 opacity-60" : "border-gray-200 hover:shadow-md"
    }`}
  >
    <div className="flex items-center justify-between">
      <div className={`p-2 rounded-xl bg-${accent}-50`}>
        <Icon className={`w-4 h-4 text-${accent}-600`} />
      </div>
      {badge && (
        <span
          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${
            BADGE[badge] || "bg-gray-100 text-gray-600"
          }`}
        >
          {badge}
        </span>
      )}
    </div>
    <div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
      {unavailable ? (
        <p className="text-sm font-bold text-gray-400 mt-0.5">Unavailable</p>
      ) : (
        <p className="text-xl font-black text-gray-900 mt-0.5 leading-none">{value ?? "—"}</p>
      )}
    </div>
    {sub && !unavailable && (
      <p className="text-[10px] text-gray-400 font-semibold leading-snug line-clamp-2">{sub}</p>
    )}
  </div>
);

const SectionHeader = ({ icon: Icon, title, sub }) => (
  <div className="flex items-center gap-3">
    <div className="p-2.5 rounded-xl bg-emerald-50 shrink-0">
      <Icon className="w-5 h-5 text-emerald-600" />
    </div>
    <div>
      <h2 className="text-sm font-black text-gray-900 tracking-tight">{title}</h2>
      {sub && <p className="text-[10px] text-gray-400 font-semibold mt-0.5">{sub}</p>}
    </div>
  </div>
);

const ServiceOfflineBanner = () => (
  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-xs font-semibold">
    <WifiOff className="w-4 h-4 shrink-0" />
    <div>
      <p className="font-black">ML Analytics Engine Offline</p>
      <p className="text-amber-700 font-semibold mt-0.5">
        The Python FastAPI service is not reachable. Core logistics operations continue unaffected.
        Start the analytics engine to enable predictions.
      </p>
    </div>
  </div>
);

/* ── main component ──────────────────────────────────────────────── */
const ManagerMLIntelligenceView = () => {
  const [routes,       setRoutes]       = useState([]);
  const [vehicles,     setVehicles]     = useState([]);
  const [dataLoading,  setDataLoading]  = useState(true);

  const [mlHealthy,  setMlHealthy]  = useState(null);
  const [, setHealthMsg]            = useState("");

  const [demandRouteId, setDemandRouteId] = useState("");
  const [demandDays,    setDemandDays]    = useState(7);
  const [demandData,    setDemandData]    = useState([]);
  const [demandLoading, setDemandLoading] = useState(false);
  const [demandError,   setDemandError]   = useState("");

  const [simVehicle,  setSimVehicle]  = useState("");
  const [simRoute,    setSimRoute]    = useState("");
  const [simDate,     setSimDate]     = useState(tomorrowStr());
  const [simVolume,   setSimVolume]   = useState(40);
  const [simWeight,   setSimWeight]   = useState(8000);

  const [occResult,   setOccResult]   = useState(null);
  const [delayResult, setDelayResult] = useState(null);
  const [priceResult, setPriceResult] = useState(null);
  const [simLoading,  setSimLoading]  = useState(false);
  const [simError,    setSimError]    = useState("");

  const [retrainLoading, setRetrainLoading] = useState(false);
  const [retrainMsg,     setRetrainMsg]     = useState("");
  const [retrainMetrics, setRetrainMetrics] = useState(null);
  const [retrainError,   setRetrainError]   = useState("");

  const fetchMasterData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [rRes, vRes] = await Promise.all([api.get("/routes"), api.get("/vehicles")]);
      const rts = Array.isArray(rRes.data) ? rRes.data : [];
      const vhs = Array.isArray(vRes.data) ? vRes.data : [];
      setRoutes(rts);
      setVehicles(vhs);
      if (rts.length > 0) {
        setDemandRouteId((r) => r || rts[0].routeId);
        setSimRoute((r) => r || rts[0].routeId);
      }
      if (vhs.length > 0) {
        setSimVehicle((v) => v || vhs[0].vehicleId);
      }
    } catch { /* non-fatal */ }
    finally { setDataLoading(false); }
  }, []);

  const checkMlHealth = useCallback(async () => {
    setMlHealthy(null);
    try {
      const res = await api.get("/predictions/health");
      const d = res.data;
      setMlHealthy(d.status === "healthy");
      setHealthMsg(d.message || "");
    } catch {
      setMlHealthy(false);
      setHealthMsg("Python analytics engine is not reachable.");
    }
  }, []);

  useEffect(() => { fetchMasterData(); checkMlHealth(); }, [fetchMasterData, checkMlHealth]);

  const fetchDemand = useCallback(async () => {
    if (!demandRouteId) return;
    setDemandLoading(true);
    setDemandError("");
    try {
      const { data } = await api.post("/predictions/demand", {
        route_id:  demandRouteId,
        days_ahead: Math.max(1, Math.min(30, parseInt(demandDays) || 7)),
      });
      setDemandData(data.forecast || []);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.detail
        || "Demand forecast unavailable. Check if the ML service is running.";
      setDemandError(msg);
      setDemandData([]);
    } finally { setDemandLoading(false); }
  }, [demandRouteId, demandDays]);

  useEffect(() => { if (demandRouteId) fetchDemand(); }, [fetchDemand]);

  const runSimulator = async (e) => {
    e.preventDefault();
    setSimLoading(true); setSimError(""); setOccResult(null); setDelayResult(null); setPriceResult(null);
    try {
      const [occR, delayR, priceR] = await Promise.all([
        api.post("/predictions/occupancy", {
          vehicle_id: simVehicle, route_id: simRoute, date: simDate,
          current_volume: parseFloat(simVolume), current_weight: parseFloat(simWeight),
        }),
        api.post("/predictions/delay",     { vehicle_id: simVehicle, route_id: simRoute, date: simDate }),
        api.post("/predictions/price",     { route_id: simRoute, volume: parseFloat(simVolume), weight: parseFloat(simWeight), date: simDate }),
      ]);
      setOccResult(occR.data); setDelayResult(delayR.data); setPriceResult(priceR.data);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.detail || "Simulation failed. Verify ML service is online.";
      setSimError(msg);
    } finally { setSimLoading(false); }
  };

  const handleRetrain = async () => {
    setRetrainLoading(true); setRetrainMsg(""); setRetrainError(""); setRetrainMetrics(null);
    try {
      const { data } = await api.post("/predictions/train");
      setRetrainMsg(data.message || "Models retrained.");
      setRetrainMetrics(data.metrics || null);
      await checkMlHealth();
    } catch (e) {
      setRetrainError(e?.response?.data?.message || e?.response?.data?.detail || "Retraining failed.");
    } finally { setRetrainLoading(false); }
  };

  const chartData = {
    labels: demandData.map((_, i) => `+${i + 1}d`),
    datasets: [{
      label: "Predicted Daily Bookings",
      data: demandData.map((f) => f.predicted_bookings_count),
      borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.07)",
      borderWidth: 2.5, tension: 0.4, fill: true,
      pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: "#10b981", pointBorderColor: "#fff", pointBorderWidth: 2,
    }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#fff", titleColor: "#111827", bodyColor: "#6b7280",
        borderColor: "#e5e7eb", borderWidth: 1, padding: 10,
        callbacks: { label: (ctx) => ` ${ctx.parsed.y} bookings` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#9ca3af", font: { size: 9, weight: "700" } } },
      y: { grid: { color: "#f3f4f6" }, border: { display: false }, ticks: { color: "#9ca3af", stepSize: 1, font: { size: 9 } }, min: 0 },
    },
  };

  const selectedRoute = routes.find((r) => r.routeId === demandRouteId);

  return (
    <div className="space-y-7">

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-[3px] w-5 bg-emerald-500 rounded-full" />
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.18em]">ML Analytics Engine</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-emerald-600" />
            ML Intelligence &amp; Predictions
          </h1>
          <p className="text-xs text-gray-400 font-semibold mt-0.5">
            Real ML predictions from trained models — demand forecast, occupancy, delay risk, and price estimation.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${
            mlHealthy === true  ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
            mlHealthy === false ? "bg-red-50    border-red-200    text-red-700" :
                                  "bg-gray-50   border-gray-200   text-gray-500"
          }`}>
            {mlHealthy === null
              ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : <StatusDot ok={mlHealthy} />
            }
            <span>{mlHealthy === null ? "Checking…" : mlHealthy ? "ML Engine Online" : "ML Engine Offline"}</span>
          </div>
          <button onClick={handleRetrain} disabled={retrainLoading} id="btn-retrain-models"
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-emerald-600/20 border-none cursor-pointer">
            <RotateCw className={`w-3.5 h-3.5 ${retrainLoading ? "animate-spin" : ""}`} />
            {retrainLoading ? "Retraining…" : "Retrain Models"}
          </button>
          <button onClick={checkMlHealth} id="btn-refresh-health"
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 transition border-none cursor-pointer" title="Refresh ML health">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {mlHealthy === false && <ServiceOfflineBanner />}

      {retrainMsg && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <p className="text-xs font-black text-gray-900">Models Retrained Successfully</p>
            <p className="text-[11px] text-gray-500 font-semibold mt-0.5">{retrainMsg}</p>
            {retrainMetrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                {[
                  { label: "Demand (R²)",   key: "demand_model_test_r2" },
                  { label: "Occupancy (R²)",key: "occupancy_model_test_r2" },
                  { label: "Delay (R²)",    key: "delay_model_test_r2" },
                  { label: "Price (R²)",    key: "price_model_test_r2" },
                ].map(({ label, key }) => (
                  <div key={key} className="bg-white border border-emerald-100 rounded-xl p-2.5 text-center">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-black text-emerald-700 mt-0.5">
                      {retrainMetrics[key] != null ? retrainMetrics[key].toFixed(3) : "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {retrainError && (
        <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex items-center gap-2 text-xs text-red-700 font-semibold">
          <XCircle className="w-4 h-4 shrink-0" />{retrainError}
        </div>
      )}

      {/* SECTION 1 — DEMAND FORECAST */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <SectionHeader icon={TrendingUp} title="Route Demand Forecast"
            sub="Holt-Winters Exponential Smoothing · historical booking counts per route" />
          <button onClick={fetchDemand} disabled={demandLoading} id="btn-refresh-demand"
            className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 hover:text-emerald-600 bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 px-3 py-1.5 rounded-lg cursor-pointer transition">
            <RefreshCw className={`w-3 h-3 ${demandLoading ? "animate-spin" : ""}`} />Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Route Lane</label>
            <div className="relative">
              <select value={demandRouteId} onChange={(e) => setDemandRouteId(e.target.value)}
                disabled={dataLoading} id="select-demand-route" className={inputCls + " pr-8 appearance-none"}>
                {routes.map((r) => (
                  <option key={r.routeId} value={r.routeId}>
                    {r.source} → {r.destination} · {r.distance} km ({r.routeId})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Forecast Days</label>
            <input type="number" min={1} max={30} value={demandDays}
              onChange={(e) => setDemandDays(Math.max(1, Math.min(30, parseInt(e.target.value) || 7)))}
              id="input-demand-days" className={inputCls} />
          </div>
        </div>

        <div className="h-56 relative">
          {demandLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 rounded-xl">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] text-gray-400 font-bold">Forecasting…</p>
              </div>
            </div>
          ) : demandError ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <WifiOff className="w-8 h-8 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-400 font-semibold max-w-xs">{demandError}</p>
              </div>
            </div>
          ) : demandData.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Info className="w-7 h-7 text-gray-300 mx-auto" />
                <p className="text-xs text-gray-400 font-semibold">No forecast data. Select a route and click Refresh.</p>
              </div>
            </div>
          ) : (
            <Line data={chartData} options={chartOptions} />
          )}
        </div>

        {demandData.length > 0 && (
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Forecast Detail (next 7 days)</p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {demandData.slice(0, 7).map((f) => (
                <div key={f.date} className="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
                  <p className="text-[8px] font-black text-gray-400 uppercase">{f.date.slice(5)}</p>
                  <p className="text-sm font-black text-gray-900 mt-0.5">{f.predicted_bookings_count}</p>
                  <p className="text-[8px] text-gray-400 font-semibold">bookings</p>
                </div>
              ))}
            </div>
            {selectedRoute && (
              <p className="text-[10px] text-gray-400 font-semibold mt-2">
                ⓘ Historical booking counts for {selectedRoute.source} → {selectedRoute.destination}.
                Model: Holt-Winters ExponentialSmoothing. These are ML estimates, not guarantees.
              </p>
            )}
          </div>
        )}
      </div>

      {/* SECTION 2 — DISPATCH SIMULATOR */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="border-b border-gray-100 pb-4">
          <SectionHeader icon={Truck} title="Dispatch Intelligence Simulator"
            sub="Predict occupancy, delay risk, and estimated price for a planned dispatch. Results are ML estimates — not booking prices." />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form */}
          <form onSubmit={runSimulator} className="lg:col-span-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Vehicle</label>
                <div className="relative">
                  <select value={simVehicle} onChange={(e) => setSimVehicle(e.target.value)}
                    required id="select-sim-vehicle" className={inputCls + " appearance-none pr-8"}>
                    {vehicles.map((v) => <option key={v.vehicleId} value={v.vehicleId}>{v.vehicleId} ({v.type})</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Route</label>
                <div className="relative">
                  <select value={simRoute} onChange={(e) => setSimRoute(e.target.value)}
                    required id="select-sim-route" className={inputCls + " appearance-none pr-8"}>
                    {routes.map((r) => <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} → {r.destination}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</label>
                <input type="date" value={simDate} min={todayStr()} onChange={(e) => setSimDate(e.target.value)}
                  required id="input-sim-date" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Volume (m³)</label>
                <input type="number" min={0.1} step={0.1} value={simVolume}
                  onChange={(e) => setSimVolume(e.target.value)} required id="input-sim-volume" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest">Weight (kg)</label>
                <input type="number" min={1} step={1} value={simWeight}
                  onChange={(e) => setSimWeight(e.target.value)} required id="input-sim-weight" className={inputCls} />
              </div>
            </div>

            <button type="submit" disabled={simLoading || mlHealthy === false} id="btn-run-simulator"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 text-white font-black rounded-xl shadow-md shadow-emerald-600/15 border-none cursor-pointer text-xs transition-all">
              {simLoading ? "Analysing…" : "Run Dispatch Analysis"}
            </button>
            {mlHealthy === false && (
              <p className="text-[10px] text-amber-600 font-semibold text-center">
                ML service offline — start the FastAPI engine to run simulations.
              </p>
            )}
          </form>

          {/* Results */}
          <div className="lg:col-span-7">
            {simError ? (
              <div className="h-full bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                <div>
                  <p className="text-xs font-black text-red-700">Simulation Failed</p>
                  <p className="text-[11px] text-red-600 font-semibold mt-0.5">{simError}</p>
                </div>
              </div>
            ) : !occResult && !simLoading ? (
              <div className="h-full bg-gray-50 border border-gray-100 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
                <Zap className="w-8 h-8 text-gray-200" />
                <p className="text-xs text-gray-400 font-semibold text-center max-w-xs">
                  Fill in vehicle, route, date and cargo parameters, then click Run Dispatch Analysis.
                </p>
              </div>
            ) : simLoading ? (
              <div className="h-full bg-gray-50 border border-gray-100 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[200px]">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400 font-bold">Running ML analysis…</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PredictionCard icon={Layers} label="Predicted Occupancy"
                    value={occResult ? `${occResult.predicted_utilization_percent}%` : null}
                    sub={occResult?.recommendation}
                    accent={occResult?.is_underutilized ? "amber" : "emerald"} unavailable={!occResult} />
                  <PredictionCard icon={Clock} label="Expected Delay"
                    value={delayResult ? `${delayResult.predicted_delay_hours} hrs` : null}
                    sub={`Confidence: ${delayResult ? Math.round(delayResult.confidence * 100) : "—"}%`}
                    badge={delayResult?.status} accent="amber" unavailable={!delayResult} />
                  <PredictionCard icon={IndianRupee} label="Estimated Price"
                    value={priceResult ? formatINR(priceResult.suggested_price) : null}
                    sub="ML estimate · not the deterministic booking price"
                    accent="emerald" unavailable={!priceResult} />
                </div>

                {occResult && (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-gray-500">
                      <span>Volume Utilization Forecast</span>
                      <span className={`font-black ${occResult.is_underutilized ? "text-amber-600" : "text-emerald-600"}`}>
                        {occResult.predicted_utilization_percent}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${occResult.is_underutilized ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(occResult.predicted_utilization_percent, 100)}%` }} />
                    </div>
                    <div className={`text-[10px] font-semibold p-2.5 rounded-xl border flex items-center gap-1.5 ${
                      occResult.is_underutilized
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>
                      {occResult.is_underutilized
                        ? <AlertTriangle className="w-3 h-3 shrink-0" />
                        : <CheckCircle className="w-3 h-3 shrink-0" />}
                      {occResult.recommendation}
                    </div>
                  </div>
                )}

                {priceResult && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-700 font-semibold leading-snug">
                      <strong>Estimated price ≠ booking price.</strong> The ML price is advisory only.
                      The authoritative booking price is set by the deterministic pricing engine at booking time.
                    </p>
                  </div>
                )}

                <p className="text-[9px] text-gray-400 font-bold text-right">
                  Generated: {new Date().toLocaleTimeString()} · Models: occupancy/delay/price = RandomForest Regressor
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 3 — MODEL INVENTORY */}
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
        <div className="border-b border-gray-100 pb-4 mb-5">
          <SectionHeader icon={Activity} title="Model Inventory"
            sub="Four models trained from MongoDB historical bookings, vehicles, and routes data." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { name: "Demand Forecast",   algo: "Holt-Winters ExponentialSmoothing", target: "Daily booking count per route",                   input: "route_id, days_ahead",                                    output: "forecast[] { date, predicted_bookings_count }",              lib: "statsmodels" },
            { name: "Occupancy Predictor",algo: "Random Forest Regressor",          target: "Volume utilization % for a vehicle–route–date",   input: "vehicle_id, route_id, date, current_volume, current_weight",output: "predicted_utilization_percent, is_underutilized, recommendation", lib: "scikit-learn" },
            { name: "Delay Predictor",   algo: "Random Forest Regressor",          target: "Predicted delay hours for a dispatch",             input: "vehicle_id, route_id, date",                              output: "predicted_delay_hours, status, confidence",                  lib: "scikit-learn" },
            { name: "Price Estimator",   algo: "Random Forest Regressor",          target: "Estimated booking revenue for given cargo",        input: "route_id, volume, weight, date",                          output: "suggested_price (ML estimate, advisory only)",               lib: "scikit-learn" },
          ].map((m) => (
            <div key={m.name} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg">
                  <BrainCircuit className="w-3.5 h-3.5 text-emerald-700" />
                </div>
                <p className="text-xs font-black text-gray-900">{m.name}</p>
              </div>
              <div className="space-y-2 text-[10px] text-gray-500 font-semibold">
                <div><span className="font-black text-gray-700 block">Algorithm</span><span>{m.algo}</span></div>
                <div><span className="font-black text-gray-700 block">Target</span><span>{m.target}</span></div>
                <div><span className="font-black text-gray-700 block">Input</span><code className="font-mono text-[9px] text-gray-600">{m.input}</code></div>
                <div><span className="font-black text-gray-700 block">Output</span><span>{m.output}</span></div>
                <div className="pt-1 border-t border-gray-200">
                  <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">{m.lib}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 font-semibold mt-4">
          ⓘ All models are trained from real MongoDB data. Click "Retrain Models" to update with the latest data.
          Predictions are advisory and do not modify booking prices or operational decisions.
        </p>
      </div>
    </div>
  );
};

export default ManagerMLIntelligenceView;
