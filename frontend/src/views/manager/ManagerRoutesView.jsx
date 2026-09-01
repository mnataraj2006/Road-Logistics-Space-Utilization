import React, { useState, useEffect } from 'react';
import { MapPin, Route as RouteIcon, ArrowRight } from 'lucide-react';
import axios from 'axios';

const ManagerRoutesView = () => {
  const [routes, setRoutes] = useState([]);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/routes', { headers: authHeader });
        setRoutes(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching routes:', err);
      }
    };
    fetchRoutes();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <MapPin className="w-6 h-6 text-emerald-600" />
          Multi-Stop Route Networks & Stop Sequences
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Configured transit corridors, ordered stops, base distance metrics, and stop QR tokens.
        </p>
      </div>

      <div className="space-y-4">
        {routes.map((r) => {
          const stops = r.stopsDetails?.map(s => s.locationName) || r.stops || [r.source, r.destination];
          return (
            <div
              key={r.routeId || r._id}
              className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-black text-gray-900">{r.routeId}</span>
                <span className="text-xs font-bold text-gray-500">{r.distance || 350} km total distance</span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto py-2">
                {stops.map((st, idx) => (
                  <React.Fragment key={idx}>
                    {idx > 0 && <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />}
                    <div className="px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 shrink-0">
                      {idx + 1}. {st}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ManagerRoutesView;
