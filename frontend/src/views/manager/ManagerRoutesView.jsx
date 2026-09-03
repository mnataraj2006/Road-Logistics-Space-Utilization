import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Route as RouteIcon,
  ArrowRight,
  RefreshCw,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Milestone,
  Edit2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import api from '../../services/api';

const ManagerRoutesView = () => {
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [deletingRoute, setDeletingRoute] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    routeId: '',
    source: '',
    destination: '',
    intermediateStops: '',
    distance: '350',
    baseRate: '150'
  });

  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const res = await api.get('/routes');
      setRoutes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  const openCreateModal = () => {
    setEditingRoute(null);
    setFormError('');
    setForm({
      routeId: '',
      source: '',
      destination: '',
      intermediateStops: '',
      distance: '350',
      baseRate: '150'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (r) => {
    setEditingRoute(r);
    setFormError('');
    const intermediateList = (r.stops || []).filter(
      (s) =>
        s.toLowerCase() !== r.source.toLowerCase() &&
        s.toLowerCase() !== r.destination.toLowerCase()
    );
    setForm({
      routeId: r.routeId,
      source: r.source,
      destination: r.destination,
      intermediateStops: intermediateList.join(', '),
      distance: String(r.distance || 350),
      baseRate: String(r.baseRate || 150)
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.source.trim() || !form.destination.trim() || (!editingRoute && !form.routeId.trim())) {
      setFormError('Route Identifier, Source (Origin), and Destination (Final Stop) are required.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const intermediateList = form.intermediateStops
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        routeId: form.routeId.trim().toUpperCase(),
        source: form.source.trim(),
        destination: form.destination.trim(),
        stops: intermediateList,
        distance: Number(form.distance) || 350,
        baseRate: Number(form.baseRate) || 150
      };

      if (editingRoute) {
        await api.put(`/routes/${editingRoute.routeId}`, payload);
        setSuccessMsg(`Route corridor ${editingRoute.routeId} updated successfully.`);
      } else {
        await api.post('/routes', payload);
        setSuccessMsg(`Route corridor ${payload.routeId} created successfully.`);
      }

      setIsModalOpen(false);
      setEditingRoute(null);
      fetchRoutes();
    } catch (err) {
      console.error('Save route error:', err);
      setFormError(err.response?.data?.message || 'Failed to save route corridor. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRoute) return;
    setSubmitting(true);
    try {
      await api.delete(`/routes/${deletingRoute.routeId}`);
      setSuccessMsg(`Route corridor ${deletingRoute.routeId} removed successfully.`);
      setDeletingRoute(null);
      fetchRoutes();
    } catch (err) {
      console.error('Delete route error:', err);
      setFormError(err.response?.data?.message || 'Failed to delete route.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSeedCorridor = async (routeId, source, destination, intermediateStops, distance, baseRate) => {
    setSubmitting(true);
    try {
      const payload = {
        routeId,
        source,
        destination,
        stops: intermediateStops,
        distance,
        baseRate
      };
      await api.post('/routes', payload);
      setSuccessMsg(`Added corridor ${routeId} (${source} → ${destination}).`);
      fetchRoutes();
    } catch (err) {
      console.error('Seed route error:', err);
      setFormError(err.response?.data?.message || 'Failed to add corridor.');
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
            <MapPin className="w-6 h-6 text-emerald-600" />
            Multi-Stop Route Networks &amp; Stop Sequences
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configured transit corridors, ordered stops, base distance metrics, and stop QR tokens.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchRoutes}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition shadow-xs cursor-pointer"
            title="Refresh Routes"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Route Corridor</span>
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
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
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4" />
              <div className="h-10 bg-gray-100 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && routes.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <RouteIcon className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Route Corridors Configured Yet</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Define the multi-stop highway corridors that your fleet operates on. Each route automatically generates sequential stop QR codes for transit verification.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Route Corridor</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() =>
                handleQuickSeedCorridor(
                  'CHN-BLR-EXP',
                  'Chennai',
                  'Bangalore',
                  ['Kanchipuram', 'Vellore', 'Hosur'],
                  350,
                  150
                )
              }
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Chennai → Bangalore Express</span>
            </button>
          </div>
        </div>
      )}

      {/* Routes List */}
      {!loading && routes.length > 0 && (
        <div className="space-y-4">
          {routes.map((r) => {
            const stops =
              r.stopsDetails ||
              (r.stops || [r.source, r.destination]).map((st, i) => ({
                locationName: typeof st === 'string' ? st : st.locationName,
                sequenceNumber: i,
                distanceFromSource: i * 70,
                qrToken: `QR-${i}`
              }));

            return (
              <div
                key={r.routeId || r._id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4 hover:border-emerald-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-base font-black text-gray-900 bg-slate-100 px-3 py-1 rounded-lg">
                      {r.routeId}
                    </span>
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full">
                      {r.source} → {r.destination}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-3 text-xs font-bold text-gray-500">
                      <span>{r.distance || 350} km corridor</span>
                      <span>•</span>
                      <span>Base rate: ₹{r.baseRate || 150}/m³</span>
                    </div>

                    <div className="flex items-center gap-1 pl-2 border-l border-gray-200">
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                        title="Edit Route"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingRoute(r)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="Delete Route"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                    Sequential Multi-Stop Route Order ({stops.length} Stops)
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {stops.map((st, idx) => {
                      const name = st.locationName || st;
                      const isOrigin = idx === 0;
                      const isDest = idx === stops.length - 1;

                      return (
                        <React.Fragment key={idx}>
                          {idx > 0 && <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />}
                          <div
                            className={`px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 space-y-0.5 ${
                              isOrigin
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : isDest
                                ? 'bg-blue-50 border-blue-300 text-blue-900'
                                : 'bg-gray-50 border-gray-200 text-gray-800'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-black/10 flex items-center justify-center text-[10px]">
                                {idx + 1}
                              </span>
                              <span>{name}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-normal pl-5">
                              {st.distanceFromSource !== undefined
                                ? `${st.distanceFromSource} km`
                                : isOrigin
                                ? 'Origin'
                                : isDest
                                ? 'Final Destination'
                                : 'Intermediate'}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit Route Modal ───────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full my-auto max-h-[90vh] flex flex-col overflow-hidden">
            {/* Fixed Header */}
            <div className="p-5 md:p-6 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Milestone className="w-5 h-5 text-emerald-600" />
                  {editingRoute ? `Edit Route Corridor (${editingRoute.routeId})` : 'Add New Route Corridor'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure origin, intermediate waypoint stops, distance, and base pricing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="overflow-y-auto p-5 md:p-6 flex-1 space-y-4 text-xs">
              {formError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{formError}</span>
                </div>
              )}

              <form id="route-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Route Identifier * (e.g. CHN-BLR-EXP or MUM-PUN-01)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CHN-BLR-EXP"
                    value={form.routeId}
                    onChange={(e) => setForm({ ...form, routeId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-mono uppercase font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Origin City (Source) *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Chennai"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Final Destination *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bangalore"
                      value={form.destination}
                      onChange={(e) => setForm({ ...form, destination: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Intermediate Stops (Comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kanchipuram, Vellore, Hosur"
                    value={form.intermediateStops}
                    onChange={(e) => setForm({ ...form, intermediateStops: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none"
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Stops will be sequenced sequentially from Origin to Destination.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Total Distance (km) *</label>
                    <input
                      type="number"
                      min="10"
                      required
                      value={form.distance}
                      onChange={(e) => setForm({ ...form, distance: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Base Tariff (₹/m³) *</label>
                    <input
                      type="number"
                      min="10"
                      required
                      value={form.baseRate}
                      onChange={(e) => setForm({ ...form, baseRate: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono font-bold"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Fixed Footer */}
            <div className="p-4 md:p-5 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0 bg-gray-50">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold cursor-pointer transition text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="route-form"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition disabled:opacity-50 text-xs"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Route...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingRoute ? 'Save Route Changes' : 'Create Route Corridor'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      {deletingRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Route Corridor</h3>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to remove route corridor{' '}
              <strong className="text-gray-900 font-mono">{deletingRoute.routeId}</strong> (
              {deletingRoute.source} → {deletingRoute.destination})?
            </p>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => setDeletingRoute(null)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleDelete}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black shadow-md shadow-red-600/20 cursor-pointer transition disabled:opacity-50"
              >
                {submitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerRoutesView;
