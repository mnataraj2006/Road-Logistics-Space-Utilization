import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  QrCode, Truck, CheckCircle2, AlertTriangle, ArrowRight,
  ShieldCheck, Box, Package, RefreshCw, Navigation
} from 'lucide-react';
import api from '../services/api';

const inputCls = 'w-full bg-gray-50 border border-gray-200 px-4 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 font-semibold text-xs transition-all';

const StopScan = () => {
  const [searchParams] = useSearchParams();
  const [vehicleId, setVehicleId] = useState(searchParams.get('vehicleId') || '');
  const [stopId, setStopId] = useState(searchParams.get('stopId') || '');
  const [qrToken, setQrToken] = useState(searchParams.get('qrToken') || '');
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleTokenChange = (val) => {
    setQrToken(val);
    if (val.startsWith('STP-SEC.')) {
      try {
        const parts = val.split('.');
        if (parts.length === 3) {
          let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4) b64 += '=';
          const payload = JSON.parse(atob(b64));
          if (payload.stopId && !stopId) {
            setStopId(payload.stopId);
          }
          if (payload.vehicleId && !vehicleId) {
            setVehicleId(payload.vehicleId);
          }
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    if (!vehicleId.trim() || !qrToken.trim() || !stopId.trim()) {
      setError('Please enter Truck ID, Stop ID, and QR Verification Token.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const { data } = await api.post('/transit/verify-stop', {
        vehicleId: vehicleId.trim(),
        stopId: stopId.trim(),
        qrToken: qrToken.trim(),
        secureToken: qrToken.trim()
      });
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Stop verification failed. Please check token or truck state.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (searchParams.get('vehicleId') && searchParams.get('qrToken')) {
      handleVerify();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans">
      
      {/* Header */}
      <div className="max-w-xl mx-auto w-full flex justify-between items-center py-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 bg-[#16a34a] rounded-xl flex items-center justify-center shadow-lg shadow-green-600/30">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-sm font-black text-white tracking-tight block">Cargolytics Transit Authority</span>
            <span className="text-[9px] font-black text-[#16a34a] uppercase tracking-[0.2em] block">Physical Stop Verification</span>
          </div>
        </div>
        <Link to="/" className="text-xs font-bold text-slate-400 hover:text-white no-underline">
          Control Tower
        </Link>
      </div>

      {/* Main Container */}
      <div className="max-w-xl mx-auto w-full py-8 space-y-6">
        
        {/* Verification Result Card */}
        {result ? (
          <div className="bg-slate-800/90 border border-green-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-fadeIn">
            <div className="flex items-center space-x-3 pb-4 border-b border-slate-700">
              <div className="w-12 h-12 bg-green-500/20 border border-green-500/40 rounded-2xl flex items-center justify-center text-green-400">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-green-400 tracking-widest bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
                  STOP VERIFIED
                </span>
                <h2 className="text-2xl font-black text-white mt-1.5">{result.stop} Stop</h2>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">Verified for Truck: <span className="text-white font-black">{result.vehicleId}</span> at {result.arrivalTime}</p>
              </div>
            </div>

            {/* Operations Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700/60">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Unloaded at Stop</span>
                <span className="text-xl font-black text-amber-400">{result.operations?.unloadedCount || 0}</span>
                <span className="text-[10px] text-slate-400 block font-semibold">Packages</span>
              </div>
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700/60">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Loaded at Stop</span>
                <span className="text-xl font-black text-green-400">{result.operations?.loadedCount || 0}</span>
                <span className="text-[10px] text-slate-400 block font-semibold">Packages</span>
              </div>
            </div>

            {/* Post-Operation Capacity */}
            {result.capacityAfter && (
              <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-700/60 space-y-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Post-Arrival Capacity Status</span>
                <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Volume Space</span>
                    <span className="text-white font-black">{result.capacityAfter.usedVolume} / {result.capacityAfter.capacityVolume} m³</span>
                    <span className="text-green-400 text-[10px] block font-bold">({result.capacityAfter.remainingVolume} m³ free)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Cargo Weight</span>
                    <span className="text-white font-black">{result.capacityAfter.usedWeight} / {result.capacityAfter.capacityWeight} kg</span>
                    <span className="text-green-400 text-[10px] block font-bold">({result.capacityAfter.remainingWeight} kg free)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Next Stop Info */}
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl flex items-center justify-between text-xs font-bold text-green-300">
              <div className="flex items-center space-x-2">
                <Navigation className="w-4 h-4 text-green-400" />
                <span>Next Transit Stop: {result.isFinalStop ? 'FINAL DESTINATION (TRIP COMPLETED)' : result.nextStop}</span>
              </div>
              <span className="text-[9px] uppercase px-2 py-0.5 rounded bg-green-500/20 text-green-200 font-black">{result.transitStatus}</span>
            </div>

            <button
              onClick={() => { setResult(null); setQrToken(''); }}
              className="w-full py-3.5 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-xl text-xs cursor-pointer border-none transition-all"
            >
              Scan Another Stop
            </button>
          </div>
        ) : (
          /* Verification Form */
          <div className="bg-slate-800/80 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div>
              <div className="flex items-center space-x-2 text-[#16a34a] mb-1">
                <QrCode className="w-5 h-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Backend-Authoritative Scan</span>
              </div>
              <h1 className="text-xl font-black text-white">Physical Stop QR Verification</h1>
              <p className="text-xs text-slate-400 font-semibold mt-1">Scan or input physical stop QR token to execute loading/unloading and advance trip index.</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl text-red-300 text-xs font-bold flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Truck Vehicle ID</label>
                <input
                  type="text"
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  placeholder="e.g. TRUCK-101"
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Stop Identifier (stopId)</label>
                <input
                  type="text"
                  value={stopId}
                  onChange={(e) => setStopId(e.target.value)}
                  placeholder="e.g. STP-2 or Salem"
                  required
                  className={inputCls}
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Scanned Stop QR Token</label>
                <input
                  type="text"
                  value={qrToken}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  placeholder="e.g. STPTKN-a1b2c3d4..."
                  required
                  className={inputCls}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-xs shadow-lg shadow-green-600/30 flex items-center justify-center space-x-2 cursor-pointer border-none transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Authority & Executing Stop...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>VERIFY PHYSICAL ARRIVAL</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="max-w-xl mx-auto w-full text-center py-4 border-t border-slate-800 text-[10px] text-slate-500 font-bold">
        © 2026 Cargolytics Logistics · Backend-Authoritative Stop Verification System
      </div>

    </div>
  );
};

export default StopScan;
