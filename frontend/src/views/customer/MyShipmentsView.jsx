import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  MapPin,
  Layers,
  Truck,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Search,
  ExternalLink,
  Flame,
  CheckCircle2
} from 'lucide-react';
import axios from 'axios';

const MyShipmentsView = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL');

  const fetchShipments = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await axios.get('/api/shipments', { headers: authHeader });
      const docs = Array.isArray(res.data) ? res.data : (res.data.shipments || []);
      setShipments(docs);
    } catch (err) {
      console.error('Error fetching physical shipments:', err);
      setError(err.response?.data?.message || 'Failed to fetch physical shipments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShipments();
  }, []);

  const filtered = shipments.filter((s) => {
    if (filter === 'ALL') return true;
    return s.status === filter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'IN_TRANSIT':
      case 'LOADED':
      case 'ONBOARD':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'LOCKED':
      case 'READY_TO_LOAD':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'ALLOCATED':
      case 'BOOKED':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-emerald-600" />
            My Physical Cargo Shipments
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative physical consignment specifications, dimensions, gross weight, and operational truck assignment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchShipments}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/customer/search"
            className="no-underline inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Book Space</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {['ALL', 'BOOKED', 'LOCKED', 'IN_TRANSIT', 'DELIVERED'].map((st) => (
          <button
            key={st}
            onClick={() => setFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border-none cursor-pointer ${
              filter === st
                ? 'bg-white text-gray-900 shadow-xs'
                : 'bg-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {st} {st !== 'ALL' && `(${shipments.filter((s) => s.status === st).length})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Shipments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading && shipments.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-200 p-12 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
            <span>Loading physical shipments from database...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-200 p-12 text-center text-xs text-gray-400">
            No physical shipments found matching filter &quot;{filter}&quot;.
          </div>
        ) : (
          filtered.map((s) => {
            const len = s.length || s.dimensions?.length || 0;
            const wid = s.width || s.dimensions?.width || 0;
            const hgt = s.height || s.dimensions?.height || 0;

            return (
              <div
                key={s.shipmentId || s._id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-emerald-300 transition-all space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs font-black text-gray-900 block">
                        {s.shipmentId}
                      </span>
                      {s.bookingId && (
                        <span className="text-[10px] text-gray-400 font-mono">
                          Ref: {s.bookingId}
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(
                        s.status
                      )}`}
                    >
                      {s.status || 'BOOKED'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        {s.pickupStop || 'Origin'} → {s.deliveryStop || 'Destination'}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Description: {s.cargoDescription || 'Standard Consignment'}
                    </p>
                  </div>

                  {/* Physical Specs */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl text-center">
                    <div>
                      <span className="text-[10px] text-gray-400 block font-semibold">Dimensions</span>
                      <span className="font-bold text-gray-900 text-xs">
                        {len}×{wid}×{hgt}m
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-semibold">Volume</span>
                      <span className="font-bold text-gray-900 text-xs">{s.volume} m³</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block font-semibold">Gross Wt</span>
                      <span className="font-bold text-gray-900 text-xs">{s.weight} kg</span>
                    </div>
                  </div>

                  {/* Operational Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-semibold">
                    {s.fragile && (
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                        Fragile
                      </span>
                    )}
                    {s.stackable && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Stackable
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                      Truck: {s.allocatedVehicleId || 'Pending Plan'}
                    </span>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-gray-400">
                    {s.requestedDate ? new Date(s.requestedDate).toLocaleDateString() : 'Date unset'}
                  </span>
                  <Link
                    to={`/customer/track`}
                    state={{ trackingId: s.shipmentId }}
                    className="no-underline inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold text-xs"
                  >
                    <span>Track Live</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default MyShipmentsView;
