import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Search,
  MapPin,
  Layers,
  Filter,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  X,
  Truck,
  Scale,
  DollarSign,
  FileText,
  ShieldAlert,
  Layers3,
  RotateCw,
  Clock,
  Edit2,
  Trash2,
  AlertTriangle,
  Lock
} from 'lucide-react';
import api from '../../services/api';

const getRouteStopsList = (route) => {
  if (!route) return [];
  if (route.stopsDetails && route.stopsDetails.length > 0) {
    return route.stopsDetails.map(s => s.locationName || s.name);
  }
  if (route.stops && route.stops.length > 0) {
    const stops = [...route.stops];
    if (route.source && !stops.some(s => s.toLowerCase() === route.source.toLowerCase())) {
      stops.unshift(route.source);
    }
    if (route.destination && !stops.some(s => s.toLowerCase() === route.destination.toLowerCase())) {
      stops.push(route.destination);
    }
    return stops;
  }
  return [route.source, route.destination].filter(Boolean);
};

const ManagerShipmentsView = () => {
  const [shipments, setShipments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [deletingShipment, setDeletingShipment] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    cargoDescription: '',
    shipperName: '',
    cargoCategory: 'GENERAL',
    packageCount: '1',
    length: '1.2',
    width: '1.0',
    height: '1.5',
    volume: '1.8',
    weight: '650',
    fragile: false,
    stackable: true,
    allowRotation: true,
    maxStackWeight: '800',
    priority: 'STANDARD',
    routeId: '',
    fromStop: '',
    toStop: '',
    vehicleId: 'UNASSIGNED',
    invoiceNumber: '',
    invoiceValue: '50000'
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resBookings, resVehicles, resRoutes] = await Promise.allSettled([
        api.get('/bookings'),
        api.get('/vehicles'),
        api.get('/routes')
      ]);

      if (resBookings.status === 'fulfilled' && Array.isArray(resBookings.value.data)) {
        setShipments(resBookings.value.data);
      }
      if (resVehicles.status === 'fulfilled' && Array.isArray(resVehicles.value.data)) {
        setVehicles(resVehicles.value.data);
      }
      if (resRoutes.status === 'fulfilled' && Array.isArray(resRoutes.value.data)) {
        const rList = resRoutes.value.data;
        setRoutes(rList);
        if (rList.length > 0 && (!form.fromStop || !form.toStop)) {
          const stops = getRouteStopsList(rList[0]);
          setForm((prev) => ({
            ...prev,
            routeId: rList[0].routeId,
            fromStop: stops[0] || rList[0].source,
            toStop: stops[stops.length - 1] || rList[0].destination
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching shipments data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setEditingShipment(null);
    setFormError('');
    const firstRoute = routes[0];
    const initialStops = getRouteStopsList(firstRoute);
    setForm({
      cargoDescription: '',
      shipperName: '',
      cargoCategory: 'GENERAL',
      packageCount: '1',
      length: '1.2',
      width: '1.0',
      height: '1.5',
      volume: '1.8',
      weight: '650',
      fragile: false,
      stackable: true,
      allowRotation: true,
      maxStackWeight: '800',
      priority: 'STANDARD',
      routeId: firstRoute?.routeId || '',
      fromStop: initialStops[0] || firstRoute?.source || '',
      toStop: initialStops[initialStops.length - 1] || firstRoute?.destination || '',
      vehicleId: 'UNASSIGNED',
      invoiceNumber: '',
      invoiceValue: '50000'
    });
    setIsModalOpen(true);
  };

  const openEditModal = (s) => {
    setEditingShipment(s);
    setFormError('');
    const matchedRoute = routes.find((r) => r.routeId === s.routeId) || routes[0];
    const stops = getRouteStopsList(matchedRoute);
    setForm({
      cargoDescription: s.cargoDescription || '',
      shipperName: s.shipperId || '',
      cargoCategory: s.cargoCategory || 'GENERAL',
      packageCount: String(s.packageCount || 1),
      length: String(s.length || 1.2),
      width: String(s.width || 1.0),
      height: String(s.height || 1.5),
      volume: String(s.volume || 1.8),
      weight: String(s.weight || 500),
      fragile: Boolean(s.fragile),
      stackable: s.stackable !== false,
      allowRotation: s.allowRotation !== false,
      maxStackWeight: String(s.maxStackWeight || 800),
      priority: s.priority || 'STANDARD',
      routeId: s.routeId || matchedRoute?.routeId || '',
      fromStop: s.fromStop || s.requestedSegment?.fromStop || stops[0] || '',
      toStop: s.toStop || s.requestedSegment?.toStop || stops[stops.length - 1] || '',
      vehicleId: s.vehicleId || 'UNASSIGNED',
      invoiceNumber: s.invoiceNumber || '',
      invoiceValue: String(s.invoiceValue || 50000)
    });
    setIsModalOpen(true);
  };

  const [dimWarning, setDimWarning] = useState('');

  const checkCargoDimensionWarning = (l, w, h, count) => {
    const numL = parseFloat(l) || 0;
    const numW = parseFloat(w) || 0;
    const numH = parseFloat(h) || 0;
    const numCount = parseInt(count) || 1;
    const singleVol = numL * numW * numH;

    if (numL > 15 || numW > 3.5 || numH > 3.5 || singleVol > 120) {
      setDimWarning('Package dimensions appear unrealistically large (> 15m). Measurements should be entered in meters (e.g. 1.2m length × 1.0m width × 1.4m height). Please verify if values were entered in cm or mm.');
    } else {
      setDimWarning('');
    }
  };

  const handleDimensionChange = (key, val) => {
    const nextForm = { ...form, [key]: val };
    const l = parseFloat(key === 'length' ? val : form.length) || 0;
    const w = parseFloat(key === 'width' ? val : form.width) || 0;
    const h = parseFloat(key === 'height' ? val : form.height) || 0;
    const count = parseInt(key === 'packageCount' ? val : form.packageCount) || 1;

    if (l > 0 && w > 0 && h > 0) {
      const computedVol = (l * w * h * count).toFixed(2);
      nextForm.volume = String(computedVol);
    }
    setForm(nextForm);
    checkCargoDimensionWarning(
      key === 'length' ? val : form.length,
      key === 'width' ? val : form.width,
      key === 'height' ? val : form.height,
      key === 'packageCount' ? val : form.packageCount
    );
  };

  const handleRouteChange = (rId) => {
    const selectedRoute = routes.find((r) => r.routeId === rId);
    if (selectedRoute) {
      const stops = getRouteStopsList(selectedRoute);
      setForm((prev) => ({
        ...prev,
        routeId: rId,
        fromStop: stops[0] || selectedRoute.source,
        toStop: stops[stops.length - 1] || selectedRoute.destination
      }));
    } else {
      setForm((prev) => ({ ...prev, routeId: rId, fromStop: '', toStop: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cargoDescription.trim() || !form.volume || !form.weight) {
      setFormError('Cargo Description, Volume, and Weight are required.');
      return;
    }

    if (!form.fromStop || !form.toStop) {
      setFormError('Please select both Pickup Stop and Delivery Stop.');
      return;
    }

    if (form.fromStop.toLowerCase() === form.toStop.toLowerCase()) {
      setFormError('Pickup Stop (Origin) and Delivery Stop (Dest) cannot be the same city.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const payload = {
        cargoDescription: form.cargoDescription.trim(),
        shipperId: form.shipperName.trim() || 'Corporate Shipper',
        cargoCategory: form.cargoCategory,
        packageCount: Number(form.packageCount) || 1,
        length: Number(form.length) || 0,
        width: Number(form.width) || 0,
        height: Number(form.height) || 0,
        volume: Number(form.volume) || 1.8,
        weight: Number(form.weight) || 500,
        fragile: form.fragile,
        stackable: form.stackable,
        allowRotation: form.allowRotation,
        maxStackWeight: Number(form.maxStackWeight) || 0,
        priority: form.priority,
        routeId: form.routeId || 'CHN-BLR-EXP',
        fromStop: form.fromStop || 'Chennai',
        toStop: form.toStop || 'Bangalore',
        vehicleId: form.vehicleId || 'UNASSIGNED',
        date: new Date(),
        invoiceNumber: form.invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
        invoiceValue: Number(form.invoiceValue) || 50000,
        status: form.vehicleId && form.vehicleId !== 'UNASSIGNED' ? 'ALLOCATED' : 'PENDING'
      };

      if (editingShipment) {
        const id = editingShipment.bookingId || editingShipment._id;
        await api.put(`/bookings/${id}`, payload);
        setSuccessMsg(`Consignment ${id} updated successfully.`);
      } else {
        const res = await api.post('/bookings', payload);
        setSuccessMsg(`Consignment ${res.data?.bookingId || 'BKG-NEW'} recorded in ledger.`);
      }

      setIsModalOpen(false);
      setEditingShipment(null);
      fetchData();
    } catch (err) {
      console.error('Save booking error:', err);
      setFormError(err.response?.data?.message || 'Failed to save consignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingShipment) return;
    setSubmitting(true);
    try {
      const id = deletingShipment.bookingId || deletingShipment._id;
      await api.delete(`/bookings/${id}`);
      setSuccessMsg(`Consignment ${id} removed successfully.`);
      setDeletingShipment(null);
      fetchData();
    } catch (err) {
      console.error('Delete consignment error:', err);
      setFormError(err.response?.data?.message || 'Failed to delete consignment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickSeed = async (isFragileDemo = false) => {
    setSubmitting(true);
    try {
      const route = routes[0] || { routeId: 'CHN-BLR-EXP', source: 'Chennai', destination: 'Bangalore' };
      const randNo = Math.floor(100 + Math.random() * 900);
      const payload = {
        cargoDescription: isFragileDemo
          ? `Laboratory Optical Glassware (FRAGILE) #${randNo}`
          : `Industrial Automation Spares (STACKABLE) #${randNo}`,
        shipperId: isFragileDemo ? 'Optics Tech Labs' : 'Apex Manufacturing Hub',
        cargoCategory: isFragileDemo ? 'FRAGILE_GLASS' : 'AUTOMOTIVE',
        packageCount: 2,
        length: 1.2,
        width: 1.0,
        height: 1.4,
        volume: 3.36,
        weight: isFragileDemo ? 450 : 1600,
        fragile: isFragileDemo,
        stackable: !isFragileDemo,
        allowRotation: !isFragileDemo,
        maxStackWeight: isFragileDemo ? 0 : 1200,
        priority: isFragileDemo ? 'EXPRESS' : 'STANDARD',
        routeId: route.routeId,
        fromStop: route.source || 'Chennai',
        toStop: route.destination || 'Bangalore',
        vehicleId: vehicles[0]?.vehicleId || 'UNASSIGNED',
        date: new Date(),
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
        invoiceValue: isFragileDemo ? 180000 : 95000,
        status: vehicles[0]?.vehicleId ? 'ALLOCATED' : 'PENDING'
      };
      const res = await api.post('/bookings', payload);
      setSuccessMsg(`Sample consignment ${res.data?.bookingId || ''} (${isFragileDemo ? 'Fragile' : 'Stackable'}) added.`);
      fetchData();
    } catch (err) {
      console.error('Seed consignment error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = shipments.filter((s) => {
    if (filter === 'ALL') return true;
    return s.status?.toUpperCase() === filter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Box className="w-6 h-6 text-emerald-600" />
            Consignment Pool &amp; Cargo Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Global view of pending, allocated, and in-transit physical cargo consignments with handling constraints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-gray-900 transition shadow-xs cursor-pointer"
            title="Refresh Consignments"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Consignment</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
          {['ALL', 'PENDING', 'BOOKED', 'ALLOCATED', 'IN_TRANSIT', 'DELIVERED'].map((st) => {
            const count = shipments.filter((s) => (st === 'ALL' ? true : s.status?.toUpperCase() === st)).length;
            return (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border-none cursor-pointer flex items-center gap-1.5 ${
                  filter === st ? 'bg-white text-gray-900 shadow-xs' : 'bg-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <span>{st}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filter === st ? 'bg-slate-100 text-slate-800' : 'bg-gray-200 text-gray-600'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <Link
          to="/manager/optimizer"
          className="no-underline inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900"
        >
          <span>Run 3D Space Optimizer Console</span>
          <Layers className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Success Banner */}
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
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="h-10 bg-gray-100 rounded w-full" />
          <div className="h-10 bg-gray-50 rounded w-full" />
        </div>
      )}

      {/* Empty State */}
      {!loading && shipments.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 md:p-14 text-center space-y-5 shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100 shadow-inner">
            <Box className="w-8 h-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h2 className="text-lg font-black text-gray-900">No Cargo Consignments in Ledger</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Consignments enter the ledger when customers book truck space on the marketplace or when your operations desk registers direct B2B freight orders with specific fragility and stacking constraints.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={openCreateModal}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>Record Consignment</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleQuickSeed(false)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Stackable Cargo</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleQuickSeed(true)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition border border-amber-200"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Add Fragile Cargo</span>
            </button>
          </div>
        </div>
      )}

      {/* Shipments Table */}
      {!loading && shipments.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400 font-bold uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Shipment / Booking ID</th>
                  <th className="pb-3 font-semibold">Cargo &amp; Category</th>
                  <th className="pb-3 font-semibold">Handling Flags</th>
                  <th className="pb-3 font-semibold">Segment (Origin → Dest)</th>
                  <th className="pb-3 font-semibold">Volume (m³)</th>
                  <th className="pb-3 font-semibold">Weight (kg)</th>
                  <th className="pb-3 font-semibold">Assigned Truck</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((s) => (
                  <tr key={s.bookingId || s._id} className="hover:bg-gray-50/70 transition">
                    <td className="py-3.5 font-mono font-bold text-gray-900">
                      <div>{s.bookingId || s.shipmentId}</div>
                      <div className="text-[10px] text-gray-400 font-normal">
                        {s.shipperId || 'Direct Shipper'}
                      </div>
                    </td>

                    <td className="py-3.5 font-semibold text-gray-800">
                      <div>{s.cargoDescription || 'Commercial Freight'}</div>
                      <span className="inline-block mt-0.5 px-2 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {s.cargoCategory || 'GENERAL'}
                      </span>
                    </td>

                    <td className="py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {s.fragile ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3 text-red-600" />
                            FRAGILE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            DURABLE
                          </span>
                        )}

                        {s.stackable !== false ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                            <Layers3 className="w-3 h-3 text-blue-600" />
                            STACKABLE
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            NO-STACK
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 text-gray-800 font-medium">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-gray-400" />
                        {s.fromStop || s.requestedSegment?.fromStop || 'Origin'} → {s.toStop || s.requestedSegment?.toStop || 'Destination'}
                      </span>
                    </td>

                    <td className="py-3.5 font-bold text-emerald-700">
                      {s.volume || s.requestedCapacity?.volume} m³
                    </td>

                    <td className="py-3.5 font-bold text-gray-900">
                      {s.weight ? s.weight.toLocaleString() : (s.requestedCapacity?.weight || 0).toLocaleString()} kg
                    </td>

                    <td className="py-3.5 text-gray-600 font-mono">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        s.isLocked || s.allocationStatus === 'LOCKED'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 w-fit'
                          : s.vehicleId && s.vehicleId !== 'UNASSIGNED'
                          ? 'bg-slate-100 text-slate-900'
                          : 'bg-amber-50 text-amber-800'
                      }`}>
                        {s.isLocked && <Lock className="w-3 h-3 text-emerald-700 inline" />}
                        {s.allocatedVehicleId || s.vehicleId || 'UNASSIGNED'}
                      </span>
                    </td>

                    <td className="py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          s.isLocked || s.status === 'LOCKED'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : s.status === 'DELIVERED' || s.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : s.status === 'IN_TRANSIT'
                            ? 'bg-blue-100 text-blue-800'
                            : s.status === 'ALLOCATED'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {s.isLocked || s.status === 'LOCKED' ? 'LOCKED' : (s.status || 'PENDING')}
                      </span>
                    </td>

                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                          title="Edit Consignment"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingShipment(s)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="Delete Consignment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add / Edit Consignment Modal ────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-xl w-full my-auto max-h-[90vh] flex flex-col overflow-hidden">
            {/* Fixed Header */}
            <div className="p-5 md:p-6 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                  <Box className="w-5 h-5 text-emerald-600" />
                  {editingShipment ? `Edit Consignment (${editingShipment.bookingId || editingShipment.shipmentId})` : 'Record Freight Consignment'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure physical 3D dimensions, fragility, stackability, and corridor stops.
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

              {dimWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>{dimWarning}</span>
                </div>
              )}

              <form id="consignment-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Cargo / Consignment Description *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Industrial Automation Spares (5 Pallets)"
                    value={form.cargoDescription}
                    onChange={(e) => setForm({ ...form, cargoDescription: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Shipper / Client Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Apex Industrial Ltd"
                      value={form.shipperName}
                      onChange={(e) => setForm({ ...form, shipperName: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Cargo Category</label>
                    <select
                      value={form.cargoCategory}
                      onChange={(e) => setForm({ ...form, cargoCategory: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    >
                      <option value="GENERAL">GENERAL FREIGHT</option>
                      <option value="AUTOMOTIVE">AUTOMOTIVE PARTS</option>
                      <option value="ELECTRONICS">ELECTRONICS &amp; APPLIANCES</option>
                      <option value="FRAGILE_GLASS">FRAGILE / GLASSWARE</option>
                      <option value="PERISHABLE">PERISHABLE / AGRI</option>
                      <option value="PHARMACEUTICAL">PHARMACEUTICAL</option>
                      <option value="HAZMAT">HAZMAT / CHEMICAL</option>
                      <option value="TEXTILE">TEXTILE &amp; APPAREL</option>
                    </select>
                  </div>
                </div>

                {/* 3D Dimensions Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs">
                      Package Dimensions &amp; Total Volume
                    </span>
                    <span className="text-emerald-700 font-mono font-black text-xs">
                      Total: {form.volume} m³
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Packages</label>
                      <input
                        type="number"
                        min="1"
                        value={form.packageCount}
                        onChange={(e) => handleDimensionChange('packageCount', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Length (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={form.length}
                        onChange={(e) => handleDimensionChange('length', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Width (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={form.width}
                        onChange={(e) => handleDimensionChange('width', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold text-center"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Height (m)</label>
                      <input
                        type="number"
                        step="0.05"
                        min="0.1"
                        value={form.height}
                        onChange={(e) => handleDimensionChange('height', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 bg-white font-mono font-bold text-center"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">
                      Total Gross Weight (kg) *
                      {parseInt(form.packageCount) > 1 && (
                        <span className="font-normal text-[10px] text-emerald-700 ml-1.5 font-mono">
                          (~{(parseFloat(form.weight) / (parseInt(form.packageCount) || 1) || 0).toFixed(0)} kg / unit)
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g. 1000"
                      value={form.weight}
                      onChange={(e) => setForm({ ...form, weight: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 font-mono font-bold"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Total combined weight for all {form.packageCount || 1} package(s).
                    </p>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Priority Tier</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    >
                      <option value="STANDARD">STANDARD (Normal Delivery)</option>
                      <option value="EXPRESS">EXPRESS (Priority Route)</option>
                      <option value="URGENT">URGENT (Top Priority Slot)</option>
                    </select>
                  </div>
                </div>

                {/* Fragile & Stackable Handling Controls */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <span className="font-bold text-slate-800 text-xs block">
                    3D Packing &amp; Physical Handling Constraints
                  </span>

                  <div className="grid grid-cols-3 gap-3">
                    {/* Fragile Toggle */}
                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition select-none ${
                      form.fragile ? 'bg-red-50 border-red-300 text-red-900 font-bold' : 'bg-white border-gray-200 text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.fragile}
                        onChange={(e) => setForm({ ...form, fragile: e.target.checked })}
                        className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                      />
                      <div className="leading-tight">
                        <div className="text-xs font-bold flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                          Fragile
                        </div>
                        <div className="text-[9px] text-gray-500">Handle with care</div>
                      </div>
                    </label>

                    {/* Stackable Toggle */}
                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition select-none ${
                      form.stackable ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold' : 'bg-white border-gray-200 text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.stackable}
                        onChange={(e) => setForm({ ...form, stackable: e.target.checked })}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <div className="leading-tight">
                        <div className="text-xs font-bold flex items-center gap-1">
                          <Layers3 className="w-3.5 h-3.5 text-blue-600" />
                          Stackable
                        </div>
                        <div className="text-[9px] text-gray-500">Can stack above</div>
                      </div>
                    </label>

                    {/* Allow Rotation Toggle */}
                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition select-none ${
                      form.allowRotation ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-white border-gray-200 text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        checked={form.allowRotation}
                        onChange={(e) => setForm({ ...form, allowRotation: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <div className="leading-tight">
                        <div className="text-xs font-bold flex items-center gap-1">
                          <RotateCw className="w-3.5 h-3.5 text-emerald-600" />
                          Rotate
                        </div>
                        <div className="text-[9px] text-gray-500">Allow 3D rotation</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Corridor Route Lane *</label>
                  <select
                    value={form.routeId}
                    onChange={(e) => handleRouteChange(e.target.value)}
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Pickup Stop (Origin) *</label>
                    <select
                      required
                      value={form.fromStop}
                      onChange={(e) => setForm({ ...form, fromStop: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    >
                      {(() => {
                        const currentRoute = routes.find((r) => r.routeId === form.routeId) || routes[0];
                        const stops = getRouteStopsList(currentRoute);
                        if (stops.length === 0) {
                          return <option value="">Select a corridor route first</option>;
                        }
                        return stops.map((stopName, idx) => (
                          <option key={`pickup-${stopName}-${idx}`} value={stopName}>
                            {idx === 0 ? `${stopName} (Origin Hub)` : stopName}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1">Delivery Stop (Dest) *</label>
                    <select
                      required
                      value={form.toStop}
                      onChange={(e) => setForm({ ...form, toStop: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:border-emerald-600 focus:bg-white outline-none font-semibold"
                    >
                      {(() => {
                        const currentRoute = routes.find((r) => r.routeId === form.routeId) || routes[0];
                        const stops = getRouteStopsList(currentRoute);
                        if (stops.length === 0) {
                          return <option value="">Select a corridor route first</option>;
                        }
                        return stops.map((stopName, idx) => (
                          <option key={`delivery-${stopName}-${idx}`} value={stopName}>
                            {idx === stops.length - 1 ? `${stopName} (Final Destination)` : stopName}
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>

                {/* 3D Space Optimizer Allocation Pipeline */}
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center gap-3 text-xs text-emerald-800">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs font-bold text-sm">
                    3D
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-emerald-900">Queued for 3D Space Optimization</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">
                      This consignment will be automatically packed and allocated to scheduled trips in the <strong>Space Optimizer</strong>.
                    </p>
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
                form="consignment-form"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition disabled:opacity-50 text-xs"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Saving Consignment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingShipment ? 'Save Consignment Changes' : 'Record Consignment'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ──────────────────────── */}
      {deletingShipment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Delete Consignment</h3>
                <p className="text-xs text-gray-500">This will remove the shipment from the cargo pool.</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to remove consignment{' '}
              <strong className="text-gray-900 font-mono">
                {deletingShipment.bookingId || deletingShipment.shipmentId}
              </strong>{' '}
              ({deletingShipment.cargoDescription || 'Commercial Freight'} • {deletingShipment.volume} m³ / {deletingShipment.weight} kg)?
            </p>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3 text-xs">
              <button
                type="button"
                onClick={() => setDeletingShipment(null)}
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

export default ManagerShipmentsView;
