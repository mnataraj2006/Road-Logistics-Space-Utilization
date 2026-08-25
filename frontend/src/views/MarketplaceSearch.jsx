import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Search, Truck, Clock, IndianRupee, 
  CheckCircle, Info, Sparkles, Navigation, ArrowRight, MapPin, AlertCircle,
  X, FileText, Package, CreditCard
} from 'lucide-react';

const formatINR = (v) => v != null ? `₹${v.toLocaleString('en-IN')}` : '₹0';

const MarketplaceSearch = () => {
  const [routes,         setRoutes]         = useState([]);
  const [vehicles,       setVehicles]       = useState([]);
  
  // Stops selection
  const [fromStop,       setFromStop]       = useState('');
  const [toStop,         setToStop]         = useState('');

  const [cargoVolume,    setCargoVolume]    = useState(8);
  const [cargoWeight,    setCargoWeight]    = useState(1200);
  const [dispatchDate,   setDispatchDate]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0];
  });
  const [loading,        setLoading]        = useState(false);
  const [searchResults,  setSearchResults]  = useState([]);
  const [bookingSuccess, setBookingSuccess] = useState('');
  const [bookingError,   setBookingError]   = useState(null);

  // New state variables for modal & receipt
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [cargoDescription, setCargoDescription] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceValue, setInvoiceValue] = useState('');
  const [editableVolume, setEditableVolume] = useState(8);
  const [editableWeight, setEditableWeight] = useState(1200);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/routes'), api.get('/vehicles')])
      .then(([rRes, vRes]) => {
        setRoutes(rRes.data);
        setVehicles(vRes.data);
        
        // Extract unique cities and set initial default stop options
        const uniqueCities = Array.from(
          new Set(
            rRes.data.flatMap(r => r.stops && r.stops.length > 0 ? r.stops : [r.source, r.destination])
              .map(c => c.trim().toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()))
          )
        ).sort();
        if (uniqueCities.length > 1) {
          setFromStop(uniqueCities[0]);
          setToStop(uniqueCities[1]);
        }
      })
      .catch(err => console.error('Fetch error:', err));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSearchResults([]);
    setBookingSuccess('');
    setBookingError(null);
    try {
      // Find all routes that cover fromStop → toStop in order
      const matchingRoutes = routes.filter(r => {
        let stops = r.stops;
        if (!stops || stops.length < 2) {
          stops = [r.source, r.destination];
        }
        const fromIdx = stops.findIndex(s => s.toLowerCase() === fromStop.toLowerCase());
        const toIdx = stops.findIndex(s => s.toLowerCase() === toStop.toLowerCase());
        return fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx;
      });

      if (matchingRoutes.length === 0) {
        setBookingError({
          message: `No active shipping lanes cover the route segment ${fromStop} → ${toStop}.`,
          alternatives: []
        });
        setLoading(false);
        return;
      }

      // Match active vehicles associated with any of these matching routes
      const matchingRouteIds = new Set(matchingRoutes.map(r => r.routeId));
      const matchingVehicles = vehicles.filter(v => matchingRouteIds.has(v.routeLane) && v.status === 'Active');

      if (matchingVehicles.length === 0) {
        setBookingError({
          message: `No active carrier trucks are assigned to routes covering ${fromStop} → ${toStop} on this date.`,
          alternatives: []
        });
        setLoading(false);
        return;
      }

      const results = await Promise.all(matchingVehicles.map(async (v) => {
        try {
          const routeDetails = matchingRoutes.find(r => r.routeId === v.routeLane);
          if (!routeDetails) return null;

          const [occRes, delayRes, priceRes] = await Promise.all([
            api.post('/predictions/occupancy', { vehicle_id: v.vehicleId, route_id: routeDetails.routeId, date: dispatchDate, current_volume: parseFloat(cargoVolume), current_weight: parseFloat(cargoWeight) }),
            api.post('/predictions/delay',     { vehicle_id: v.vehicleId, route_id: routeDetails.routeId, date: dispatchDate }),
            api.post('/predictions/price',     { route_id: routeDetails.routeId, volume: parseFloat(cargoVolume), weight: parseFloat(cargoWeight), date: dispatchDate, vehicle_id: v.vehicleId }),
          ]);
          return { vehicle: v, route: routeDetails, occupancy: occRes.data, delay: delayRes.data, price: priceRes.data };
        } catch { return null; }
      }));
      setSearchResults(results.filter(Boolean));
    } catch (err) {
      console.error('Marketplace search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMatch) return;
    
    setBookingError(null);
    setBookingSuccess('');
    setShowConfirmModal(false);
    
    try {
      setLoading(true);
      const response = await api.post('/bookings', {
        date: dispatchDate,
        vehicleId: selectedMatch.vehicle.vehicleId,
        routeId: selectedMatch.route.routeId,
        volume: parseFloat(editableVolume),
        weight: parseFloat(editableWeight),
        cargoDescription,
        invoiceNumber,
        invoiceValue: parseFloat(invoiceValue) || 0,
        status: 'Pending',
        fromStop,
        toStop
      });
      
      setReceiptData({
        ...response.data,
        vehicleType: selectedMatch.vehicle.type,
        carrierId: selectedMatch.vehicle.carrierId,
        fromStop,
        toStop,
        cargoDescription,
        invoiceNumber,
        invoiceValue
      });
      setShowReceipt(true);
      setBookingSuccess(`Booked container space on ${selectedMatch.vehicle.vehicleId} from ${fromStop} → ${toStop}. Booking receipt generated.`);
      setSearchResults([]);
    } catch (err) {
      console.error('Booking error:', err);
      if (err.response && err.response.data && err.response.data.alternatives) {
        setBookingError({
          message: err.response.data.message,
          alternatives: err.response.data.alternatives
        });
      } else {
        setBookingError({
          message: err.response?.data?.message || 'Failed to book container space. Verify capacity limits.',
          alternatives: []
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBookAlternative = (alt) => {
    const matchedRoute = routes.find(r => r.routeId === alt.routeId);
    setSelectedMatch({
      vehicle: {
        vehicleId: alt.vehicleId,
        carrierId: alt.carrierId,
        type: alt.type,
        routeLane: alt.routeId
      },
      route: matchedRoute || { routeId: alt.routeId, source: fromStop, destination: toStop },
      price: { suggested_price: alt.revenue || 20000 }
    });
    setEditableVolume(cargoVolume);
    setEditableWeight(cargoWeight);
    setCargoDescription('');
    setInvoiceNumber('');
    setInvoiceValue('');
    setShowConfirmModal(true);
  };

  const allCities = Array.from(
    new Set(
      routes.flatMap(r => r.stops && r.stops.length > 0 ? r.stops : [r.source, r.destination])
        .map(c => c.trim().toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase()))
    )
  ).sort();
  const destinationOptions = fromStop ? allCities.filter(c => c !== fromStop) : allCities;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
          <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Exporter Portal</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Find Cargo Space</h1>
        <p className="text-[12px] text-gray-400 font-semibold mt-0.5">
          Search carrier capacities, select intermediate stops, inspect ML delay logs, and book dynamic rates in escrow.
        </p>
      </div>

      {/* Success Banner */}
      {bookingSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-2xl flex items-start space-x-3 text-[12px] font-semibold">
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5 text-[#16a34a]" />
          <span>{bookingSuccess}</span>
        </div>
      )}

      {/* Error / Alternatives Banner */}
      {bookingError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-2xl space-y-4 text-[12.5px] font-semibold">
          <div className="flex items-start space-x-3 text-red-600">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-[13px]">{bookingError.message}</p>
            </div>
          </div>
          {bookingError.alternatives && bookingError.alternatives.length > 0 && (
            <div className="pt-3 border-t border-red-100/50 space-y-3">
              <p className="text-[10px] uppercase font-black tracking-wider text-red-500">We found alternative active vehicles with sufficient space on this date:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bookingError.alternatives.map((alt) => (
                  <div key={alt.vehicleId} className="bg-white border border-red-100 p-3.5 rounded-xl flex justify-between items-center shadow-sm">
                    <div>
                      <p className="text-[11.5px] font-black text-gray-800">{alt.vehicleId}</p>
                      <p className="text-[9px] font-bold text-gray-400 mt-0.5">{alt.type} · Carrier: {alt.carrierId}</p>
                      <p className="text-[9px] font-extrabold text-[#16a34a] mt-0.5">Avail: {alt.remainingVolume} m³ / {alt.remainingWeight.toLocaleString()} kg</p>
                    </div>
                    <button
                      onClick={() => handleBookAlternative(alt)}
                      className="bg-[#16a34a] hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg border-none text-[10px] cursor-pointer shadow shadow-green-600/10 transition"
                    >
                      Book Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <form onSubmit={handleSearch} className="space-y-4 font-semibold">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Origin Stop */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Cargo Pickup Stop (Origin)</label>
              <select
                value={fromStop}
                onChange={e => setFromStop(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 px-3 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
              >
                {allCities.map(stop => (
                  <option key={stop} value={stop}>{stop}</option>
                ))}
              </select>
            </div>

            {/* Destination Stop */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Cargo Delivery Stop (Destination)</label>
              <select
                value={toStop}
                onChange={e => setToStop(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 px-3 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
              >
                {destinationOptions.map(stop => (
                  <option key={stop} value={stop}>{stop}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 items-end">
            <div className="md:col-span-1 space-y-1.5">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Dispatch Date</label>
              <input
                type="date"
                value={dispatchDate}
                onChange={e => setDispatchDate(e.target.value)}
                required
                className="w-full bg-gray-50 border border-gray-200 px-3 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Volume (m³)</label>
                <input
                  type="number" step="0.1" value={cargoVolume}
                  onChange={e => setCargoVolume(parseFloat(e.target.value) || 1)} required
                  className="w-full bg-gray-50 border border-gray-200 px-3 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Weight (kg)</label>
                <input
                  type="number" value={cargoWeight}
                  onChange={e => setCargoWeight(parseInt(e.target.value) || 100)} required
                  className="w-full bg-gray-50 border border-gray-200 px-3 py-3 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl shadow-lg shadow-green-600/20 cursor-pointer flex items-center justify-center space-x-2 border-none text-[12px] transition-all duration-150 h-12"
            >
              <Search className="w-4 h-4" />
              <span>{loading ? 'Searching…' : 'Search Capacity'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {searchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-[11px] font-black text-gray-500 uppercase tracking-widest">
            Available Matches ({searchResults.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {searchResults.map((res) => {
              const price     = res.price?.suggested_price    || 20000;
              const delay     = res.delay?.predicted_delay_hours || 0;
              const status    = res.delay?.status             || 'On Time';
              const occupancy = res.occupancy?.predicted_utilization_percent || 70;

              return (
                <div key={res.vehicle.vehicleId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between hover:shadow-md transition-shadow duration-200">
                  <div>
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
                          <Truck className="w-5 h-5 text-[#16a34a]" />
                        </div>
                        <div>
                          <h3 className="font-black text-gray-900 text-[14px]">{res.vehicle.vehicleId}</h3>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Carrier: {res.vehicle.carrierId}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#16a34a] bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full font-bold">
                        {res.vehicle.type}
                      </span>
                    </div>

                    {/* Capacity info */}
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl border border-gray-100 p-3 mb-4 text-[10px] font-bold">
                      <div>
                        <span className="text-gray-400 block uppercase tracking-wider text-[8px] mb-0.5">Max Volume</span>
                        <span className="text-gray-800 text-[12px]">{res.vehicle.capacityVolume} m³</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block uppercase tracking-wider text-[8px] mb-0.5">Max Weight</span>
                        <span className="text-gray-800 text-[12px]">{(res.vehicle.capacityWeight / 1000).toFixed(1)} tons</span>
                      </div>
                    </div>

                    {/* Occupancy forecast */}
                    <div className="mb-4">
                      <div className="flex justify-between text-[11px] mb-1.5">
                        <span className="text-gray-500 font-semibold">Predicted Occupancy on Dispatch</span>
                        <span className={`font-black ${occupancy >= 80 ? 'text-[#16a34a]' : 'text-amber-600'}`}>{occupancy}%</span>
                      </div>
                      <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${occupancy >= 80 ? 'bg-[#16a34a]' : 'bg-amber-500'}`}
                          style={{ width: `${occupancy}%` }}
                        />
                      </div>
                    </div>

                    {/* Delay & Price */}
                    <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-4 mb-5">
                      <div className="flex items-start space-x-2">
                        <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[9px] text-gray-400 block font-bold uppercase tracking-wider">Est. Delay</span>
                          <span className="font-black text-gray-900 text-[12px] block mt-0.5">{delay} hrs</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase inline-block mt-1 ${
                            status === 'On Time'    ? 'bg-green-50 text-green-700' :
                            status === 'Minor Delay'? 'bg-amber-50 text-amber-700' :
                                                      'bg-red-50 text-red-600'
                          }`}>{status}</span>
                        </div>
                      </div>
                      <div className="flex items-start space-x-2">
                        <IndianRupee className="w-4 h-4 text-[#16a34a] shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[9px] text-gray-400 block font-bold uppercase tracking-wider">Dynamic Rate</span>
                          <span className="font-black text-[#16a34a] text-[13px] block mt-0.5">{formatINR(price)}</span>
                          <span className="text-[8px] font-semibold text-gray-400 block mt-1">Platform fee included</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Book button */}
                  <button
                    onClick={() => {
                      setSelectedMatch(res);
                      setEditableVolume(cargoVolume);
                      setEditableWeight(cargoWeight);
                      setCargoDescription('');
                      setInvoiceNumber('');
                      setInvoiceValue('');
                      setShowConfirmModal(true);
                    }}
                    className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl shadow-md shadow-green-600/20 transition-all duration-150 cursor-pointer border-none text-[12px] flex items-center justify-center space-x-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Confirm Booking & Escrow</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searchResults.length && !loading && !bookingSuccess && (
        <div className="min-h-[240px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white p-6">
          <div className="text-center text-gray-400 max-w-sm text-[12px] font-semibold">
            <Info className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p className="leading-relaxed">
              Select a shipping lane and enter cargo dimensions above to match available trucks and score live ML delay & pricing predictions.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && selectedMatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-[#16a34a]" />
                <h2 className="text-lg font-black text-gray-900 tracking-tight font-sans">Confirm Cargo Booking</h2>
              </div>
              <button 
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600 transition p-1 bg-transparent border-none cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSubmit} className="space-y-4">
              {/* Trip details preview */}
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-[11px] font-semibold text-slate-600 space-y-1.5">
                <p className="flex justify-between">
                  <span>Vehicle ID:</span>
                  <span className="font-extrabold text-slate-800">{selectedMatch.vehicle.vehicleId} ({selectedMatch.vehicle.type})</span>
                </p>
                <p className="flex justify-between">
                  <span>Carrier:</span>
                  <span className="font-extrabold text-slate-800">{selectedMatch.vehicle.carrierId}</span>
                </p>
                <p className="flex justify-between">
                  <span>Shipping Segment:</span>
                  <span className="font-extrabold text-[#16a34a]">{fromStop} → {toStop}</span>
                </p>
                <p className="flex justify-between border-t border-slate-200/60 pt-1.5 mt-1.5">
                  <span>Est. Dynamic Rate:</span>
                  <span className="font-extrabold text-[#16a34a] text-[13px]">{formatINR(selectedMatch.price?.suggested_price || selectedMatch.price)}</span>
                </p>
              </div>

              {/* Cargo description */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">What is inside the load? (Cargo Description)</label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. Sweets, Snacks, Electronics, Textiles"
                  value={cargoDescription}
                  onChange={e => setCargoDescription(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                />
              </div>

              {/* Volume & Weight inputs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Volume (m³)</label>
                  <input 
                    type="number"
                    step="0.1"
                    required
                    value={editableVolume}
                    onChange={e => setEditableVolume(parseFloat(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Weight (kg)</label>
                  <input 
                    type="number"
                    required
                    value={editableWeight}
                    onChange={e => setEditableWeight(parseInt(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                  />
                </div>
              </div>

              {/* Invoice details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Invoice Number</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. INV-2026-987"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Invoice Value (INR)</label>
                  <input 
                    type="number"
                    required
                    placeholder="e.g. 75000"
                    value={invoiceValue}
                    onChange={e => setInvoiceValue(parseInt(e.target.value) || '')}
                    className="w-full bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[13px] font-semibold"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold rounded-xl text-[12px] bg-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-black rounded-xl text-[12px] shadow-lg shadow-green-600/20 border-none transition cursor-pointer"
                >
                  Confirm & Escrow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4 text-slate-800">
            {/* Success icon header */}
            <div className="text-center space-y-2 border-b border-gray-100 pb-4">
              <div className="w-12 h-12 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto text-[#16a34a]">
                <FileText className="w-6 h-6" />
              </div>
              <h2 className="text-[16px] font-black text-gray-900 tracking-tight uppercase tracking-wider font-sans">Booking Escrow Receipt</h2>
              <span className="text-[10px] text-[#16a34a] bg-green-50 border border-green-100 px-3 py-1 rounded-full font-black uppercase inline-block font-sans">
                Status: {receiptData.status}
              </span>
            </div>

            {/* Receipt Parameters Grid */}
            <div className="space-y-3.5 text-[11.5px] font-semibold">
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-400">Booking ID</span>
                <span className="font-extrabold text-slate-900 text-[12px]">{receiptData.bookingId}</span>
              </div>
              
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-400">Vehicle ID</span>
                <span className="font-extrabold text-slate-900">{receiptData.vehicleId} ({receiptData.vehicleType || 'Carrier Truck'})</span>
              </div>
              
              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-400">Carrier Provider</span>
                <span className="font-extrabold text-slate-900">{receiptData.carrierId}</span>
              </div>

              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-400">Route Lane</span>
                <span className="font-extrabold text-[#16a34a]">{receiptData.fromStop} → {receiptData.toStop}</span>
              </div>

              <div className="flex justify-between border-b border-dashed border-gray-100 pb-2">
                <span className="text-gray-400">Cargo Contents</span>
                <span className="font-extrabold text-slate-900">{receiptData.cargoDescription}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-dashed border-gray-100 pb-2">
                <div className="flex justify-between pr-2 border-r border-gray-100">
                  <span className="text-gray-400">Volume</span>
                  <span className="font-extrabold text-slate-900">{receiptData.volume} m³</span>
                </div>
                <div className="flex justify-between pl-2">
                  <span className="text-gray-400">Weight</span>
                  <span className="font-extrabold text-slate-900">{receiptData.weight} kg</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-dashed border-gray-100 pb-2">
                <div className="flex justify-between pr-2 border-r border-gray-100">
                  <span className="text-gray-400">Invoice No.</span>
                  <span className="font-extrabold text-slate-900">{receiptData.invoiceNumber}</span>
                </div>
                <div className="flex justify-between pl-2">
                  <span className="text-gray-400">Value</span>
                  <span className="font-extrabold text-slate-900">{formatINR(receiptData.invoiceValue)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center bg-green-50/50 border border-green-100/50 rounded-xl p-3.5 text-[#16a34a] mt-2">
                <span className="font-bold text-[11px] uppercase tracking-wider">Dynamic Escrow Rate</span>
                <span className="font-black text-[15px]">{formatINR(receiptData.revenue)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowReceipt(false);
                setReceiptData(null);
              }}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-[12px] shadow-md transition border-none cursor-pointer"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketplaceSearch;
