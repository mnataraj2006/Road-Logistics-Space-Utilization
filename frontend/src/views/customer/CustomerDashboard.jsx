import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Box, CalendarCheck, MapPin, Truck, ArrowRight,
  TrendingUp, Clock, CheckCircle2, AlertCircle, ShieldCheck
} from 'lucide-react';
import axios from 'axios';

const CustomerDashboard = () => {
  const [stats, setStats] = useState({
    activeShipments: 0,
    activeBookings: 0,
    deliveredShipments: 0,
    totalSpent: 0
  });
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/bookings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        const bookings = Array.isArray(res.data) ? res.data : [];
        setRecentBookings(bookings.slice(0, 5));

        const activeB = bookings.filter(b => ['PENDING', 'BOOKED', 'ALLOCATED', 'IN_TRANSIT'].includes(b.status?.toUpperCase())).length;
        const deliveredB = bookings.filter(b => b.status?.toUpperCase() === 'DELIVERED').length;
        const spent = bookings.reduce((sum, b) => sum + (Number(b.price) || Number(b.revenue) || 0), 0);

        setStats({
          activeShipments: activeB,
          activeBookings: bookings.length,
          deliveredShipments: deliveredB,
          totalSpent: spent
        });
      } catch (err) {
        console.error('Error fetching customer dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 rounded-3xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600/50 text-emerald-200 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" /> Guaranteed Truck Headroom
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
            Book Dynamic Truck Space Across Any Route Stop
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
            Avoid paying full-truckload rates. Share container space with segment-level allocation and deterministic pricing.
          </p>
        </div>

        <Link
          to="/customer/search"
          className="no-underline shrink-0 inline-flex items-center gap-2 px-6 py-3.5 bg-white hover:bg-emerald-50 text-emerald-950 rounded-2xl text-xs font-black shadow-lg transition"
        >
          <Search className="w-4 h-4 text-emerald-700" />
          <span>Find Available Space</span>
          <ArrowRight className="w-4 h-4 text-emerald-700" />
        </Link>
      </div>

      {/* Operational KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Active Consignments
          </span>
          <span className="text-2xl font-black text-gray-900 mt-1 block">
            {stats.activeShipments}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> In-transit & allocated
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Total Bookings
          </span>
          <span className="text-2xl font-black text-gray-900 mt-1 block">
            {stats.activeBookings}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold mt-0.5">
            Lifetime reservations
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Completed Deliveries
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {stats.deliveredShipments}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Successfully delivered
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Total Spend
          </span>
          <span className="text-2xl font-black text-gray-900 mt-1 block">
            ₹{stats.totalSpent.toLocaleString()}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold mt-0.5">
            Deterministic rate card
          </span>
        </div>
      </div>

      {/* Recent Bookings & Transit Status */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
            Recent Space Reservations
          </h2>
          <Link
            to="/customer/bookings"
            className="no-underline text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            <span>View All Bookings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentBookings.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-xs">
            No bookings found. Start by searching for available truck space!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Booking ID</th>
                  <th className="pb-3 font-semibold">Route Segment</th>
                  <th className="pb-3 font-semibold">Truck Asset</th>
                  <th className="pb-3 font-semibold">Volume / Wt</th>
                  <th className="pb-3 font-semibold">Price</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentBookings.map((b) => (
                  <tr key={b.bookingId || b._id} className="hover:bg-gray-50/70 transition">
                    <td className="py-3 font-mono font-bold text-gray-900">
                      {b.bookingId || 'BKG-N/A'}
                    </td>
                    <td className="py-3 font-semibold text-gray-700">
                      {b.fromStop || 'Origin'} → {b.toStop || 'Destination'}
                    </td>
                    <td className="py-3 text-gray-600 font-medium">
                      {b.vehicleId || 'UNASSIGNED'}
                    </td>
                    <td className="py-3 text-gray-700">
                      {b.volume} m³ / {b.weight} kg
                    </td>
                    <td className="py-3 font-bold text-gray-900">
                      ₹{(b.price || b.revenue || 0).toLocaleString()}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        b.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                        b.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {b.status || 'PENDING'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        to="/customer/track"
                        className="no-underline text-xs font-bold text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3" /> Track
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerDashboard;
