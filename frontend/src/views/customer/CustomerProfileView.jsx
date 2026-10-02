import React, { useState, useEffect, useContext } from 'react';
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  ShieldCheck,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Save,
  X,
  RefreshCw
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';

const CustomerProfileView = () => {
  const { user, updateProfile } = useContext(AuthContext);
  const [profile, setProfile] = useState(user || {});
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form fields
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const fetchLiveProfile = async () => {
    setFetching(true);
    try {
      const res = await api.get('/auth/me');
      const data = res.data;
      setProfile(data);
      setCompanyName(data.companyName || '');
      setPhone(data.phone || '');
      setAddress(data.address || '');
    } catch (err) {
      console.error('Error fetching profile:', err);
      // Fallback to auth context user
      if (user) {
        setProfile(user);
        setCompanyName(user.companyName || '');
        setPhone(user.phone || '');
        setAddress(user.address || '');
      }
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchLiveProfile();
  }, []);

  const handleStartEdit = () => {
    setCompanyName(profile.companyName || '');
    setPhone(profile.phone || '');
    setAddress(profile.address || '');
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setErrorMsg(null);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const success = await updateProfile({
        companyName: companyName.trim(),
        phone: phone.trim(),
        address: address.trim()
      });

      if (success) {
        setProfile((prev) => ({
          ...prev,
          companyName: companyName.trim(),
          phone: phone.trim(),
          address: address.trim()
        }));
        setSuccessMsg('Account profile successfully updated and persisted to database!');
        setIsEditing(false);
      } else {
        setErrorMsg('Failed to update profile. Please verify your details.');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <User className="w-6 h-6 text-emerald-600" />
            Customer / Shipper Account Profile
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your verified company credentials, contact information, and billing locations.
          </p>
        </div>

        {!isEditing && (
          <button
            onClick={handleStartEdit}
            disabled={fetching}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer disabled:opacity-60"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-xs font-semibold text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
        {/* User Badge Banner */}
        <div className="flex items-center gap-4 border-b border-gray-100 pb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 font-black text-2xl flex items-center justify-center">
            {profile.username ? profile.username.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-900">{profile.username}</h3>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 mt-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Verified Shipper Account
            </span>
          </div>
        </div>

        {isEditing ? (
          /* Edit Form */
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 block">Company Name</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Apex Global Logistics Pvt Ltd"
                  className="w-full text-xs font-medium border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 block">Contact Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full text-xs font-medium border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-bold text-gray-700 block">Official Business / Billing Address</label>
                <textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Plot No. 42, SIDCO Industrial Estate, Guindy, Chennai"
                  className="w-full text-xs font-medium border border-gray-200 rounded-xl p-3 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={loading}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5 transition"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5 transition disabled:opacity-60 shadow-xs"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        ) : (
          /* View Mode (Zero Mock Fallback Values) */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Email Address
              </span>
              <p className="text-xs font-bold text-gray-900 font-mono">{profile.email || '—'}</p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Company Name
              </span>
              <p className={`text-xs font-bold ${profile.companyName ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                {profile.companyName || 'Not specified (Click Edit Profile)'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Contact Phone
              </span>
              <p className={`text-xs font-bold ${profile.phone ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                {profile.phone || 'Not specified (Click Edit Profile)'}
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
              <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Billing Address
              </span>
              <p className={`text-xs font-bold ${profile.address ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                {profile.address || 'Not specified (Click Edit Profile)'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerProfileView;
