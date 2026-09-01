import React, { useState, useEffect } from 'react';
import { Box, Search, MapPin, Layers, Filter } from 'lucide-react';
import axios from 'axios';

const ManagerShipmentsView = () => {
  const [shipments, setShipments] = useState([]);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    const fetchShipments = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/bookings', { headers: authHeader });
        setShipments(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching shipments:', err);
      }
    };
    fetchShipments();
  }, []);

  const filtered = shipments.filter(s => {
    if (filter === 'ALL') return true;
    return s.status?.toUpperCase() === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-emerald-600" />
            Consignment Pool & Cargo Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Global view of pending, allocated, and in-transit physical cargo consignments.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {['ALL', 'PENDING', 'BOOKED', 'ALLOCATED', 'IN_TRANSIT', 'DELIVERED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border-none cursor-pointer ${
                filter === st ? 'bg-white text-gray-900 shadow-xs' : 'bg-transparent text-gray-500'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                <th className="pb-3 font-semibold">Shipment / Booking ID</th>
                <th className="pb-3 font-semibold">Customer / Shipper</th>
                <th className="pb-3 font-semibold">Segment (Origin → Dest)</th>
                <th className="pb-3 font-semibold">Volume (m³)</th>
                <th className="pb-3 font-semibold">Weight (kg)</th>
                <th className="pb-3 font-semibold">Assigned Truck</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((s) => (
                <tr key={s.bookingId || s._id} className="hover:bg-gray-50/70 transition">
                  <td className="py-3 font-mono font-bold text-gray-900">
                    {s.bookingId || s.shipmentId}
                  </td>
                  <td className="py-3 font-semibold text-gray-700">
                    {s.shipperId || s.customer || 'Shipper'}
                  </td>
                  <td className="py-3 text-gray-800 font-medium">
                    {s.fromStop} → {s.toStop}
                  </td>
                  <td className="py-3 font-bold text-emerald-700">
                    {s.volume} m³
                  </td>
                  <td className="py-3 font-bold text-gray-900">
                    {s.weight} kg
                  </td>
                  <td className="py-3 text-gray-600 font-mono">
                    {s.vehicleId || 'UNASSIGNED'}
                  </td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      s.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                      s.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {s.status || 'PENDING'}
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

export default ManagerShipmentsView;
