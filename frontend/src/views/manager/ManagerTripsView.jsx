import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Route as RouteIcon,
  Truck,
  Play,
  CheckCircle2,
  AlertTriangle,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Calendar,
  X,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import api from '../../services/api';

const getLocalDateTimeString = (date = new Date()) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const ManagerTripsView = () => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dispatchingId, setDispatchingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    vehicleId: '',
    routeId: '',
    plannedDeparture: getLocalDateTimeString()
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resTrips, resVehicles, resRoutes] = await Promise.allSettled([
        api.get('/trips'),
        api.get('/vehicles'),
        api.get('/routes')
      ]);

      if (resTrips.status === 'fulfilled' && Array.isArray(resTrips.value.data)) {
        setTrips(resTrips.value.data);
      }
      if (resVehicles.status === 'fulfilled' && Array.isArray(resVehicles.value.data)) {
        const vList = resVehicles.value.data;
        setVehicles(vList);
        if (!form.vehicleId && vList.length > 0) {
          setForm((prev) => ({ ...prev, vehicleId: vList[0].vehicleId }));
        }
      }
      if (resRoutes.status === 'fulfilled' && Array.isArray(resRoutes.value.data)) {
        const rList = resRoutes.value.data;
        setRoutes(rList);
        if (!form.routeId && rList.length > 0) {
          setForm((prev) => ({ ...prev, routeId: rList[0].routeId }));
        }
      }
    } catch (err) {
      console.error('Error fetching trips data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenModal = () => {
    setFormError('');
    setForm({
      vehicleId: vehicles[0]?.vehicleId || '',
      routeId: routes[0]?.routeId || '',
      plannedDeparture: getLocalDateTimeString()
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicleId || !form.routeId) {
      setFormError('Please select both a fleet vehicle and a route corridor.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        vehicleId: form.vehicleId,
        routeId: form.routeId,
        plannedDeparture: new Date(form.plannedDeparture)
      };

      const res = await api.post('/trips', payload);
      const createdTrip = res.data?.trip || res.data;
      setSuccessMsg(`Trip ${createdTrip.tripId || ''} scheduled successfully.`);
      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      console.error('Create trip error:', err);
      setFormError(err.response?.data?.message || 'Failed to schedule trip.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispatch = async (tripId) => {
    setDispatchingId(tripId);
    try {
      await api.post(`/trips/${tripId}/dispatch`, {});
      setSuccessMsg(`Trip ${tripId} successfully dispatched! Status updated to DISPATCHED.`);
      fetchData();
    } catch (err) {
      console.error('Dispatch trip error:', err);
      setSuccessMsg('');
    } finally {
      setDispatchingId(null);
    }
  };

  const handleCancelTrip = async (tripId) => {
    if (!window.confirm(`Are you sure you want to cancel trip ${tripId}? All allocated cargo will be released back to the pool.`)) {
      return;
    }
    setCancellingId(tripId);
    try {
      const res = await api.post(`/trips/${tripId}/cancel`, {});
      setSuccessMsg(res.data?.message || `Trip ${tripId} cancelled successfully.`);
      fetchData();
    } catch (err) {
      console.error('Cancel trip error:', err);
      setSuccessMsg('');
    } finally {
      setCancellingId(null);
    }
  };

  const handleQuickSeed = async () => {
    setSubmitting(true);
    try {
      let vehicle = vehicles[0];
      if (!vehicle) {
        const randId = Math.floor(100 + Math.random() * 900);
        const newVehRes = await api.post('/vehicles', {
          vehicleId: `TN-09-AX-${randId}`,
          type: 'Heavy Truck',
          dimensions: { length: 13.6, width: 2.45, height: 2.8 },
          capacityVolume: 93.3,
          capacityWeight: 20000,
          routeLane: 'CHN-BLR-EXP',
          baseLocation: 'Chennai Logistics Hub',
          ratePerCbm: 150,
          ratePerKg: 5,
          status: 'Active'
        });
        vehicle = newVehRes.data;
      }

      let routeId = vehicle.routeLane || routes[0]?.routeId || 'CHN-BLR-EXP';
      try {
        await api.get(`/routes/${routeId}`);
      } catch {
        await api.post('/routes', {
          routeId: 'CHN-BLR-EXP',
          source: 'Chennai',
          destination: 'Bangalore',
          stops: ['Kanchipuram', 'Vellore', 'Hosur'],
          distance: 350,
          baseRate: 150
        });
        routeId = 'CHN-BLR-EXP';
      }

      const res = await api.post('/trips', {
        vehicleId: vehicle.vehicleId,
        routeId: routeId,
        plannedDeparture: new Date()
      });

      const trip = res.data?.trip || res.data;
      if (trip?.tripId) {
        try {
          await api.post(`/trips/${trip.tripId}/dispatch`, {});
        } catch {}
      }

      setSuccessMsg(`Created sample trip ${trip?.tripId || ''} on ${routeId}.`);
      fetchData();
    } catch (err) {
      console.error('Seed trip error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <RouteIcon className="w-6 h-6 text-emerald-600" />
            Trips &amp; Dispatch Lifecycle Management
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage lifecycle transitions from PLANNED → READY_FOR_DISPATCH → IN_TRANSIT → COMPLETED.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition shadow-xs cursor-pointer"
            title="Refresh Trips"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule New Trip</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && trips.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <RouteIcon className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Scheduled Trips Found</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Trips tie your fleet trucks to corridor routes for operational execution. Schedule a new trip to prepare cargo loading and monitor multi-stop highway transit.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleOpenModal}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule First Trip</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleQuickSeed}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Add &amp; Dispatch Sample Trip</span>
            </button>
          </div>
        </div>
      )}

      {/* Trips List */}
      {!loading && trips.length > 0 && (
        <div className="space-y-3">
          {trips.map((t) => {
            const isPlanned = ['PLANNED', 'READY_FOR_DISPATCH'].includes(t.status?.toUpperCase());
            const isLive = ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP'].includes(t.status?.toUpperCase());

            return (
              <div
                key={t.tripId || t._id}
                className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-emerald-300 transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-black text-gray-900">
                      {t.tripId}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        t.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : isLive
                          ? 'bg-blue-100 text-blue-800 animate-pulse'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-700 flex items-center gap-2">
                    <Truck className="w-3.5 h-3.5 text-gray-400" />
                    <span>Truck: <strong>{t.vehicleId}</strong></span>
                    <span className="text-gray-300">•</span>
                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                    <span>Route: <strong>{t.routeId}</strong></span>
                  </p>

                  <p className="text-[11px] text-gray-500">
                    Departure: {new Date(t.plannedDeparture || t.createdAt).toLocaleString()} • Current Stop: #{t.currentStopIndex + 1 || 1}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isPlanned && (
                    <>
                      <button
                        type="button"
                        disabled={dispatchingId === t.tripId}
                        onClick={() => handleDispatch(t.tripId)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{dispatchingId === t.tripId ? 'Dispatching...' : 'Dispatch'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={cancellingId === t.tripId}
                        onClick={() => handleCancelTrip(t.tripId)}
                        className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{cancellingId === t.tripId ? 'Cancelling...' : 'Cancel Trip'}</span>
                      </button>
                    </>
                  )}

                  <Link
                    to="/manager/live-trip"
                    className="no-underline px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition border border-emerald-200 flex items-center gap-1.5"
                  >
                    <span>View Live Ops</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Schedule Trip Modal ─────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full p-6 md:p-8 space-y-6 relative my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                  Schedule New Trip
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Select fleet vehicle, route corridor, and planned departure time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Assigned Fleet Truck *
                </label>
                <select
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                >
                  {vehicles.map((v) => (
                    <option key={v.vehicleId} value={v.vehicleId}>
                      {v.vehicleId} ({v.type || 'Truck'} • {v.capacityVolume || 93} m³ / {v.capacityWeight || 20000} kg)
                    </option>
                  ))}
                  {vehicles.length === 0 && <option value="">No trucks registered - register truck first</option>}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Operating Route Corridor *
                </label>
                <select
                  value={form.routeId}
                  onChange={(e) => setForm({ ...form, routeId: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                >
                  {routes.length === 0 ? (
                    <option value="">No routes found — Please create a route in Route Lanes first</option>
                  ) : (
                    routes.map((r) => (
                      <option key={r.routeId} value={r.routeId}>
                        {r.routeId} ({r.source} → {r.destination})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Planned Departure Time *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={form.plannedDeparture}
                  onChange={(e) => setForm({ ...form, plannedDeparture: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-medium"
                />
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Scheduling Trip...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Schedule Trip</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerTripsView;
