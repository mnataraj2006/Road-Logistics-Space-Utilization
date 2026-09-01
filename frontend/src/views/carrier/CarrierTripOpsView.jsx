import React, { useState } from 'react';
import { ShieldCheck, QrCode, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';

const CarrierTripOpsView = () => {
  const [tripId, setTripId] = useState('TRIP-LIVE-DEMO');
  const [qrToken, setQrToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.post('/api/transit/verify-stop', {
        tripId,
        qrToken,
        performedBy: 'carrier-driver'
      }, { headers: authHeader });
      setResult(res.data);
    } catch (err) {
      console.error('Stop verify error:', err);
      setError(err.response?.data?.message || 'Stop verification rejected.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          Driver Stop Arrival & QR Scan Terminal
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Scan facility QR tokens at each physical checkpoint to unlock loading and unloading.
        </p>
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>Stop Checkpoint Completed!</span>
          </div>
          <p className="text-xs text-emerald-800">
            Location: <strong>{result.location || 'Salem'}</strong> | Unloaded: {result.unloadedCount || 1} packages | Loaded: {result.loadedCount || 1} packages
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Trip ID</label>
            <input
              type="text"
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Stop QR / Token</label>
            <div className="relative">
              <QrCode className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder="Scan QR or enter token"
                required
                className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition border-none cursor-pointer"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Confirm Stop Arrival'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CarrierTripOpsView;
