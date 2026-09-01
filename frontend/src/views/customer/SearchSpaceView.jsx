import React, { useState, useEffect } from 'react';
import {
  Search, Truck, ShieldCheck, MapPin, Calendar, Box,
  AlertCircle, CheckCircle2, ArrowRight, Zap, RefreshCw, Layers
} from 'lucide-react';
import axios from 'axios';

const SearchSpaceView = () => {
  const [pickup, setPickup] = useState('Chennai');
  const [delivery, setDelivery] = useState('Madurai');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [volume, setVolume] = useState('15');
  const [weight, setWeight] = useState('3000');
  const [length, setLength] = useState('2.0');
  const [width, setWidth] = useState('1.2');
  const [height, setHeight] = useState('1.5');
  const [fragile, setFragile] = useState(false);
  const [serviceTier, setServiceTier] = useState('STANDARD');

  const [loading, setLoading] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(null);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setBookingSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        '/api/capacity/search',
        {
          pickup,
          delivery,
          date,
          volume: parseFloat(volume),
          weight: parseFloat(weight),
          length: parseFloat(length),
          width: parseFloat(width),
          height: parseFloat(height),
          fragile,
          serviceTier
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );

      setSearchResults(response.data.availableVehicles || []);
    } catch (err) {
      console.error('Capacity search error:', err);
      setError(err.response?.data?.message || 'Failed to search available truck space.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch();
  }, []);

  const handleBookSpace = async (truckResult) => {
    setLoading(true);
    setError(null);
    setBookingSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const payload = {
        vehicleId: truckResult.vehicleId,
        routeId: truckResult.routeId,
        pickup,
        delivery,
        date,
        volume: parseFloat(volume),
        weight: parseFloat(weight),
        length: parseFloat(length),
        width: parseFloat(width),
        height: parseFloat(height),
        cargoDescription: `${fragile ? 'Fragile ' : ''}Consignment (${volume}m³, ${weight}kg)`,
        serviceTier
      };

      const response = await axios.post('/api/capacity/book', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      setBookingSuccess({
        bookingId: response.data.bookingId,
        vehicleId: truckResult.vehicleId,
        routeId: truckResult.routeId,
        price: response.data.booking?.price || truckResult.pricing?.finalPrice,
        pickup,
        delivery
      });

      // Refresh search capacity
      handleSearch();
    } catch (err) {
      console.error('Booking commit error:', err);
      setError(err.response?.data?.message || 'Failed to book space on the selected truck.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <Search className="w-6 h-6 text-emerald-600" />
          Dynamic Multi-Stop Truck Space Search
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Search guaranteed available space across multi-segment route networks with deterministic pricing.
        </p>
      </div>

      {/* Success Notification */}
      {bookingSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-5 shadow-xs flex items-start justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-emerald-900">
                Capacity Reservation Confirmed!
              </h4>
              <p className="text-xs text-emerald-700 mt-1">
                Booking ID: <span className="font-mono font-bold">{bookingSuccess.bookingId}</span> | Truck:{' '}
                <span className="font-bold">{bookingSuccess.vehicleId}</span> | Hop: {bookingSuccess.pickup} → {bookingSuccess.delivery} | Price: ₹{bookingSuccess.price}
              </p>
            </div>
          </div>
          <button
            onClick={() => setBookingSuccess(null)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-100 px-3 py-1.5 rounded-lg border-none cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      {/* Search Input Filter Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Pickup */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Pickup Stop
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={pickup}
                  onChange={(e) => setPickup(e.target.value)}
                  placeholder="e.g. Chennai"
                  required
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Delivery */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Delivery Stop
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={delivery}
                  onChange={(e) => setDelivery(e.target.value)}
                  placeholder="e.g. Madurai"
                  required
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Requested Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            {/* Service Tier */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                Service Tier
              </label>
              <select
                value={serviceTier}
                onChange={(e) => setServiceTier(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold border border-gray-300 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
              >
                <option value="STANDARD">Standard Economy</option>
                <option value="EXPRESS">Express Priority (+20%)</option>
                <option value="URGENT">Urgent Critical (+50%)</option>
              </select>
            </div>
          </div>

          {/* Consignment Dimensions & Physical Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Volume (m³)
              </label>
              <input
                type="number"
                step="0.5"
                min="0.1"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="50"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
                className="w-full px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Length (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Width (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Height (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-semibold border border-gray-300 rounded-lg outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fragile}
                  onChange={(e) => setFragile(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                Fragile Cargo
              </label>
            </div>
          </div>

          {/* Search Trigger */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/20 transition cursor-pointer border-none disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>{loading ? 'Evaluating Segment Headroom...' : 'Search Available Space'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Available Space Search Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            Available Trucks & Segment Capacity ({searchResults.length})
          </h2>
          <span className="text-xs text-gray-500">
            Guaranteed headroom across all occupied segments
          </span>
        </div>

        {searchResults.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-400 mx-auto" />
            <h4 className="text-sm font-bold text-gray-800">No Eligible Trucks with Sufficient Capacity</h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              No active vehicle currently has {volume}m³ and {weight}kg headroom across all route segments between{' '}
              {pickup} and {delivery}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {searchResults.map((truck) => (
              <div
                key={truck.vehicleId}
                className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:border-emerald-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                {/* Truck Info & Route */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-gray-900">{truck.vehicleId}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                      {truck.vehicleType || 'Container Truck'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Compatible & Verified
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Route: {truck.routeLane} ({truck.routeStops?.join(' → ')})</span>
                  </p>

                  {/* Headroom Specs */}
                  <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
                    <span className="text-gray-700">
                      Available Vol:{' '}
                      <strong className="text-emerald-700 font-bold">{truck.availableVolume} m³</strong> (of {truck.capacityVolume} m³)
                    </span>
                    <span className="text-gray-700">
                      Available Wt:{' '}
                      <strong className="text-emerald-700 font-bold">{truck.availableWeight} kg</strong> (of {truck.capacityWeight} kg)
                    </span>
                    <span className="text-gray-700">
                      Occupied Segments:{' '}
                      <strong className="text-gray-900">{truck.occupiedSegments?.length || 1} segments</strong>
                    </span>
                  </div>
                </div>

                {/* Deterministic Price & Book Action */}
                <div className="shrink-0 flex md:flex-col items-center md:items-end justify-between md:justify-center gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-gray-100">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Deterministic Quote
                    </span>
                    <span className="text-xl font-black text-gray-900">
                      ₹{truck.pricing?.finalPrice?.toLocaleString() || truck.pricing?.basePrice?.toLocaleString() || '1,800'}
                    </span>
                    <span className="text-[10px] text-gray-500 block">
                      Rule: {truck.pricing?.pricingRuleVersion || 'v2.1'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleBookSpace(truck)}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm transition cursor-pointer border-none disabled:opacity-50"
                  >
                    <span>Book Space</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchSpaceView;
