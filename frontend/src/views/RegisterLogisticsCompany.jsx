import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import {
  Building2,
  ShieldCheck,
  Truck,
  ArrowRight,
  Lock,
  Mail,
  User,
  Phone,
  MapPin,
  FileText,
  Globe,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Map,
  Clock,
  Sparkles
} from 'lucide-react';

const RegisterLogisticsCompany = () => {
  const { user, setUser, setAuthSession } = useContext(AuthContext);
  const navigate = useNavigate();

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleAuthConfigured = !!googleClientId && googleClientId !== 'dummy-google-client-id';

  const [form, setForm] = useState({
    // 1. Company Profile
    companyName: '',
    registrationNumber: '',
    companyEmail: '',
    companyPhone: '',
    address: '',
    city: '',
    state: '',
    country: 'India',

    // 2. Operating Profile
    operatingRegion: '',
    serviceCorridors: '',
    yearsInOperation: '3',
    website: '',
    description: '',

    // 3. Operations Contact
    operationsContactName: '',
    operationsPhone: '',
    operationsEmail: '',
    billingEmail: '',
    supportContact: '',

    // 4. Manager Account
    managerName: '',
    managerEmail: '',
    password: '',
    confirmPassword: '',

    // 5. Agreement
    agreeTerms: false
  });

  const [googleAuthData, setGoogleAuthData] = useState(null);
  const [googleVerifying, setGoogleVerifying] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [existingAccountWarning, setExistingAccountWarning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registeredOrg, setRegisteredOrg] = useState(null);

  useEffect(() => {
    if (user && !registeredOrg) {
      if (user.role === 'logistics_manager' || user.role === 'admin') {
        navigate('/manager/dashboard');
      } else {
        navigate('/customer/dashboard');
      }
    }
  }, [user, navigate, registeredOrg]);

  const handleChange = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
    setFieldErrors(prev => ({ ...prev, [field]: '' }));
    setApiError('');
    setExistingAccountWarning(null);
  };

  // ── Google OAuth Verification ─────────────────────────────
  const handleGoogleSuccess = async (credentialResponse) => {
    setGoogleVerifying(true);
    setApiError('');
    setExistingAccountWarning(null);

    try {
      const { data } = await api.post('/auth/verify-google-manager', {
        idToken: credentialResponse.credential
      });

      if (data && data.verified) {
        setGoogleAuthData({
          token: credentialResponse.credential,
          email: data.email,
          name: data.name,
          picture: data.picture,
          googleId: data.googleId
        });

        // Pre-fill manager fields with verified identity without overwriting company details
        setForm(prev => ({
          ...prev,
          managerName: prev.managerName || data.name || '',
          managerEmail: data.email || prev.managerEmail || '',
          operationsContactName: prev.operationsContactName || data.name || '',
          operationsEmail: prev.operationsEmail || data.email || ''
        }));
      }
    } catch (err) {
      console.error('Google verification error:', err);
      const respData = err.response?.data;
      if (respData?.code === 'EXISTING_CUSTOMER') {
        setExistingAccountWarning({
          type: 'customer',
          message: respData.message || 'This Google account is already registered as a Customer account.'
        });
      } else if (respData?.code === 'EXISTING_MANAGER') {
        setExistingAccountWarning({
          type: 'manager',
          message: respData.message || 'This account is already registered as a Logistics Manager.'
        });
      } else {
        setApiError(respData?.message || 'Google account verification failed. Please try again.');
      }
    } finally {
      setGoogleVerifying(false);
    }
  };

  const handleGoogleError = () => {
    setApiError('Google sign-in connection was closed or failed.');
  };

  // ── Form Validation ───────────────────────────────────────
  const validate = () => {
    const errs = {};

    // 1. Company Profile
    if (!form.companyName.trim()) errs.companyName = 'Company Legal Name is required.';
    if (!form.registrationNumber.trim()) errs.registrationNumber = 'Business Registration / GST Number is required.';
    if (!form.companyEmail.trim()) {
      errs.companyEmail = 'Company Official Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(form.companyEmail)) {
      errs.companyEmail = 'Invalid email address format.';
    }
    if (!form.companyPhone.trim()) errs.companyPhone = 'Company Phone / Dispatch Desk is required.';
    if (!form.address.trim()) errs.address = 'Headquarters / Terminal address is required.';
    if (!form.city.trim()) errs.city = 'City is required.';
    if (!form.state.trim()) errs.state = 'State is required.';
    if (!form.country.trim()) errs.country = 'Country is required.';

    // 2. Operating Profile
    if (!form.operatingRegion.trim()) errs.operatingRegion = 'Primary Operating Region is required.';

    // 3. Operations Contact
    if (!form.operationsContactName.trim()) errs.operationsContactName = 'Operations Contact Name is required.';
    if (!form.operationsPhone.trim()) errs.operationsPhone = 'Operations Phone is required.';
    if (!form.operationsEmail.trim()) {
      errs.operationsEmail = 'Operations Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(form.operationsEmail)) {
      errs.operationsEmail = 'Invalid email address format.';
    }

    // 4. Manager Account
    if (!form.managerName.trim()) errs.managerName = 'Manager Full Name is required.';
    if (!form.managerEmail.trim()) {
      errs.managerEmail = 'Manager Work Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(form.managerEmail)) {
      errs.managerEmail = 'Invalid work email format.';
    }

    if (!googleAuthData) {
      if (!form.password) {
        errs.password = 'Password is required.';
      } else if (form.password.length < 6) {
        errs.password = 'Password must be at least 6 characters.';
      }
      if (form.password !== form.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match.';
      }
    }

    // 5. Agreement
    if (!form.agreeTerms) {
      errs.agreeTerms = 'You must accept the Terms of Operation to register.';
    }

    return errs;
  };

  // ── Form Submission ───────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      window.scrollTo({ top: 180, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    setApiError('');
    setExistingAccountWarning(null);

    try {
      const payload = {
        companyName: form.companyName.trim(),
        registrationNumber: form.registrationNumber.trim(),
        companyEmail: form.companyEmail.trim().toLowerCase(),
        phone: form.companyPhone.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim() || 'India',
        operatingRegion: form.operatingRegion.trim(),
        serviceCorridors: form.serviceCorridors.split(',').map(s => s.trim()).filter(Boolean),
        yearsInOperation: Number(form.yearsInOperation) || 1,
        website: form.website.trim(),
        description: form.description.trim(),
        operationsContact: {
          name: form.operationsContactName.trim(),
          phone: form.operationsPhone.trim(),
          email: form.operationsEmail.trim().toLowerCase()
        },
        billingEmail: form.billingEmail.trim().toLowerCase() || form.companyEmail.trim().toLowerCase(),
        supportContact: form.supportContact.trim(),
        managerName: form.managerName.trim(),
        managerEmail: form.managerEmail.trim().toLowerCase(),
        username: form.managerEmail.trim().split('@')[0].replace(/[^a-zA-Z0-9]/g, '') || 'manager',
        ...(googleAuthData
          ? { googleCredential: googleAuthData.token, googleId: googleAuthData.googleId }
          : { password: form.password })
      };

      const { data } = await api.post('/auth/register-company', payload);

      if (data && data.token) {
        if (typeof setAuthSession === 'function') {
          setAuthSession(data.user || data, data.token);
        } else if (typeof setUser === 'function') {
          setUser(data.user || data);
          localStorage.setItem('userInfo', JSON.stringify(data.user || data));
          localStorage.setItem('token', data.token);
        }

        setRegisteredOrg({
          companyName: data.company?.name || data.organization?.name || form.companyName,
          managerName: data.user?.name || form.managerName,
          managerEmail: data.user?.email || form.managerEmail,
          organizationId: data.organizationId || data.organization?._id || data.company?._id
        });
      } else {
        setApiError('Registration was accepted by server, but session token was missing.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      const resp = err.response?.data;
      if (resp?.code === 'EXISTING_CUSTOMER') {
        setExistingAccountWarning({
          type: 'customer',
          message: resp.message
        });
      } else if (resp?.code === 'EXISTING_MANAGER') {
        setExistingAccountWarning({
          type: 'manager',
          message: resp.message
        });
      } else {
        setApiError(resp?.message || 'Company registration failed. Please review your entries.');
      }
      window.scrollTo({ top: 180, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  // ── Success State Screen ──────────────────────────────────
  if (registeredOrg) {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-between" style={{ fontFamily: "'Inter', sans-serif" }}>
        <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur-md px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#16a34a] to-[#22c55e] flex items-center justify-center text-white font-bold shadow-md shadow-green-600/20">
              <Truck size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Cargolytics <span className="text-[#16a34a] font-semibold text-xs tracking-wider uppercase px-2 py-0.5 rounded-full bg-green-50 border border-green-200">OPERATOR</span>
            </span>
          </div>
        </header>

        <main className="max-w-2xl w-full mx-auto px-4 py-12 text-center">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl p-8 md:p-12 space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles size={14} /> Organization Registered Successfully
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900">Welcome to Cargolytics</h1>
              <p className="text-slate-500 text-xs md:text-sm mt-1">
                Your logistics company and initial operations manager account have been activated on the network.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left space-y-3 text-xs md:text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Logistics Company:</span>
                <span className="font-bold text-slate-900">{registeredOrg.companyName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Operations Manager:</span>
                <span className="font-semibold text-slate-900">{registeredOrg.managerName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Authorized Account:</span>
                <span className="font-semibold text-slate-900">{registeredOrg.managerEmail}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Platform Role:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs uppercase">
                  Logistics Manager
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate('/manager/dashboard')}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] hover:from-green-600 hover:to-emerald-600 text-white font-bold text-sm shadow-lg shadow-green-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Open Manager Operations Console</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </main>

        <footer className="h-12 border-t border-slate-200 bg-white px-6 md:px-12 flex items-center justify-between text-xs text-slate-500">
          <div>© 2026 Cargolytics Multi-Tenant Logistics Platform. All rights reserved.</div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col justify-between" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="h-16 border-b border-slate-200 bg-white/90 backdrop-blur-md px-6 md:px-12 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#16a34a] to-[#22c55e] flex items-center justify-center shadow-md shadow-green-600/20 text-white font-bold">
            <Truck size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">
            Cargolytics <span className="text-[#16a34a] font-semibold text-xs tracking-wider uppercase px-2 py-0.5 rounded-full bg-green-50 border border-green-200">OPERATOR</span>
          </span>
        </Link>

        <div className="flex items-center gap-4 text-xs">
          <span className="text-slate-500 hidden sm:inline">Already registered?</span>
          <Link
            to="/login"
            className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold transition-colors"
          >
            Customer Signup
          </Link>
        </div>
      </header>

      {/* Main Registration Card */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 md:py-10">
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/50 overflow-hidden">
          {/* Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-[#0f172a] to-emerald-950 px-8 py-8 text-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-semibold uppercase tracking-wider mb-2">
                  <Building2 size={13} /> Logistics Carrier &amp; Fleet Operator Onboarding
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Register Your Logistics Company</h1>
                <p className="text-slate-300 text-xs md:text-sm mt-1.5 max-w-2xl leading-relaxed">
                  Join the Cargolytics logistics marketplace. Publish available capacity, manage your fleet, optimize truck loading, and receive customer bookings directly into your operations console.
                </p>
              </div>
              <div className="hidden lg:flex flex-col gap-1.5 bg-white/10 p-4 rounded-xl border border-white/10 text-xs text-slate-200 shrink-0">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <ShieldCheck size={16} /> Strict Multi-Tenant Isolation
                </div>
                <div>Your fleet, routes, and load plans are 100% private.</div>
              </div>
            </div>

            {/* Progress Indicator */}
            <div className="mt-6 pt-5 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <span className="w-5 h-5 rounded-full bg-emerald-500/30 border border-emerald-400/40 flex items-center justify-center text-[10px]">1</span>
                <span>Company Profile</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">2</span>
                <span>Operating Profile</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">3</span>
                <span>Operations Contact</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-5 h-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-[10px]">4</span>
                <span>Manager Account</span>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-8">
            {/* Top Google Sign-Up / Identity Option */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-5 text-center">
              <div className="max-w-md mx-auto space-y-3">
                <div className="text-xs font-semibold text-slate-600">
                  Speed up registration with verified manager credentials:
                </div>

                {googleAuthData ? (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-left flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {googleAuthData.picture ? (
                        <img src={googleAuthData.picture} alt="" className="w-10 h-10 rounded-full border border-emerald-300 shadow-xs" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">
                          {googleAuthData.name ? googleAuthData.name.charAt(0) : 'G'}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          <span>Google Account Verified</span>
                        </div>
                        <div className="text-xs text-slate-900 font-semibold">{googleAuthData.name}</div>
                        <div className="text-[11px] text-slate-500">{googleAuthData.email}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setGoogleAuthData(null)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    {isGoogleAuthConfigured ? (
                      <GoogleLogin
                        onSuccess={handleGoogleSuccess}
                        onError={handleGoogleError}
                        theme="outline"
                        shape="pill"
                        size="large"
                        text="continue_with"
                        width="320"
                      />
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        Google authentication is available on production domain.
                      </div>
                    )}
                  </div>
                )}

                {googleVerifying && (
                  <div className="text-xs text-emerald-600 font-medium flex items-center justify-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Google account identity...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Existing Account Notice / Warning Banner */}
            {existingAccountWarning && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs md:text-sm space-y-2">
                <div className="flex items-start gap-2 font-bold">
                  <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                  <span>Account Notification</span>
                </div>
                <p>{existingAccountWarning.message}</p>
                <div className="pt-1">
                  <Link
                    to="/login"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
                  >
                    <span>Go to Sign In</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            )}

            {/* General API Error */}
            {apiError && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs md:text-sm flex items-start gap-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-600" />
                <span>{apiError}</span>
              </div>
            )}

            {/* ── SECTION 1: Logistics Company Profile ────────── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm md:text-base border-b border-slate-100 pb-2">
                <Building2 size={18} className="text-[#16a34a]" />
                <span>1. Logistics Company Profile</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Legal Name *</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Apex Freight Logistics Pvt Ltd"
                      value={form.companyName}
                      onChange={handleChange('companyName')}
                      className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.companyName ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {fieldErrors.companyName && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.companyName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Business Registration / GST Number *</label>
                  <div className="relative">
                    <FileText size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. 33AABCU9603R1ZM / CIN-U60230"
                      value={form.registrationNumber}
                      onChange={handleChange('registrationNumber')}
                      className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.registrationNumber ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {fieldErrors.registrationNumber && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.registrationNumber}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Official Email *</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="email"
                      placeholder="ops@apexlogistics.com"
                      value={form.companyEmail}
                      onChange={handleChange('companyEmail')}
                      className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.companyEmail ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {fieldErrors.companyEmail && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.companyEmail}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Phone / Dispatch Desk *</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="+91 44 2800 0000"
                      value={form.companyPhone}
                      onChange={handleChange('companyPhone')}
                      className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.companyPhone ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {fieldErrors.companyPhone && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.companyPhone}</p>}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Headquarters / Terminal Address *</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Plot 42, Logistics Park, Guindy Industrial Estate"
                      value={form.address}
                      onChange={handleChange('address')}
                      className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.address ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {fieldErrors.address && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.address}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City &amp; State *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="City (e.g. Chennai) *"
                      value={form.city}
                      onChange={handleChange('city')}
                      className={`w-full px-3 py-2 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.city ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                    <input
                      type="text"
                      placeholder="State (e.g. Tamil Nadu) *"
                      value={form.state}
                      onChange={handleChange('state')}
                      className={`w-full px-3 py-2 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                        fieldErrors.state ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                      }`}
                    />
                  </div>
                  {(fieldErrors.city || fieldErrors.state) && (
                    <p className="text-red-500 text-[11px] mt-1">{fieldErrors.city || fieldErrors.state}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Country *</label>
                  <div className="relative">
                    <Globe size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={form.country}
                      onChange={handleChange('country')}
                      className="w-full pl-9 pr-3 py-2 text-xs md:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:border-[#16a34a] focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 2: Operating Profile ───────────────── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm md:text-base border-b border-slate-100 pb-2">
                <Briefcase size={18} className="text-[#16a34a]" />
                <span>2. Operating Profile</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Operating Region *</label>
                  <input
                    type="text"
                    placeholder="e.g. Tamil Nadu & Karnataka"
                    value={form.operatingRegion}
                    onChange={handleChange('operatingRegion')}
                    className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                      fieldErrors.operatingRegion ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                    }`}
                  />
                  {fieldErrors.operatingRegion && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.operatingRegion}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary Service Corridors (Optional)</label>
                  <div className="relative">
                    <Map size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. Chennai → Bangalore, Chennai → Coimbatore"
                      value={form.serviceCorridors}
                      onChange={handleChange('serviceCorridors')}
                      className="w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:border-[#16a34a] focus:bg-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Years in Operation</label>
                  <div className="relative">
                    <Clock size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 5"
                      value={form.yearsInOperation}
                      onChange={handleChange('yearsInOperation')}
                      className="w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:border-[#16a34a] focus:bg-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Company Website (Optional)</label>
                  <div className="relative">
                    <Globe size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      type="url"
                      placeholder="https://www.apexlogistics.com"
                      value={form.website}
                      onChange={handleChange('website')}
                      className="w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:border-[#16a34a] focus:bg-white outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ── SECTION 3: Operations Contact ──────────────── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm md:text-base border-b border-slate-100 pb-2">
                <Phone size={18} className="text-[#16a34a]" />
                <span>3. Operations &amp; Dispatch Desk Contact</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operations Contact Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={form.operationsContactName}
                    onChange={handleChange('operationsContactName')}
                    className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                      fieldErrors.operationsContactName ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                    }`}
                  />
                  {fieldErrors.operationsContactName && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.operationsContactName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operations Phone *</label>
                  <input
                    type="tel"
                    placeholder="+91 98400 12345"
                    value={form.operationsPhone}
                    onChange={handleChange('operationsPhone')}
                    className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                      fieldErrors.operationsPhone ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                    }`}
                  />
                  {fieldErrors.operationsPhone && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.operationsPhone}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Operations Email *</label>
                  <input
                    type="email"
                    placeholder="dispatch@apexlogistics.com"
                    value={form.operationsEmail}
                    onChange={handleChange('operationsEmail')}
                    className={`w-full px-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                      fieldErrors.operationsEmail ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                    }`}
                  />
                  {fieldErrors.operationsEmail && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.operationsEmail}</p>}
                </div>
              </div>
            </section>

            {/* ── SECTION 4: Initial Logistics Manager ───────── */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm md:text-base border-b border-slate-100 pb-2">
                <User size={18} className="text-[#16a34a]" />
                <span>4. Initial Logistics Manager (Account Administrator)</span>
              </div>

              {googleAuthData ? (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs md:text-sm space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Manager Identity Verified with Google OAuth</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div>
                      <span className="text-slate-500 font-medium">Manager Full Name:</span>
                      <div className="font-bold text-slate-900">{form.managerName || googleAuthData.name}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Verified Sign-In Email:</span>
                      <div className="font-bold text-slate-900">{form.managerEmail || googleAuthData.email}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-emerald-700 font-medium pt-1">
                    ✓ Password requirement waived for verified Google session.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Full Name *</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        placeholder="e.g. Rajesh Kumar"
                        value={form.managerName}
                        onChange={handleChange('managerName')}
                        className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                          fieldErrors.managerName ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                        }`}
                      />
                    </div>
                    {fieldErrors.managerName && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.managerName}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Work Email (Sign-In Username) *</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="email"
                        placeholder="rajesh@apexlogistics.com"
                        value={form.managerEmail}
                        onChange={handleChange('managerEmail')}
                        className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                          fieldErrors.managerEmail ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                        }`}
                      />
                    </div>
                    {fieldErrors.managerEmail && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.managerEmail}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Manager Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={form.password}
                        onChange={handleChange('password')}
                        className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                          fieldErrors.password ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                        }`}
                      />
                    </div>
                    {fieldErrors.password && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.password}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm Password *</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={form.confirmPassword}
                        onChange={handleChange('confirmPassword')}
                        className={`w-full pl-9 pr-3 py-2.5 text-xs md:text-sm rounded-xl border bg-slate-50 outline-none transition-all ${
                          fieldErrors.confirmPassword ? 'border-red-400 bg-red-50/50' : 'border-slate-200 focus:border-[#16a34a] focus:bg-white'
                        }`}
                      />
                    </div>
                    {fieldErrors.confirmPassword && <p className="text-red-500 text-[11px] mt-1">{fieldErrors.confirmPassword}</p>}
                  </div>
                </div>
              )}
            </section>

            {/* ── SECTION 5: Terms & Verification Agreement ─── */}
            <section className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={form.agreeTerms}
                  onChange={handleChange('agreeTerms')}
                  className="mt-1 w-4 h-4 rounded text-[#16a34a] focus:ring-emerald-500 border-slate-300 cursor-pointer"
                />
                <label htmlFor="agreeTerms" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                  I confirm that I am authorized to register this logistics company on Cargolytics and agree to the platform{' '}
                  <span className="text-[#16a34a] font-semibold underline">Terms of Operation</span> and{' '}
                  <span className="text-[#16a34a] font-semibold underline">Privacy Policy</span>.
                </label>
              </div>
              {fieldErrors.agreeTerms && <p className="text-red-500 text-[11px]">{fieldErrors.agreeTerms}</p>}

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px] flex items-center gap-2">
                <ShieldCheck size={16} className="text-slate-400 shrink-0" />
                <span>
                  Verification documents (GST Certificate, Transporter License) can be submitted in the Manager Console after registration.
                </span>
              </div>
            </section>

            {/* Submit Action */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                Logistics Manager console access is initialized immediately upon successful registration.
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-[#16a34a] to-[#22c55e] hover:from-green-600 hover:to-emerald-600 text-white font-bold text-sm shadow-lg shadow-green-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Registering Company...</span>
                  </>
                ) : (
                  <>
                    <span>Complete Registration &amp; Open Manager Console</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-slate-200 bg-white px-6 md:px-12 flex items-center justify-between text-xs text-slate-500">
        <div>© 2026 Cargolytics Multi-Tenant Logistics Platform. All rights reserved.</div>
        <div className="flex gap-4">
          <Link to="/signup" className="hover:text-slate-800 underline">Customer Account</Link>
          <Link to="/login" className="hover:text-slate-800 underline">Sign In</Link>
        </div>
      </footer>
    </div>
  );
};

export default RegisterLogisticsCompany;
