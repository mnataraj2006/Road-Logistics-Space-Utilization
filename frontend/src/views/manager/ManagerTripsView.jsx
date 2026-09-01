import React, { useState, useEffect } from 'react';
import { Route as RouteIcon, Truck, Play, CheckCircle2, AlertTriangle, Layers, MapPin } from 'lucide-react';
import axios from 'axios';

const ManagerTripsView = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/trips', { headers: authHeader });
        setTrips(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching trips:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <RouteIcon className="w-6 h-6 text-emerald-600" />
          Trips & Dispatch Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage lifecycle state transitions from PLANNED → READY_FOR_DISPATCH → IN_TRANSIT → COMPLETED.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        {trips.length === 0 ? (
          <div className="text-center py-10 text-xs text-gray-400">
            No active trips created yet.
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((t) => (
              <div
                key={t.tripId || t._id}
                className="border border-gray-200 rounded-2xl p-5 hover:border-emerald-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-gray-900">
                      {t.tripId}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      t.status === 'IN_TRANSIT' || t.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {t.status}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-700">
                    Vehicle: <strong>{t.vehicleId}</strong> • Route: <strong>{t.routeId}</strong>
                  </p>

                  <p className="text-[11px] text-gray-500">
                    Current Stop: Stop #{t.currentStopIndex + 1 || 1} • Driver: {t.driverName || 'Fastlane Fleet Assigned'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="/manager/live-trip"
                    className="no-underline px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition border border-emerald-200"
                  >
                    View Live Ops
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagerTripsView;
