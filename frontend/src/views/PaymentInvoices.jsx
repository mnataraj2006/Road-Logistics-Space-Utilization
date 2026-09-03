import React, { useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { AuthContext } from '../context/AuthContext';
import { CreditCard, IndianRupee, Shield, CheckCircle, Info, Calendar } from 'lucide-react';

const formatINR = (value) => {
  if (value === undefined || value === null) return '₹0';
  return `₹${value.toLocaleString('en-IN')}`;
};

const PaymentInvoices = () => {
  const { user } = useContext(AuthContext);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get('/bookings/payments')
      .then(({ data }) => setPayments(data))
      .catch(err => console.error('Error fetching payments ledger:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isManager = ['logistics_manager', 'admin'].includes(user?.role);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
          <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">
            {isManager ? 'Manager Operations' : 'Customer Portal'}
          </span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
          {isManager ? 'Earnings & Payout Ledger' : 'Payment Invoices & Escrow Ledger'}
        </h1>
        <p className="text-[12px] text-gray-400 font-semibold mt-0.5">
          Platform commission splits, escrow release statuses, and carrier payouts.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            icon: IndianRupee,
            label: 'Total Paid',
            value: formatINR(payments.reduce((s, p) => s + (p.amount || 0), 0)),
            iconBg: 'bg-green-50', iconColor: 'text-[#16a34a]',
          },
          {
            icon: Shield,
            label: 'Platform Fees (5%)',
            value: formatINR(payments.reduce((s, p) => s + (p.platformFee || 0), 0)),
            iconBg: 'bg-red-50', iconColor: 'text-red-500',
          },
          {
            icon: CheckCircle,
            label: 'Carrier Payouts (95%)',
            value: formatINR(payments.reduce((s, p) => s + (p.carrierPayout || 0), 0)),
            iconBg: 'bg-blue-50', iconColor: 'text-blue-600',
          },
        ].map(({ icon: Icon, label, value, iconBg, iconColor }) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center space-x-4">
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
              <p className="text-[17px] font-black text-gray-900 mt-0.5">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      {payments.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h2 className="text-[13px] font-black text-gray-900">Transaction Ledger</h2>
            <p className="text-[10px] text-gray-400 font-semibold">{payments.length} records</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-semibold text-gray-700">
              <thead>
                <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-5 py-3">Transaction ID</th>
                  <th className="px-5 py-3">Booking Ref.</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Total Amount</th>
                  <th className="px-5 py-3">Platform Fee (5%)</th>
                  <th className="px-5 py-3">Carrier Payout (95%)</th>
                  <th className="px-5 py-3">Parties</th>
                  <th className="px-5 py-3 text-center">Escrow Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-green-50/20 transition-colors duration-100">
                    <td className="px-5 py-3.5 font-mono font-bold text-[#16a34a] text-[10px]">{p.transactionId}</td>
                    <td className="px-5 py-3.5 font-mono font-black text-gray-800">{p.bookingId}</td>
                    <td className="px-5 py-3.5 text-gray-400 font-medium">
                      {new Date(p.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5 font-black text-gray-900">{formatINR(p.amount)}</td>
                    <td className="px-5 py-3.5 font-bold text-red-500">{formatINR(p.platformFee)}</td>
                    <td className="px-5 py-3.5 font-bold text-[#16a34a]">{formatINR(p.carrierPayout)}</td>
                    <td className="px-5 py-3.5">
                      <span className="block text-[10px] text-gray-600 font-bold">Shipper: {p.shipperId}</span>
                      <span className="block text-[9px] text-gray-400 font-bold mt-0.5">Carrier: {p.carrierId}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border inline-block ${
                        p.status === 'PaidOut'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : p.status === 'Escrow'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {p.status === 'PaidOut' ? 'Released' : p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-[240px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white p-6">
          <div className="text-center text-gray-400 max-w-sm text-[12px] font-semibold">
            <Info className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p className="leading-relaxed">No billing transactions recorded in the ledger history yet.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentInvoices;
