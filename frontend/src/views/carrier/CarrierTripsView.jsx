import React, { useState, useEffect } from 'react';
import { Route as RouteIcon, Truck, MapPin } from 'lucide-react';
import axios from 'axios';

const CarrierTripsView = () => {
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/trips', { headers: authHeader });
        setTrips(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching carrier trips:', err);
      }
    };
    fetchTrips();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <RouteIcon className="w-6 h-6 text-emerald-600" />
          Carrier Assigned Trips & Route Manifests
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review dispatch schedules, assigned vehicle assets, and delivery stops.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-3">
        {trips.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">No active trips assigned.</div>
        ) : (
          trips.map((t) => (
            <div
              key={t.tripId || t._id}
              className="p-4 border border-gray-200 rounded-xl hover:border-emerald-300 transition flex items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-gray-900">{t.tripId}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-gray-700">
                  Vehicle: <strong>{t.vehicleId}</strong> • Route: <strong>{t.routeId}</strong>
                </p>
              </div>

              <a
                href="/carrier/trip-ops"
                className="no-underline px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition border border-emerald-200"
              >
                Driver Ops
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CarrierTripsView;
