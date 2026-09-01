import React, { useState, useEffect } from 'react';
import { CalendarCheck, Box, Search, ShieldCheck, MapPin, Truck, FileText } from 'lucide-react';
import axios from 'axios';

const MyBookingsView = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/bookings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setBookings(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error loading bookings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, []);

  const filtered = bookings.filter((b) => {
    if (filter === 'ALL') return true;
    return b.status?.toUpperCase() === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-emerald-600" />
            My Capacity Bookings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Commercial reservations and deterministic pricing breakdowns.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {['ALL', 'PENDING', 'ALLOCATED', 'IN_TRANSIT', 'DELIVERED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border-none cursor-pointer ${
                filter === st
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'bg-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-xs">
            No bookings found matching current filter.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((b) => (
              <div
                key={b.bookingId || b._id}
                className="border border-gray-200 rounded-2xl p-5 hover:border-emerald-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-black text-gray-900">
                      {b.bookingId}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                      Truck: {b.vehicleId || 'UNASSIGNED'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      b.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                      b.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {b.status || 'PENDING'}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Segment: {b.fromStop} → {b.toStop}</span>
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>Vol: <strong>{b.volume} m³</strong></span>
                    <span>•</span>
                    <span>Wt: <strong>{b.weight} kg</strong></span>
                    <span>•</span>
                    <span>Date: <strong>{new Date(b.date).toLocaleDateString()}</strong></span>
                  </div>
                </div>

                {/* Price Breakdown Preview */}
                <div className="shrink-0 text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Confirmed Price
                  </span>
                  <span className="text-lg font-black text-gray-900">
                    ₹{(b.price || b.revenue || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-gray-400 block">
                    Rule: {b.pricingRuleVersion || 'v2.1-DETERMINISTIC'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyBookingsView;
