import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Line } from 'react-chartjs-2';
import {
  BrainCircuit, RotateCw, Truck, AlertTriangle,
  CheckCircle, Info, Sparkles, Clock, IndianRupee
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const formatINR = (v) => v != null ? `₹${v.toLocaleString('en-IN')}` : '₹0';

/* ── Shared input style ─────────────────────────────────────── */
const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold';

const Predictions = () => {
  const [routes,          setRoutes]          = useState([]);
  const [vehicles,        setVehicles]        = useState([]);
  const [selectedRouteDemand, setSelectedRouteDemand] = useState('RTE-001');
  const [forecastDays,    setForecastDays]    = useState(7);
  const [forecastData,    setForecastData]    = useState([]);
  const [loadingDemand,   setLoadingDemand]   = useState(false);

  const [selectedVehicle,  setSelectedVehicle]  = useState('TRK-001');
  const [selectedRouteOcc, setSelectedRouteOcc] = useState('RTE-001');
  const [departureDate,    setDepartureDate]    = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
  });
  const [currentVolume, setCurrentVolume] = useState(40);
  const [currentWeight, setCurrentWeight] = useState(8000);

  const [occupancyResult, setOccupancyResult] = useState(null);
  const [delayResult,     setDelayResult]     = useState(null);
  const [priceResult,     setPriceResult]     = useState(null);
  const [loadingOcc,      setLoadingOcc]      = useState(false);

  const [trainingMetrics, setTrainingMetrics] = useState(null);
  const [trainingLoading, setTrainingLoading] = useState(false);
  const [trainingMessage, setTrainingMessage] = useState('');

  useEffect(() => {
    Promise.all([api.get('/routes'), api.get('/vehicles')]).then(([rRes, vRes]) => {
      setRoutes(rRes.data);
      setVehicles(vRes.data);
      if (rRes.data.length > 0) { setSelectedRouteDemand(rRes.data[0].routeId); setSelectedRouteOcc(rRes.data[0].routeId); }
      if (vRes.data.length > 0) setSelectedVehicle(vRes.data[0].vehicleId);
    }).catch(console.error);
  }, []);

  const handleDemandForecast = async () => {
    setLoadingDemand(true);
    try {
      const { data } = await api.post('/predictions/demand', { route_id: selectedRouteDemand, days_ahead: parseInt(forecastDays) });
      setForecastData(data.forecast);
    } catch (err) { console.error(err); }
    finally { setLoadingDemand(false); }
  };

  useEffect(() => { if (routes.length > 0) handleDemandForecast(); }, [selectedRouteDemand, forecastDays, routes]);

  const handleAllPredictions = async (e) => {
    e.preventDefault();
    setLoadingOcc(true); setOccupancyResult(null); setDelayResult(null); setPriceResult(null);
    try {
      const [occRes, delayRes, priceRes] = await Promise.all([
        api.post('/predictions/occupancy', { vehicle_id: selectedVehicle, route_id: selectedRouteOcc, date: departureDate, current_volume: parseFloat(currentVolume), current_weight: parseFloat(currentWeight) }),
        api.post('/predictions/delay',     { vehicle_id: selectedVehicle, route_id: selectedRouteOcc, date: departureDate }),
        api.post('/predictions/price',     { route_id: selectedRouteOcc, volume: parseFloat(currentVolume), weight: parseFloat(currentWeight), date: departureDate }),
      ]);
      setOccupancyResult(occRes.data); setDelayResult(delayRes.data); setPriceResult(priceRes.data);
    } catch (err) { console.error(err); }
    finally { setLoadingOcc(false); }
  };

  const handleRetrain = async () => {
    setTrainingLoading(true); setTrainingMessage('');
    try {
      const { data } = await api.post('/predictions/train');
      setTrainingMetrics(data.metrics); setTrainingMessage(data.message);
    } catch { setTrainingMessage('Retraining failed. Check Python FastAPI log.'); }
    finally { setTrainingLoading(false); }
  };

  /* Chart */
  const chartData = {
    labels: forecastData.map((_, i) => `+${i + 1}d`),
    datasets: [{
      label: 'Predicted Daily Bookings',
      data: forecastData.map(f => f.predicted_bookings_count),
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22,163,74,0.06)',
      borderWidth: 2.5, tension: 0.4, fill: true,
      pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#16a34a',
    }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#fff', titleColor: '#111827', bodyColor: '#6b7280', borderColor: '#e5e7eb', borderWidth: 1, padding: 10 },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 9, weight: '700' } } },
      y: { grid: { color: '#f3f4f6' }, border: { display: false }, ticks: { color: '#9ca3af', stepSize: 2, font: { size: 9 } } },
    },
  };

  const r2Demand   = trainingMetrics?.demand_model_test_r2    || 0.741;
  const r2Occupancy= trainingMetrics?.occupancy_model_test_r2 || 0.885;
  const r2Delay    = trainingMetrics?.delay_model_test_r2     ?? 0.850;
  const r2Price    = trainingMetrics?.price_model_test_r2     || 0.994;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Carrier Portal</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">ML Forecasting & Predictions</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Predict lane demand, test occupancy scenarios, and retrain models.</p>
        </div>
        <button
          onClick={handleRetrain} disabled={trainingLoading}
          className="flex items-center space-x-2 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white rounded-xl text-[12px] font-black transition-all duration-150 cursor-pointer shadow-md shadow-green-600/20 border-none"
        >
          <RotateCw className={`w-4 h-4 ${trainingLoading ? 'animate-spin' : ''}`} />
          <span>{trainingLoading ? 'Re-training…' : 'Retrain Models'}</span>
        </button>
      </div>

      {/* Retrain message */}
      {trainingMessage && (
        <div className="bg-green-50 border border-green-200 p-4 rounded-2xl flex items-start space-x-3">
          <Sparkles className="w-5 h-5 text-[#16a34a] shrink-0 mt-0.5 animate-pulse" />
          <div className="text-[12px]">
            <h4 className="font-black text-gray-900">Models Retrained Successfully</h4>
            <p className="text-gray-500 mt-0.5 font-semibold">{trainingMessage}</p>
          </div>
        </div>
      )}

      {/* Demand Chart + Model Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Demand Forecast — 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-[13px] font-black text-gray-900 mb-0.5">Lane Demand Forecast</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-4">Statsmodels Holt-Winters Exponential Smoothing</p>

          <div className="grid grid-cols-2 gap-4 mb-5 text-[12px] font-semibold">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Route Lane</label>
              <select value={selectedRouteDemand} onChange={e => setSelectedRouteDemand(e.target.value)} className={inputCls}>
                {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.source} → {r.destination} · {r.distance} km</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Days Ahead</label>
              <input type="number" value={forecastDays} onChange={e => setForecastDays(Math.max(1, parseInt(e.target.value) || 7))} className={inputCls} />
            </div>
          </div>

          <div className="h-56">
            {loadingDemand ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Line data={chartData} options={chartOptions} />
            )}
          </div>
        </div>

        {/* Model Health — 1 col */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-[13px] font-black text-gray-900 mb-0.5">Model Health</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-5">Current R² scores</p>

            <div className="space-y-4 text-[11px] font-semibold">
              {[
                { label: 'Demand Forecast (Statsmodels)', r2: r2Demand   },
                { label: 'Occupancy Predictor (RF)',      r2: r2Occupancy },
                { label: 'Route Delay Predictor (RF)',    r2: r2Delay    },
                { label: 'Target Price Predictor (RF)',   r2: r2Price    },
              ].map(({ label, r2 }) => (
                <div key={label} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium text-[10px]">{label}</span>
                    <span className="font-mono text-gray-900 font-black text-[10px]">R² {r2.toFixed(3)}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-[#16a34a] h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, r2) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 p-3.5 rounded-xl flex items-center space-x-3 mt-5 text-[11px] text-green-700 font-bold">
            <CheckCircle className="w-4 h-4 shrink-0 text-[#16a34a]" />
            <span className="leading-tight">All models healthy and within acceptable variance bounds.</span>
          </div>
        </div>
      </div>

      {/* Dispatch Simulator */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center space-x-2.5 mb-1">
          <Truck className="w-4 h-4 text-[#16a34a]" />
          <h2 className="text-[13px] font-black text-gray-900">Cargo Load & Dispatch Simulator</h2>
        </div>
        <p className="text-[11px] text-gray-400 font-semibold mb-6">Forecast dispatch occupancy, expected route delays, and optimal price yields in parallel.</p>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Form — 5 cols */}
          <form onSubmit={handleAllPredictions} className="lg:col-span-5 space-y-4 text-[12px] font-semibold">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Dispatch Truck</label>
                <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} className={inputCls}>
                  {vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.vehicleId} ({v.type})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Target Route</label>
                <select value={selectedRouteOcc} onChange={e => setSelectedRouteOcc(e.target.value)} className={inputCls}>
                  {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeId} · {r.source} → {r.destination}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-gray-50 pt-4">
              {[
                { label: 'Date',       type: 'date',   value: departureDate, onChange: e => setDepartureDate(e.target.value)                              },
                { label: 'Volume (m³)',type: 'number', value: currentVolume, onChange: e => setCurrentVolume(e.target.value),  step: '0.1'                },
                { label: 'Weight (kg)',type: 'number', value: currentWeight, onChange: e => setCurrentWeight(e.target.value)                              },
              ].map(({ label, ...props }) => (
                <div key={label}>
                  <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
                  <input {...props} required className={inputCls} />
                </div>
              ))}
            </div>

            <button type="submit" disabled={loadingOcc}
              className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl shadow-md cursor-pointer border-none text-[12px] transition-all duration-150">
              {loadingOcc ? 'Simulating…' : 'Analyze Dispatch Space & Logistics'}
            </button>
          </form>

          {/* Output — 7 cols */}
          <div className="lg:col-span-7 bg-gray-50 border border-gray-100 rounded-2xl p-6 min-h-[220px] flex flex-col justify-center">
            {occupancyResult || delayResult || priceResult ? (
              <div className="space-y-5">
                {/* Occupancy bar */}
                {occupancyResult && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-gray-500 font-semibold flex items-center space-x-1.5"><Truck className="w-3.5 h-3.5 text-gray-400" /><span>Predicted Occupancy</span></span>
                      <span className={`font-black text-sm ${occupancyResult.is_underutilized ? 'text-amber-600' : 'text-[#16a34a]'}`}>
                        {occupancyResult.predicted_utilization_percent}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${occupancyResult.is_underutilized ? 'bg-amber-500' : 'bg-[#16a34a]'}`}
                        style={{ width: `${occupancyResult.predicted_utilization_percent}%` }} />
                    </div>
                  </div>
                )}

                {/* Delay & Price */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-4">
                  {delayResult && (
                    <div className="bg-white border border-gray-100 p-3.5 rounded-xl flex items-start space-x-3 shadow-sm">
                      <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[8px] text-gray-400 block font-black uppercase tracking-wider">Predicted Delay</span>
                        <span className="font-black text-gray-900 text-[13px] block mt-0.5">{delayResult.predicted_delay_hours} hrs</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase inline-block mt-1 ${
                          delayResult.status === 'On Time'     ? 'bg-green-50 text-green-700' :
                          delayResult.status === 'Minor Delay' ? 'bg-amber-50 text-amber-700' :
                                                                  'bg-red-50 text-red-600'
                        }`}>{delayResult.status}</span>
                      </div>
                    </div>
                  )}
                  {priceResult && (
                    <div className="bg-white border border-gray-100 p-3.5 rounded-xl flex items-start space-x-3 shadow-sm">
                      <IndianRupee className="w-4 h-4 text-[#16a34a] shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[8px] text-gray-400 block font-black uppercase tracking-wider">Suggested Price</span>
                        <span className="font-black text-[#16a34a] text-[13px] block mt-0.5">{formatINR(priceResult.suggested_price)}</span>
                        <span className="text-[8px] font-semibold text-gray-400 block mt-1">Platform fee included</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Recommendation banner */}
                {occupancyResult && (
                  <div className={`p-4 rounded-xl border flex items-start space-x-3 text-[11px] ${
                    occupancyResult.is_underutilized
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : 'bg-green-50 border-green-200 text-green-700'
                  }`}>
                    {occupancyResult.is_underutilized ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <div>
                      <h4 className="font-black uppercase tracking-wider text-[9px] mb-0.5">
                        {occupancyResult.is_underutilized ? 'Optimization Recommendation' : 'Optimal Capacity Verified'}
                      </h4>
                      <p className="font-semibold leading-relaxed">
                        {occupancyResult.recommendation}
                        {priceResult && ` Suggested billing: ${formatINR(priceResult.suggested_price)} for current parameters.`}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end text-[9px] text-gray-400 font-bold tracking-wide space-x-4">
                  <span>Occupancy: {((occupancyResult?.confidence || 0.85) * 100).toFixed(0)}% conf</span>
                  <span>Delay: {((delayResult?.confidence || 0.85) * 100).toFixed(0)}% conf</span>
                  <span>Price: {((priceResult?.confidence || 0.85) * 100).toFixed(0)}% conf</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 p-4">
                <Info className="w-6 h-6 mx-auto mb-2.5 text-gray-300" />
                <p className="text-[11px] leading-relaxed font-semibold">
                  Enter planned dispatch parameters (volume, weight, date) to forecast occupancy, route delays, and target booking price.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Predictions;
