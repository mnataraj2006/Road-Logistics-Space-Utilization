import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Sliders, Truck, Layers, Box, AlertTriangle,
  CheckCircle2, ArrowRight, ShieldCheck, MapPin, RefreshCw, BarChart3
} from 'lucide-react';
import axios from 'axios';

const ManagerOperationsDashboard = () => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [pendingShipments, setPendingShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

      const [resTrips, resVehicles, resBookings] = await Promise.allSettled([
        axios.get('/api/trips', { headers: authHeader }),
        axios.get('/api/vehicles', { headers: authHeader }),
        axios.get('/api/bookings', { headers: authHeader })
      ]);

      setTrips(resTrips.status === 'fulfilled' && Array.isArray(resTrips.value.data) ? resTrips.value.data : []);
      setVehicles(resVehicles.status === 'fulfilled' && Array.isArray(resVehicles.value.data) ? resVehicles.value.data : []);
      
      const allBookings = resBookings.status === 'fulfilled' && Array.isArray(resBookings.value.data) ? resBookings.value.data : [];
      setPendingShipments(allBookings.filter(b => ['PENDING', 'BOOKED'].includes(b.status?.toUpperCase())));
    } catch (err) {
      console.error('Error fetching manager dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const inTransitTrips = trips.filter(t => ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(t.status?.toUpperCase()));
  const readyTrips = trips.filter(t => t.status?.toUpperCase() === 'READY_FOR_DISPATCH' || t.status?.toUpperCase() === 'PLANNED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            Logistics Operations Command Center
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time multi-stop allocation, active trip lifecycle monitoring, and fleet capacity control.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/manager/optimizer"
            className="no-underline inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition"
          >
            <Sliders className="w-4 h-4" />
            <span>Open Optimizer Console</span>
          </Link>
        </div>
      </div>

      {/* First-Login Onboarding Checklist (Requirement 24) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-5 text-white shadow-md border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>Operator Fast-Start Checklist</span>
            </div>
            <h2 className="text-lg font-black text-white mt-0.5">Fleet Operator Activation Guide</h2>
          </div>
          <span className="text-xs text-slate-300">
            {vehicles.length > 0 && trips.length > 0 ? '✓ Operations Live' : 'Complete setup to publish available capacity'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-white/10 rounded-xl border border-emerald-500/30 flex flex-col justify-between">
            <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Step 1
            </span>
            <span className="font-bold text-white mt-1">Company Profile</span>
            <span className="text-[10px] text-emerald-300 mt-1 font-semibold">✓ Completed</span>
          </div>

          <Link to="/manager/fleet" className="no-underline p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex flex-col justify-between transition group">
            <span className="text-slate-400 font-semibold text-[11px]">Step 2</span>
            <span className="font-bold text-white mt-1 group-hover:text-emerald-300">Register First Truck</span>
            <span className="text-[10px] text-slate-400 mt-1">{vehicles.length > 0 ? '✓ ' + vehicles.length + ' Registered' : 'Fleet Console →'}</span>
          </Link>

          <Link to="/manager/routes" className="no-underline p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex flex-col justify-between transition group">
            <span className="text-slate-400 font-semibold text-[11px]">Step 3</span>
            <span className="font-bold text-white mt-1 group-hover:text-emerald-300">Configure Routes</span>
            <span className="text-[10px] text-slate-400 mt-1">Corridor Stops →</span>
          </Link>

          <Link to="/manager/trips" className="no-underline p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex flex-col justify-between transition group">
            <span className="text-slate-400 font-semibold text-[11px]">Step 4</span>
            <span className="font-bold text-white mt-1 group-hover:text-emerald-300">Create First Trip</span>
            <span className="text-[10px] text-slate-400 mt-1">{trips.length > 0 ? '✓ ' + trips.length + ' Trips' : 'Schedule Trip →'}</span>
          </Link>

          <Link to="/manager/fleet" className="no-underline p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex flex-col justify-between transition group">
            <span className="text-slate-400 font-semibold text-[11px]">Step 5</span>
            <span className="font-bold text-white mt-1 group-hover:text-emerald-300">Publish Capacity</span>
            <span className="text-[10px] text-slate-400 mt-1">Marketplace Live →</span>
          </Link>

          <Link to="/manager/optimizer" className="no-underline p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex flex-col justify-between transition group">
            <span className="text-slate-400 font-semibold text-[11px]">Step 6</span>
            <span className="font-bold text-white mt-1 group-hover:text-emerald-300">3D Optimization</span>
            <span className="text-[10px] text-slate-400 mt-1">Run Optimizer →</span>
          </Link>
        </div>
      </div>

      {/* Operational KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Pending Allocations
          </span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {pendingShipments.length}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold mt-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Awaiting optimizer run
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Trips In Transit
          </span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">
            {inTransitTrips.length}
          </span>
          <span className="text-[10px] text-blue-600 font-semibold mt-0.5 flex items-center gap-1">
            <Truck className="w-3 h-3" /> Active on road
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Ready for Dispatch
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {readyTrips.length}
          </span>
          <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Load plan approved
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block">
            Fleet Vehicles
          </span>
          <span className="text-2xl font-black text-gray-900 mt-1 block">
            {vehicles.length}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold mt-0.5">
            Active container assets
          </span>
        </div>
      </div>

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active In-Transit Trips (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600" />
              Active Trips In-Transit ({inTransitTrips.length})
            </h2>
            <Link
              to="/manager/trips"
              className="no-underline text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
            >
              <span>View All Trips</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {inTransitTrips.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              No active trips currently in transit.
            </div>
          ) : (
            <div className="space-y-3">
              {inTransitTrips.map((t) => (
                <div
                  key={t.tripId || t._id}
                  className="border border-gray-200 rounded-xl p-4 hover:border-emerald-300 transition flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-gray-900">
                        {t.tripId}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 font-semibold">
                      Truck: {t.vehicleId} | Route: {t.routeId}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Stop {t.currentStopIndex + 1 || 1} • Next stop operational verification pending
                    </p>
                  </div>

                  <Link
                    to="/manager/live-trip"
                    className="no-underline px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition border border-emerald-200"
                  >
                    Open Live Ops
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Shipments Queue (1 col) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Box className="w-4 h-4 text-amber-600" />
              Pending Cargo Queue
            </h2>
            <span className="text-xs font-bold text-gray-500">
              {pendingShipments.length} items
            </span>
          </div>

          {pendingShipments.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">
              All cargo successfully allocated.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {pendingShipments.map((s) => (
                <div
                  key={s.bookingId || s._id}
                  className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-gray-900">
                      {s.bookingId}
                    </span>
                    <span className="font-semibold text-gray-600">
                      {s.volume}m³ | {s.weight}kg
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-gray-400" />
                    {s.fromStop} → {s.toStop}
                  </p>
                </div>
              ))}
            </div>
          )}

          <Link
            to="/manager/optimizer"
            className="no-underline w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition mt-2 block text-center"
          >
            <span>Run Multi-Stop Optimizer</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ManagerOperationsDashboard;
