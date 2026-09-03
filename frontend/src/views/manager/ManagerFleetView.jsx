import React, { useState, useEffect } from 'react';
import {
  Truck,
  Plus,
  ShieldCheck,
  MapPin,
  Layers,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  RefreshCw,
  Box,
  Scale,
  Maximize2,
  Route as RouteIcon,
  DollarSign,
  Edit2,
  Trash2
} from 'lucide-react';
import api from '../../services/api';

const VEHICLE_TYPES = [
  'Heavy Truck',
  'Medium Truck',
  'Container Truck',
  '20 ft Truck',
  '32 ft Truck',
  '14 ft Truck',
  '17 ft Truck',
  'Light Van',
  'Mini Truck'
];

const DEFAULT_DIMENSIONS = {
  'Heavy Truck': { length: 13.6, width: 2.45, height: 2.8, weight: 20000 },
  'Medium Truck': { length: 7.5, width: 2.3, height: 2.4, weight: 10000 },
  'Container Truck': { length: 12.0, width: 2.4, height: 2.6, weight: 18000 },
  '20 ft Truck': { length: 6.05, width: 2.44, height: 2.59, weight: 12000 },
  '32 ft Truck': { length: 9.75, width: 2.44, height: 2.74, weight: 15000 },
  '14 ft Truck': { length: 4.3, width: 1.9, height: 2.1, weight: 4500 },
  '17 ft Truck': { length: 5.2, width: 2.0, height: 2.2, weight: 6000 },
  'Light Van': { length: 3.2, width: 1.7, height: 1.8, weight: 2000 },
  'Mini Truck': { length: 2.5, width: 1.5, height: 1.6, weight: 1200 }
};

