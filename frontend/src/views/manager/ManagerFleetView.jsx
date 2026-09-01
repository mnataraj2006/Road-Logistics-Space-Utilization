import React, { useState, useEffect } from 'react';
import { Truck, ShieldCheck, MapPin, Layers } from 'lucide-react';
import axios from 'axios';

const ManagerFleetView = () => {
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const token = localStorage.getItem('token');
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await axios.get('/api/vehicles', { headers: authHeader });
        setVehicles(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error fetching fleet:', err);
      }
    };
    fetchVehicles();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Truck className="w-6 h-6 text-emerald-600" />
          Fleet Asset Specifications & Status
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Vehicle gross capacity, 3D interior cargo-space dimensions, and lane assignment.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vehicles.map((v) => (
          <div
            key={v.vehicleId || v._id}
            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-black text-gray-900">{v.vehicleId}</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {v.status || 'Active'}
              </span>
            </div>

            <p className="text-xs text-gray-600">
              Type: <strong>{v.type || 'Container Truck'}</strong> • Route: <strong>{v.routeLane || 'RTE-1'}</strong>
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
              <div className="col-span-2 pt-1">
                <span className="text-[10px] text-gray-400 block font-semibold">Interior Dimensions</span>
                <span className="font-semibold text-gray-700">
                  {v.dimensions?.length || 13.6}m L × {v.dimensions?.width || 2.45}m W × {v.dimensions?.height || 3.0}m H
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ManagerFleetView;
