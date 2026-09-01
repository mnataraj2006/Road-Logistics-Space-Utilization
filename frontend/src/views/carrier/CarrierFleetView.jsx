import React, { useState, useEffect } from 'react';
import { Truck, ShieldCheck, MapPin, Activity, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

const CarrierFleetView = () => {
  const [fleet, setFleet] = useState([]);

  useEffect(() => {
    const fetchCarrierFleet = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/vehicles', { headers: authHeader });
        setFleet(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching carrier fleet:', err);
      }
    };
    fetchCarrierFleet();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6 text-emerald-600" />
          Carrier Fleet Assets & Deployment
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Monitor your active vehicle fleet, assigned routes, and operational readiness.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {fleet.map((v) => (
          <div
            key={v.vehicleId || v._id}
            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-gray-900">{v.vehicleId}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {v.transitStatus || 'READY'}
              </span>
            </div>

            <p className="text-xs text-gray-600">
              Assigned Lane: <strong>{v.routeLane || 'Chennai - Madurai Corridor'}</strong>
            </p>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold">Volume Cap</span>
                <span className="font-bold text-gray-900">{v.capacityVolume || 100} m³</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block font-semibold">Weight Cap</span>
                <span className="font-bold text-gray-900">{v.capacityWeight || 20000} kg</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CarrierFleetView;
