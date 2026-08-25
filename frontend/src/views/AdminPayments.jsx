import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  CreditCard, IndianRupee, Shield, CheckCircle, Info, Calendar,
  ArrowUpRight, AlertCircle, RefreshCw
} from 'lucide-react';

const formatINR = (value) => {
  if (value === undefined || value === null) return '₹0';
  return `₹${value.toLocaleString('en-IN')}`;
};

const AdminPayments = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [releasingId, setReleasingId] = useState(null);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/bookings/payments');
      setPayments(data);
    } catch (err) {
      console.error('Error fetching payments ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  const handleRelease = async (paymentId) => {
    if (!window.confirm('Release these escrow funds to the carrier? This action is irreversible.')) return;
    setReleasingId(paymentId);
    try {
      await api.put(`/bookings/payments/${paymentId}/release`);
      // Update state locally or refetch
      setPayments(prev => prev.map(p => p._id === paymentId ? { ...p, status: 'PaidOut' } : p));
      alert('Escrow payment released to carrier!');
    } catch (err) {
      console.error('Error releasing escrow payout:', err);
      alert('Failed to release escrow payout.');
    } finally {
      setReleasingId(null);
    }
  };

  const totalVolume = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPlatformFees = payments.reduce((sum, p) => sum + (p.platformFee || 0), 0);
  const totalPayouts = payments.reduce((sum, p) => sum + (p.carrierPayout || 0), 0);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Admin Console</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Escrow Ledger & Commission Splits</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Audit carrier payouts, holding assets, and platform 5% commission splits.</p>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Platform Gross Volume', value: totalVolume, color: 'text-gray-900', bg: 'bg-white', icon: IndianRupee, iconColor: 'text-[#16a34a]' },
          { label: 'SaaS Platform Revenue (5%)', value: totalPlatformFees, color: 'text-purple-600', bg: 'bg-purple-50/40', icon: Shield, iconColor: 'text-purple-500' },
          { label: 'Net Carrier Payouts (95%)', value: totalPayouts, color: 'text-blue-600', bg: 'bg-blue-50/40', icon: CheckCircle, iconColor: 'text-blue-500' }
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center space-x-4 ${card.bg}`}>
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              <div>
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{card.label}</span>
                <span className={`text-[18px] font-black mt-0.5 block ${card.color}`}>{formatINR(card.value)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Transaction Table */}
      {loading ? (
        <div className="h-[30vh] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : payments.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-[13px] font-black text-gray-900">Escrow Ledger Ledger</h2>
            <p className="text-[10px] text-gray-400 font-semibold">{payments.length} transactions processed</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-semibold text-gray-700">
              <thead>
                <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-5 py-3">Transaction ID</th>
                  <th className="px-5 py-3">Booking Ref</th>
                  <th className="px-5 py-3">Shipper / Carrier</th>
                  <th className="px-5 py-3">Total Amount</th>
                  <th className="px-5 py-3">Platform Fee (5%)</th>
                  <th className="px-5 py-3">Carrier Payout</th>
                  <th className="px-5 py-3">Escrow Status</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map(p => (
                  <tr key={p._id} className="hover:bg-green-50/20 transition-colors duration-100">
                    <td className="px-5 py-3.5 font-mono font-bold text-[#16a34a]">{p.transactionId}</td>
                    <td className="px-5 py-3.5 font-mono font-black text-gray-800">{p.bookingId}</td>
                    <td className="px-5 py-3.5">
                      <span className="block text-[10px] text-gray-600 font-bold">Shipper: {p.shipperId}</span>
                      <span className="block text-[9px] text-gray-400 font-bold mt-0.5">Carrier: {p.carrierId}</span>
                    </td>
                    <td className="px-5 py-3.5 font-black text-gray-900">{formatINR(p.amount)}</td>
                    <td className="px-5 py-3.5 text-red-500 font-bold">{formatINR(p.platformFee)}</td>
                    <td className="px-5 py-3.5 text-[#16a34a] font-bold">{formatINR(p.carrierPayout)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border inline-block ${
                        p.status === 'PaidOut' ? 'bg-green-50 text-green-700 border-green-200' :
                        p.status === 'Escrow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {p.status === 'PaidOut' ? 'Released' : p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {p.status === 'Escrow' ? (
                        <button
                          onClick={() => handleRelease(p._id)}
                          disabled={releasingId === p._id}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg border border-blue-200 text-[10px] font-bold cursor-pointer transition-all duration-150"
                        >
                          {releasingId === p._id ? 'Releasing...' : 'Release Funds'}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-[10px] font-bold">Payout Complete</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white p-6">
          <div className="text-center text-gray-400 max-w-sm text-[12px] font-semibold">
            <Info className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p>No billing transactions found in history.</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPayments;
