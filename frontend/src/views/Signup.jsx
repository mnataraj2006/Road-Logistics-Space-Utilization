import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';
import { GoogleLogin } from '@react-oauth/google';
import {
  Lock, User, Mail, AlertCircle, Check,
  Truck, RotateCw, ArrowRight, Package,
  BarChart3, Zap, Globe, Shield, Eye, EyeOff
} from 'lucide-react';

const NAV_LINKS = ['Platform', 'Carriers', 'Shippers', 'Analytics', 'Pricing'];

const ROLE_OPTIONS = [
  { key: 'carrier', label: 'Carrier',  subtitle: 'Logistics Provider', desc: 'List fleet capacity and earn revenue.', icon: Truck,    color: 'from-green-500 to-emerald-600' },
  { key: 'shipper', label: 'Exporter', subtitle: 'Cargo Shipper',      desc: 'Search and book available truck space.', icon: Package, color: 'from-blue-500 to-indigo-600'   },
];

const STATS = [
  { value: '1,500+', label: 'Shipments'   },
  { value: '6',      label: 'Carriers'    },
  { value: '99.3%',  label: 'ML Price R²' },
  { value: '5',      label: 'Lanes'       },
];

const FEATURES = [
  { icon: Zap,       text: 'ML Forecasting'  },
  { icon: Globe,     text: 'Marketplace'     },
  { icon: BarChart3, text: 'Fleet Analytics' },
  { icon: Shield,    text: 'Escrow Payments' },
];

