import React, { useContext } from 'react';
import { User, Building2, Mail, Phone, MapPin, ShieldCheck } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';

const CustomerProfileView = () => {
  const { user } = useContext(AuthContext);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
          <User className="w-6 h-6 text-emerald-600" />
          Customer / Shipper Account Profile
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your company credentials, default billing addresses, and operational notifications.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-4 border-b border-gray-100 pb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 font-black text-2xl flex items-center justify-center">
            {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900">{user?.username}</h3>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Shipper Account
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" /> Email Address
            </span>
            <p className="text-xs font-bold text-gray-900">{user?.email || 'shipper@logistics.com'}</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" /> Company Name
            </span>
            <p className="text-xs font-bold text-gray-900">{user?.companyName || 'Apex Freight Solutions Ltd'}</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" /> Contact Phone
            </span>
            <p className="text-xs font-bold text-gray-900">{user?.phone || '+91 98765 43210'}</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Billing Address
            </span>
            <p className="text-xs font-bold text-gray-900">{user?.address || 'Guindy Industrial Estate, Chennai, Tamil Nadu'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerProfileView;
