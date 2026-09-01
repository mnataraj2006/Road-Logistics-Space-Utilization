import React, { useState } from 'react';
import { ShieldCheck, QrCode, CheckCircle2, AlertTriangle, RefreshCw, MapPin, Truck } from 'lucide-react';
import axios from 'axios';

const ManagerStopOpsView = () => {
  const [tripId, setTripId] = useState('TRIP-LIVE-DEMO');
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [error, setError] = useState(null);

  const handleVerifyToken = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setVerifyResult(null);

    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await axios.post(
        '/api/transit/verify-stop',
        {
          tripId,
          qrToken: tokenInput,
          performedBy: 'manager-ops'
        },
        { headers: authHeader }
      );

      setVerifyResult(response.data);
    } catch (err) {
      console.error('Stop verification error:', err);
      setError(err.response?.data?.message || 'Security verification failed. Invalid token, out-of-order scan, or token reused.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-600" />
          Cryptographic Stop Verification & Arrival Execution
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Validate single-use HMAC stop tokens, enforce strict linear sequence, and commit unload/load operations atomically.
        </p>
      </div>

      {verifyResult && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-6 shadow-xs space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-emerald-950">
                Stop Arrival & Security Verified!
              </h4>
              <p className="text-xs text-emerald-800">
                Stop: <strong>{verifyResult.location || 'Salem'}</strong> | Trip: <strong>{verifyResult.tripId || tripId}</strong>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-200 text-xs">
            <div>
              <span className="text-[10px] text-emerald-700 block">Unloaded Packages</span>
              <strong className="text-emerald-950">{verifyResult.unloadedCount || 1} packages delivered</strong>
            </div>
            <div>
              <span className="text-[10px] text-emerald-700 block">Loaded Downstream Cargo</span>
              <strong className="text-emerald-950">{verifyResult.loadedCount || 1} packages boarded</strong>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleVerifyToken} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Active Trip Identifier
            </label>
            <input
              type="text"
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              placeholder="e.g. TRIP-1788258000"
              required
              className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">
              Scanned Stop Security Token (or HMAC STP-SEC... string)
            </label>
            <div className="relative">
              <QrCode className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Scan QR or paste STP-SEC token / QR token"
                required
                className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>Verify & Execute Stop</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManagerStopOpsView;