const Signup = () => {
  const [form, setForm] = useState({ 
    username: '', 
    email: '', 
    password: '', 
    confirmPassword: '', 
    role: 'carrier',
    companyName: '',
    phone: '',
    address: ''
  });
  const [showPw,  setShowPw]  = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { login, user, googleLogin } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setApiError('');
    localStorage.setItem('pendingGoogleRole', form.role); // Preserve role securely
    const success = await googleLogin(credentialResponse.credential, form.role);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  const handleGoogleError = () => {
    setApiError('Google Sign-Up failed. Please try again.');
  };

  useEffect(() => { if (user) navigate('/'); }, [user, navigate]);

  const set = (key) => (e) => {
    setForm(f => ({ ...f, [key]: e.target.value }));
    setFieldErrors(fe => ({ ...fe, [key]: '' }));
    setApiError('');
  };

  const validate = () => {
    const errs = {};
    if (!form.username.trim() || form.username.length < 3) errs.username = 'Min 3 characters.';
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Valid email required.';
    if (!form.password || form.password.length < 6) errs.password = 'Min 6 characters.';
    if (form.confirmPassword !== form.password) errs.confirmPassword = 'Passwords do not match.';
    if (!form.companyName.trim()) errs.companyName = 'Company name is required.';
    if (!form.phone.trim()) errs.phone = 'Phone number is required.';
    if (!form.address.trim()) errs.address = 'Address/Location is required.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setLoading(true);
    setApiError('');
    try {
      await api.post('/auth/register', { 
        username: form.username.trim(), 
        email: form.email.trim(), 
        password: form.password, 
        role: form.role,
        companyName: form.companyName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim()
      });
      const ok = await login(form.username.trim(), form.password);
      if (ok) navigate('/');
    } catch (err) {
      setApiError(err?.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (key) =>
    `w-full pl-9 pr-4 py-2 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 placeholder-gray-300 text-[12px] font-semibold transition-all duration-200 ${
      fieldErrors[key] ? 'border-red-300 bg-red-50' : 'border-gray-200 focus:border-[#16a34a]'
    }`;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#f8fafc' }}
    >

      {/* ── NAV ───────────────────────────────────────── */}
      <header className="shrink-0 w-full flex items-center justify-between px-8 sm:px-14 py-4 bg-white border-b border-gray-100 z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#16a34a] rounded-lg flex items-center justify-center shadow-md shadow-green-600/30">
            <Truck className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <span className="text-base font-black text-gray-900 tracking-tight block">Cargolytics</span>
            <span className="text-[8px] font-black text-[#16a34a] uppercase tracking-[0.18em] block">Road Logistics</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center space-x-6">
          {NAV_LINKS.map(l => (
            <span key={l} className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 cursor-pointer transition-colors">{l}</span>
          ))}
        </nav>

        <div className="flex items-center space-x-3">
          <Link to="/login" className="no-underline hidden sm:block text-[12px] font-bold text-gray-500 hover:text-gray-800 transition-colors">Sign In</Link>
          <div className="flex items-center space-x-1.5 px-4 py-2 bg-[#16a34a] text-white text-[12px] font-black rounded-full shadow-md shadow-green-600/20 cursor-default border-none">
            <span>Get Started</span><ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

        {/* LEFT — Hero */}
        <section className="flex-1 lg:w-[55%] flex flex-col justify-center px-8 sm:px-14 xl:px-20 relative overflow-hidden">
          <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-green-100 opacity-50 blur-3xl pointer-events-none" />

          <div className="flex items-center space-x-2 mb-3">
            <div className="h-[3px] w-6 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.2em]">Join the Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 leading-[0.95] tracking-tight mb-3">
            BUILD YOUR<br />LOGISTICS<br />
            <span className="text-[#16a34a]">NETWORK.</span>
          </h1>

          <p className="text-gray-500 text-[12px] font-medium leading-relaxed max-w-md mb-5">
            Register as a Carrier to list your fleet, or as an Exporter to discover and book available cargo space across active route lanes.
          </p>

          {/* Role preview cards */}
          <div className="grid grid-cols-2 gap-3 mb-5 max-w-md">
            {ROLE_OPTIONS.map(({ key, label, subtitle, desc, icon: Icon, color }) => (
              <div key={key} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center mb-2 shadow-sm`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="text-[11px] font-black text-gray-900">{label}</div>
                <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">{subtitle}</div>
                <p className="text-[10px] text-gray-500 font-medium leading-snug">{desc}</p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap gap-5 mb-4">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <div className="text-lg font-black text-gray-900">{value}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
                <Icon className="w-3 h-3 text-[#16a34a]" />
                <span className="text-[10px] font-bold text-gray-600">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT — Signup Card */}
        <aside className="lg:w-[45%] flex items-center justify-start px-2 sm:px-4 xl:px-6 py-4 relative overflow-hidden">
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-bl from-gray-100/80 to-transparent pointer-events-none" />
          <div className="hidden lg:block absolute top-8 right-8 w-64 h-64 rounded-full bg-green-50 blur-3xl opacity-70 pointer-events-none" />

          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-gray-200/60 border border-gray-100 p-6 z-10 max-h-[88vh] overflow-y-auto scrollbar-none">
            <div className="absolute top-0 left-8 right-8 h-[3px] bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] rounded-b-full" />

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <RotateCw className="w-8 h-8 text-[#16a34a] animate-spin" />
                <span className="text-[12px] font-black text-gray-500 uppercase tracking-widest">Connecting to Google...</span>
              </div>
            ) : (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-black text-gray-900 tracking-tight">Create Account</h2>
                    <p className="text-[11px] text-gray-400 font-semibold mt-0.5">Join Cargolytics as a Carrier or Exporter</p>
                  </div>
                </div>

                {/* Role Selector */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {ROLE_OPTIONS.map(({ key, label, icon: Icon }) => {
                    const active = form.role === key;
                    return (
                      <button key={key} type="button" onClick={() => setForm(f => ({ ...f, role: key }))}
                        className={`flex items-center space-x-2 p-2.5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                          active ? 'border-[#16a34a] bg-[#16a34a]' : 'border-gray-200 bg-gray-50 hover:border-green-200 hover:bg-green-50/50'
                        }`}>
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-white' : 'text-gray-400'}`} />
                        <span className={`text-[12px] font-black ${active ? 'text-white' : 'text-gray-800'}`}>{label}</span>
                        {active && <Check className="w-3 h-3 text-white ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mb-4 flex justify-center w-full">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    useOneTap
                    theme="outline"
                    shape="pill"
                    size="large"
                    width="328"
                  />
                </div>

                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">or register traditionally</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* API Error */}
                {apiError && (
                  <div className="mb-3 flex items-start space-x-2 bg-red-50 border border-red-100 p-2.5 rounded-xl text-red-600 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{apiError}</span>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-2.5">
                  {/* Username */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Username</label>
                    <div className="relative group">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                      <input type="text" value={form.username} onChange={set('username')} autoComplete="username" placeholder="Choose a unique username…" className={inputClass('username')} />
                    </div>
                    {fieldErrors.username && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.username}</p>}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Email Address</label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                      <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="your@email.com" className={inputClass('email')} />
                    </div>
                    {fieldErrors.email && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.email}</p>}
                  </div>

                  {/* Company Name */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Company Name</label>
                    <div className="relative group">
                      <input type="text" value={form.companyName} onChange={set('companyName')} placeholder="Your company name…" className={inputClass('companyName')} />
                    </div>
                    {fieldErrors.companyName && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.companyName}</p>}
                  </div>

                  {/* Contact Number */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Contact Number</label>
                    <div className="relative group">
                      <input type="text" value={form.phone} onChange={set('phone')} placeholder="+91 xxxxx xxxxx" className={inputClass('phone')} />
                    </div>
                    {fieldErrors.phone && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.phone}</p>}
                  </div>

                  {/* Address / Location */}
                  <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      {form.role === 'carrier' ? 'Base Location' : 'Business Address'}
                    </label>
                    <div className="relative group">
                      <input type="text" value={form.address} onChange={set('address')} placeholder={form.role === 'carrier' ? 'Office / operating base location...' : 'Office / business address...'} className={inputClass('address')} />
                    </div>
                    {fieldErrors.address && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.address}</p>}
                  </div>

                  {/* Password + Confirm side by side */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                        <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Min. 6…" className={`${inputClass('password')} pr-8`} />
                        <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer border-none bg-transparent p-0">
                          {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {fieldErrors.password && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.password}</p>}
                    </div>

                    <div>
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Confirm</label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                        <input type={showCpw ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Re-enter…" className={`${inputClass('confirmPassword')} pr-8`} />
                        <button type="button" onClick={() => setShowCpw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 cursor-pointer border-none bg-transparent p-0">
                          {showCpw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {fieldErrors.confirmPassword && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{fieldErrors.confirmPassword}</p>}
                    </div>
                  </div>

                  {/* Submit */}
                  <button type="submit" disabled={loading}
                    className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl text-[12px] shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer border-none flex items-center justify-center space-x-2 mt-1">
                    {loading
                      ? <><RotateCw className="w-3.5 h-3.5 animate-spin" /><span>Creating Account…</span></>
                      : <><span>CREATE ACCOUNT</span><ArrowRight className="w-3.5 h-3.5" /></>}
                  </button>
                </form>

                {/* Sign In link */}
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <p className="text-center text-[11px] text-gray-400 font-semibold">
                  Already have an account?{' '}
                  <Link to="/login" className="text-[#16a34a] font-black hover:underline">Sign In</Link>
                </p>

                <p className="text-center text-[9px] text-gray-300 font-semibold mt-4">
                  © 2026 Cargolytics · Road Logistics Intelligence
                </p>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Signup;
