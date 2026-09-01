import React, { useState, useEffect } from 'react';
import { Box, Plus, MapPin, Layers, AlertCircle, ShieldCheck } from 'lucide-react';
import axios from 'axios';

const MyShipmentsView = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchShipments = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/bookings', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setShipments(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching shipments:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchShipments();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-emerald-600" />
            My Physical Cargo Requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Track package specs, volume, weight, dimensions, and operational status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {shipments.length === 0 ? (
          <div className="col-span-full bg-white rounded-2xl border border-gray-200 p-8 text-center text-xs text-gray-400">
            No physical shipments registered yet.
          </div>
        ) : (
          shipments.map((s) => (
            <div
              key={s.shipmentId || s.bookingId || s._id}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-emerald-300 transition-all space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-gray-900">
                  {s.shipmentId || s.bookingId}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  s.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                  s.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {s.status || 'DRAFT'}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {s.fromStop || s.pickupStop || 'Origin'} → {s.toStop || s.deliveryStop || 'Destination'}
                </p>
                <p className="text-[11px] text-gray-500">
                  Description: {s.cargoDescription || 'Standard Consignment'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                <div>
                  <span className="text-[10px] text-gray-400 block font-semibold">Volume</span>
                  <span className="font-bold text-gray-900">{s.volume} m³</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block font-semibold">Weight</span>
                  <span className="font-bold text-gray-900">{s.weight} kg</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MyShipmentsView;
