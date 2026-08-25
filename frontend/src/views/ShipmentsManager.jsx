import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Box, Truck, Calendar, MapPin,
  User, Plus, Trash2, Coins, AlertTriangle,
  CheckCircle, RefreshCw, Filter
} from 'lucide-react';

const formatINR = (v) => v != null ? `₹${v.toLocaleString('en-IN')}` : '₹0';

const ShipmentsManager = () => {
  const [routes, setRoutes] = useState([]);
  const [bookings, setBookings] = useState([]);

  // Form States
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedShipper, setSelectedShipper] = useState('shipper-apex');
  const [volume, setVolume] = useState(15);
  const [weight, setWeight] = useState(2500);
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [cargoDesc, setCargoDesc] = useState('General Electronics Cargo');
  const [invoiceVal, setInvoiceVal] = useState(150000);

  // Status/Feedback
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');

  // Table Filters
  const [filterRoute, setFilterRoute] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');

  // Initial Load
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, bRes] = await Promise.all([
        api.get('/routes'),
        api.get('/bookings')
      ]);

      setRoutes(rRes.data);
      setBookings(bRes.data);

      // Collect all unique stops
      const uniqueStops = Array.from(new Set(
        rRes.data.flatMap(r => r.stops && r.stops.length > 0 ? r.stops : [r.source, r.destination])
      )).sort();

      if (uniqueStops.length > 1) {
        setFromStop(uniqueStops[0]);
        setToStop(uniqueStops[uniqueStops.length - 1]);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch shipments inventory and network cities.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddShipment = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess('');

    if (fromStop === toStop) {
      setError("Pickup city and Delivery city must be different network stops.");
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        date,
        vehicleId: 'UNASSIGNED',
        routeId: 'UNASSIGNED',
        shipperId: selectedShipper,
        volume: parseFloat(volume),
        weight: parseFloat(weight),
        fromStop,
        toStop,
        cargoDescription: cargoDesc,
        invoiceNumber: `INV-SIM-${Math.floor(100000 + Math.random() * 900000)}`,
        invoiceValue: parseFloat(invoiceVal)
      };

      const { data } = await api.post('/bookings', payload);
      setSuccess(`Shipment recorded! Consign ID: ${data.bookingId} is registered for optimization.`);
      
      // Refresh database listings
      const bRes = await api.get('/bookings');
      setBookings(bRes.data);

      // Reset Form fields slightly
      setCargoDesc('General Electronics Cargo');
      setInvoiceVal(150000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to record shipment. Verify connection.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter Bookings locally for searchability
  const filteredBookings = bookings.filter(b => {
    const routeMatch = filterRoute === 'ALL' || b.routeId === filterRoute;
    const dateMatch = !filterDate || new Date(b.date).toISOString().split('T')[0] === filterDate;
    return routeMatch && dateMatch;
  });

  const uniqueStops = Array.from(new Set(
    routes.flatMap(r => r.stops && r.stops.length > 0 ? r.stops : [r.source, r.destination])
  )).sort();

  if (loading && routes.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center space-x-2 mb-1">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span>
          </span>
          <span className="text-[10px] font-black text-green-600 uppercase tracking-[0.18em]">Operational Ingest</span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Shipment Inventory Manager</h1>
        <p className="text-[12px] text-slate-500 font-semibold mt-0.5">
          Record logistics bookings with pickup and delivery endpoints. The Space Optimizer decides route lanes and carrier trucks.
        </p>
      </div>

      {/* Main Grid: Add Form + Listings Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Box className="w-4.5 h-4.5 text-green-600" />
              <span>Book New Shipment Consignment</span>
            </h2>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start space-x-2.5 text-[12px] font-bold">
                <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-start space-x-2.5 text-[12px] font-bold">
                <CheckCircle className="w-4.5 h-4.5 shrink-0 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleAddShipment} className="space-y-4 text-xs font-bold text-slate-600">
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Booking Date</label>
                  <input 
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  />
                </div>

                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Shipper / Customer</label>
                  <select
                    value={selectedShipper}
                    onChange={e => setSelectedShipper(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  >
                    <option value="shipper-apex">shipper-apex (Enterprise)</option>
                    <option value="shipper-global">shipper-global (Enterprise)</option>
                    <option value="shipper-local">shipper-local (SMB)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Pickup Stop</label>
                  <select
                    value={fromStop}
                    onChange={e => setFromStop(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  >
                    {uniqueStops.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Delivery Stop</label>
                  <select
                    value={toStop}
                    onChange={e => setToStop(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  >
                    {uniqueStops.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Cargo Volume (m³)</label>
                  <input 
                    type="number" 
                    value={volume} 
                    onChange={e => setVolume(e.target.value)} 
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Cargo Weight (kg)</label>
                  <input 
                    type="number" 
                    value={weight} 
                    onChange={e => setWeight(e.target.value)} 
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Cargo Description</label>
                  <input 
                    type="text" 
                    value={cargoDesc} 
                    onChange={e => setCargoDesc(e.target.value)} 
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block mb-1 text-[9px] uppercase tracking-wider text-slate-400">Invoice Value (INR)</label>
                  <input 
                    type="number" 
                    value={invoiceVal} 
                    onChange={e => setInvoiceVal(e.target.value)} 
                    required
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl text-xs font-bold shadow-md shadow-green-600/20 transition flex items-center justify-center space-x-2 cursor-pointer border-none disabled:opacity-50"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Confirm Space Booking</span>
                  </>
                )}
              </button>

            </form>
          </div>
        </div>

        {/* Right Column: Listings (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            
            {/* Table Filters header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Filter className="w-4.5 h-4.5 text-green-600" />
                <span>Consignment Shipment Register ({filteredBookings.length})</span>
              </h2>

              <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
                <div className="space-y-0.5">
                  <label className="text-[8px] uppercase tracking-wider text-slate-400">Filter Lane</label>
                  <select
                    value={filterRoute}
                    onChange={e => setFilterRoute(e.target.value)}
                    className="bg-slate-50 border border-slate-200 p-1.5 rounded-lg focus:outline-none font-bold"
                  >
                    <option value="ALL">ALL Lanes</option>
                    {routes.map(r => <option key={r.routeId} value={r.routeId}>{r.routeId}</option>)}
                    <option value="UNASSIGNED">UNASSIGNED</option>
                  </select>
                </div>
                <div className="space-y-0.5">
                  <label className="text-[8px] uppercase tracking-wider text-slate-400">Filter Date</label>
                  <input 
                    type="date"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 p-1 rounded-lg focus:outline-none font-bold block"
                  />
                </div>
              </div>
            </div>

            {/* Bookings Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-2">Booking ID</th>
                    <th className="py-3 px-2">Date</th>
                    <th className="py-3 px-2">Lane / Route</th>
                    <th className="py-3 px-2">Stops</th>
                    <th className="py-3 px-2">Vehicle ID</th>
                    <th className="py-3 px-2 text-right">Volume</th>
                    <th className="py-3 px-2 text-right">Weight</th>
                    <th className="py-3 px-2 text-right">Revenue</th>
                    <th className="py-3 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="font-bold text-slate-700 divide-y divide-slate-50">
                  {filteredBookings.map(b => (
                    <tr key={b.bookingId} className="hover:bg-slate-50/55 transition">
                      <td className="py-3.5 px-2 text-slate-900 font-extrabold">{b.bookingId}</td>
                      <td className="py-3.5 px-2 text-slate-500">{new Date(b.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                      <td className="py-3.5 px-2">
                        {b.routeId === 'UNASSIGNED' ? (
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-black px-1.5 py-0.5 rounded">UNASSIGNED</span>
                        ) : b.routeId}
                      </td>
                      <td className="py-3.5 px-2">
                        <span className="text-[10px] text-green-600 bg-green-50/50 border border-green-100 px-1.5 py-0.5 rounded">
                          {b.fromStop || 'Origin'} ➔ {b.toStop || 'Dest'}
                        </span>
                      </td>
                      <td className="py-3.5 px-2 text-slate-600">
                        {b.vehicleId === 'UNASSIGNED' ? (
                          <span className="text-[9px] bg-slate-100 text-slate-500 font-black px-1.5 py-0.5 rounded">UNASSIGNED</span>
                        ) : b.vehicleId}
                      </td>
                      <td className="py-3.5 px-2 text-right">{b.volume} m³</td>
                      <td className="py-3.5 px-2 text-right">{b.weight} kg</td>
                      <td className="py-3.5 px-2 text-right text-slate-900">{formatINR(b.revenue)}</td>
                      <td className="py-3.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          b.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' :
                          b.status === 'In Transit' ? 'bg-blue-50 text-blue-700' :
                          b.status === 'Cancelled' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredBookings.length === 0 && (
                    <tr>
                      <td colSpan="9" className="text-center py-10 text-slate-400 font-bold">
                        No shipment consignments match the active search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default ShipmentsManager;