const ManagerFleetView = () => {
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [dimWarning, setDimWarning] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    vehicleId: '',
    type: 'Heavy Truck',
    length: '13.6',
    width: '2.45',
    height: '2.8',
    capacityWeight: '20000',
    routeLane: '',
    baseLocation: 'Chennai Logistics Hub',
    ratePerCbm: '150',
    ratePerKg: '5',
    status: 'Active'
  });

  const fetchFleetData = async () => {
    setLoading(true);
    try {
      const [resVehicles, resRoutes] = await Promise.allSettled([
        api.get('/vehicles'),
        api.get('/routes')
      ]);

      if (resVehicles.status === 'fulfilled' && Array.isArray(resVehicles.value.data)) {
        setVehicles(resVehicles.value.data);
      }
      if (resRoutes.status === 'fulfilled' && Array.isArray(resRoutes.value.data)) {
        setRoutes(resRoutes.value.data);
        if (!form.routeLane && resRoutes.value.data.length > 0) {
          setForm(prev => ({ ...prev, routeLane: resRoutes.value.data[0].routeId }));
        }
      }
    } catch (err) {
      console.error('Error fetching fleet:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  const handleTypeChange = (newType) => {
    const preset = DEFAULT_DIMENSIONS[newType] || DEFAULT_DIMENSIONS['Heavy Truck'];
    setForm(prev => ({
      ...prev,
      type: newType,
      length: String(preset.length),
      width: String(preset.width),
      height: String(preset.height),
      capacityWeight: String(preset.weight)
    }));
    checkDimensionWarnings(preset.length, preset.width, preset.height);
  };

  const checkDimensionWarnings = (l, w, h) => {
    const numL = parseFloat(l) || 0;
    const numW = parseFloat(w) || 0;
    const numH = parseFloat(h) || 0;

    if (numL > 25 || numW > 4.5 || numH > 4.8) {
      setDimWarning('Truck dimensions appear unrealistic for standard road freight (> 25m). Please verify if values were entered in cm/mm instead of meters (e.g. 13.6m instead of 13600mm).');
    } else {
      setDimWarning('');
    }
  };

  const handleDimChange = (field, val) => {
    const nextForm = { ...form, [field]: val };
    setForm(nextForm);
    checkDimensionWarnings(
      field === 'length' ? val : form.length,
      field === 'width' ? val : form.width,
      field === 'height' ? val : form.height
    );
  };

  const calculatedVolume = (
    (parseFloat(form.length) || 0) *
    (parseFloat(form.width) || 0) *
    (parseFloat(form.height) || 0)
  ).toFixed(2);

  const openRegisterModal = () => {
    setEditingVehicle(null);
    setFormError('');
    setDimWarning('');
    setForm({
      vehicleId: '',
      type: 'Heavy Truck',
      length: '13.6',
      width: '2.45',
      height: '2.8',
      capacityWeight: '20000',
      routeLane: routes[0]?.routeId || '',
      baseLocation: 'Chennai Logistics Hub',
      ratePerCbm: '150',
      ratePerKg: '5',
      status: 'Active'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (v) => {
    setEditingVehicle(v);
    setFormError('');
    setDimWarning('');
    const dims = v.dimensions || {};
    const l = dims.length || 13.6;
    const w = dims.width || 2.45;
    const h = dims.height || 2.8;

    setForm({
      vehicleId: v.vehicleId,
      type: v.type || 'Heavy Truck',
      length: String(l),
      width: String(w),
      height: String(h),
      capacityWeight: String(v.capacityWeight || 20000),
      routeLane: v.routeLane || routes[0]?.routeId || '',
      baseLocation: v.baseLocation || 'Chennai Logistics Hub',
      ratePerCbm: String(v.ratePerCbm || 150),
      ratePerKg: String(v.ratePerKg || 5),
      status: v.status || 'Active'
    });
    checkDimensionWarnings(l, w, h);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vehicleId.trim()) {
      setFormError('Vehicle Identifier (e.g. TRK-101 or License Plate) is required.');
      return;
    }

    const numL = parseFloat(form.length) || 0;
    const numW = parseFloat(form.width) || 0;
    const numH = parseFloat(form.height) || 0;
    const numWt = parseFloat(form.capacityWeight) || 0;

    if (numL <= 0 || numW <= 0 || numH <= 0) {
      setFormError('Length, width, and height must all be greater than 0.');
      return;
    }
    if (numWt <= 0) {
      setFormError('Payload capacity weight must be greater than 0.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        vehicleId: form.vehicleId.trim().toUpperCase(),
        type: form.type,
        dimensions: {
          length: numL,
          width: numW,
          height: numH
        },
        capacityVolume: parseFloat(calculatedVolume),
        capacityWeight: numWt,
        routeLane: form.routeLane || (routes[0]?.routeId || 'CHN-BLR-EXP'),
        baseLocation: form.baseLocation || 'Chennai Logistics Hub',
        ratePerCbm: Number(form.ratePerCbm) || 150,
        ratePerKg: Number(form.ratePerKg) || 5,
        status: form.status || 'Active'
      };

      if (editingVehicle) {
        await api.put(`/vehicles/${editingVehicle.vehicleId}`, payload);
        setSuccessMsg(`Vehicle ${payload.vehicleId} updated successfully.`);
      } else {
        await api.post('/vehicles', payload);
        setSuccessMsg(`Vehicle ${payload.vehicleId} registered successfully.`);
      }

      setIsModalOpen(false);
      fetchFleetData();
    } catch (err) {
      console.error('Save vehicle error:', err);
      setFormError(err.response?.data?.message || 'Failed to save vehicle asset. Please verify the inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!window.confirm(`Are you sure you want to permanently delete/retire truck ${vehicleId} from Fleet Assets?`)) {
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const res = await api.delete(`/vehicles/${vehicleId}`);
      setSuccessMsg(res.data?.message || `Vehicle ${vehicleId} deleted successfully.`);
      setIsModalOpen(false);
      fetchFleetData();
    } catch (err) {
      console.error('Delete vehicle error:', err);
      setFormError(err.response?.data?.message || 'Failed to delete vehicle asset.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSeed = async () => {
    setSubmitting(true);
    try {
      const defaultRoute = routes[0]?.routeId || 'CHN-BLR-EXP';
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      const payload = {
        vehicleId: `TN-09-AX-${randomSuffix}`,
        type: 'Heavy Truck',
        dimensions: { length: 13.6, width: 2.45, height: 2.8 },
        capacityVolume: 93.3,
        capacityWeight: 20000,
        routeLane: defaultRoute,
        baseLocation: 'Chennai Logistics Hub',
        ratePerCbm: 150,
        ratePerKg: 5,
        status: 'Active'
      };
      await api.post('/vehicles', payload);
      setSuccessMsg(`Quick-created truck asset ${payload.vehicleId}.`);
      fetchFleetData();
    } catch (err) {
      console.error('Quick seed error:', err);
      setFormError(err.response?.data?.message || 'Failed to add sample truck.');
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
            <Truck className="w-6 h-6 text-emerald-600" />
            Fleet Asset Specifications &amp; Status
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Authoritative source of truth for 3D interior cargo dimensions, payload capacities, and route assignments.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchFleetData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition shadow-xs cursor-pointer"
            title="Refresh Fleet"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openRegisterModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Register Fleet Truck</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-100 rounded w-2/3" />
              <div className="h-16 bg-gray-50 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State when 0 vehicles */}
      {!loading && vehicles.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <Truck className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Fleet Assets Registered Yet</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Register your company's trucks, trailers, or container assets to start scheduling trips and running 3D space optimization.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={openRegisterModal}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>Register First Truck Asset</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleQuickSeed}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Sample Container Truck</span>
            </button>
          </div>
        </div>
      )}

      {/* Vehicle Cards Grid */}
      {!loading && vehicles.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const dims = v.dimensions || {};
            const len = Number(dims.length || v.interiorLength || 13.6);
            const wid = Number(dims.width || v.interiorWidth || 2.45);
            const hgt = Number(dims.height || v.interiorHeight || 2.8);
            const vol = Number(v.capacityVolume || (len * wid * hgt).toFixed(1));
            const wt = Number(v.capacityWeight || 20000);

            const isOversized = len > 25 || wid > 4.5 || hgt > 4.8;

            const normStatus = (v.status || v.transitStatus || 'AVAILABLE').toUpperCase();
            let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            let statusLabel = 'AVAILABLE';
            let statusDesc = 'Ready for Load Planning';

            if (normStatus === 'IN_TRANSIT' || normStatus === 'DISPATCHED' || normStatus === 'AT_STOP') {
              badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
              statusLabel = 'IN_TRANSIT';
              statusDesc = 'Currently on Trip';
            } else if (normStatus === 'ASSIGNED') {
              badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
              statusLabel = 'ASSIGNED';
              statusDesc = 'Assigned to Trip';
            } else if (normStatus === 'IN MAINTENANCE' || normStatus === 'MAINTENANCE') {
              badgeClass = 'bg-red-100 text-red-800 border-red-300';
              statusLabel = 'MAINTENANCE';
              statusDesc = 'Unavailable';
            } else if (normStatus === 'OUT OF SERVICE' || normStatus === 'INACTIVE') {
              badgeClass = 'bg-gray-100 text-gray-800 border-gray-300';
              statusLabel = 'INACTIVE';
              statusDesc = 'Retired / Disabled';
            }

            return (
              <div
                key={v.vehicleId || v._id}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-mono text-sm font-black text-gray-900 block">
                          {v.vehicleId}
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {v.type || 'Heavy Truck'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <div className="flex flex-col items-end">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${badgeClass}`}>
                          {statusLabel}
                        </span>
                        <span className="text-[9px] text-gray-400 font-semibold mt-0.5">
                          {statusDesc}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditModal(v)}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition cursor-pointer ml-1"
                        title="Edit Truck Dimensions &amp; Specs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteVehicle(v.vehicleId)}
                        disabled={normStatus === 'IN_TRANSIT'}
                        className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 hover:text-red-800 transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={normStatus === 'IN_TRANSIT' ? 'Cannot delete truck while IN_TRANSIT' : 'Delete / Retire Truck Asset'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isOversized && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-start gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block">Unrealistic Dimensions Flagged</strong>
                        <span>Dimensions ({len}m × {wid}m × {hgt}m) exceed standard road container limits. Click Edit to adjust.</span>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between text-gray-600">
                      <span className="flex items-center gap-1 text-[11px] text-gray-500">
                        <RouteIcon className="w-3.5 h-3.5 text-gray-400" /> Assigned Corridor:
                      </span>
                      <span className="font-bold text-gray-900">{v.routeLane || 'Chennai → Bangalore'}</span>
                    </div>

                    {v.baseLocation && (
                      <div className="flex items-center justify-between text-gray-600">
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" /> Base Hub:
                        </span>
                        <span className="font-semibold text-gray-700">{v.baseLocation}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-xs">
                    <div className="p-2.5 bg-gray-50/70 rounded-lg">
                      <span className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                        <Box className="w-3 h-3 text-emerald-600" /> Volume Capacity
                      </span>
                      <span className="text-base font-black text-gray-900 mt-0.5 block">
                        {vol.toLocaleString()} <span className="text-xs font-semibold text-gray-500">m³</span>
                      </span>
                    </div>

                    <div className="p-2.5 bg-gray-50/70 rounded-lg">
                      <span className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                        <Scale className="w-3 h-3 text-blue-600" /> Payload Capacity
                      </span>
                      <span className="text-base font-black text-gray-900 mt-0.5 block">
                        {wt.toLocaleString()} <span className="text-xs font-semibold text-gray-500">kg</span>
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 flex items-center justify-between text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <Maximize2 className="w-3 h-3 text-gray-400" /> Authoritative Dimensions:
                      </span>
                      <span className="font-mono font-bold text-gray-800">
                        {len}m (L) × {wid}m (W) × {hgt}m (H)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Rate: ₹{v.ratePerCbm || 150}/m³ • ₹{v.ratePerKg || 5}/kg</span>
                  <button
                    onClick={() => openEditModal(v)}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition cursor-pointer border-none"
                  >
                    Edit Asset Specs
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Register / Edit Vehicle Modal ────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-xl w-full p-6 md:p-8 space-y-5 relative my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-600" />
                  {editingVehicle ? `Edit Fleet Asset (${editingVehicle.vehicleId})` : 'Register New Fleet Asset'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Authoritative 3D interior cargo dimensions, payload weight, and corridor lane.
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

            {formError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            {dimWarning && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>{dimWarning}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Vehicle Identifier / Plate *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingVehicle)}
                    placeholder="e.g. TN-09-AX-8821 / TRK-101"
                    value={form.vehicleId}
                    onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-mono uppercase disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Vehicle Classification *</label>
                  <select
                    value={form.type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Operating Route Corridor *</label>
                  <select
                    value={form.routeLane}
                    onChange={(e) => setForm({ ...form, routeLane: e.target.value })}
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
                  <label className="block font-bold text-gray-700 mb-1">Base Logistics Hub</label>
                  <input
                    type="text"
                    placeholder="e.g. Chennai Port Terminal"
                    value={form.baseLocation}
                    onChange={(e) => setForm({ ...form, baseLocation: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* 3D Cargo Space Specifications */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wide flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                    3D Interior Cargo Space Dimensions
                  </span>
                  <span className="font-mono font-black text-emerald-700 text-xs">
                    Computed Volume: {calculatedVolume} m³
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Length (m) *</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      required
                      value={form.length}
                      onChange={(e) => handleDimChange('length', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Width (m) *</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      required
                      value={form.width}
                      onChange={(e) => handleDimChange('width', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Height (m) *</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.5"
                      required
                      value={form.height}
                      onChange={(e) => handleDimChange('height', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Payload Cap (kg) *</label>
                    <input
                      type="number"
                      min="100"
                      required
                      value={form.capacityWeight}
                      onChange={(e) => setForm({ ...form, capacityWeight: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Rate / m³ (₹)</label>
                    <input
                      type="number"
                      min="1"
                      value={form.ratePerCbm}
                      onChange={(e) => setForm({ ...form, ratePerCbm: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Rate / kg (₹)</label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={form.ratePerKg}
                      onChange={(e) => setForm({ ...form, ratePerKg: e.target.value })}
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 bg-white font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
                {editingVehicle ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteVehicle(editingVehicle.vehicleId)}
                    disabled={submitting || form.status === 'IN_TRANSIT'}
                    className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>Delete Fleet Asset</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
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
                        <span>Saving Asset...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{editingVehicle ? 'Update Truck Asset' : 'Save & Activate Truck'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerFleetView;

