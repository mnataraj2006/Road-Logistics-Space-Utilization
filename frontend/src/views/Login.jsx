import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import {
  Lock, User, AlertCircle, Check,
  Truck, RotateCw, ArrowRight, Package,
  BarChart3, Zap, Globe, Shield
} from 'lucide-react';

const NAV_LINKS = ['Platform', 'Carriers', 'Shippers', 'Analytics', 'Pricing'];

const STATS = [
  { value: '1,500+', label: 'Shipments'  },
  { value: '99.3%',  label: 'ML Accuracy'},
  { value: '6',      label: 'Carriers'   },
  { value: '5',      label: 'Lanes'      },
];

const FEATURES = [
  { icon: Zap,       text: 'ML Forecasting'  },
  { icon: Globe,     text: 'Marketplace'     },
  { icon: BarChart3, text: 'Fleet Analytics' },
  { icon: Shield,    text: 'Escrow Payments' },
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password,  setPassword]  = useState('');
  const { login, user, error, setError, googleLogin } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const roles = [
    { key: 'admin',              label: 'Demo Admin',    desc: 'Log in as admin',       icon: BarChart3 },
    { key: 'carrier-safexpress', label: 'Demo Carrier',  desc: 'Log in as carrier',     icon: Truck },
    { key: 'shipper-apex',       label: 'Demo Exporter', desc: 'Log in as exporter',    icon: Package },
  ];

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError(null);
    const success = await googleLogin(credentialResponse.credential);
    setLoading(false);
    if (success) navigate('/');
  };

  const handleGoogleError = () => {
    setError('Google Sign-In failed. Please try again.');
  };

  useEffect(() => {
    setError(null);
    if (user) navigate('/');
  }, [user, navigate, setError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) navigate('/');
  };

  const pickRole = (key) => { setUsername(key); setPassword('admin123'); };

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
          <span className="hidden sm:block text-[12px] font-bold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer">Sign In</span>
          <Link to="/signup" className="no-underline flex items-center space-x-1.5 px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white text-[12px] font-black rounded-full shadow-md shadow-green-600/20 transition-all duration-150">
            <span>Get Started</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </header>

      {/* ── BODY ──────────────────────────────────────── */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

        {/* LEFT — Hero */}
        <section className="flex-1 lg:w-[58%] flex flex-col justify-center px-8 sm:px-14 xl:px-20 relative overflow-hidden">
          <div className="absolute -bottom-24 -left-24 w-[400px] h-[400px] rounded-full bg-green-100 opacity-50 blur-3xl pointer-events-none" />

          <div className="flex items-center space-x-2.5 mb-3">
            <div className="h-[3px] w-6 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.2em]">Road Logistics Platform</span>
          </div>

          <h1 className="text-4xl sm:text-5xl xl:text-[58px] font-black text-gray-900 leading-[0.95] tracking-tight mb-4">
            MOVE<br />FASTER.<br />
            <span className="text-[#16a34a]">SHIP<br />SMARTER.</span>
          </h1>

          <p className="text-gray-500 text-[13px] font-medium leading-relaxed max-w-md mb-6">
            Intelligent. Powerful. Reliable. Cargolytics connects carriers and exporters with real-time space utilization, ML-driven route intelligence, and escrow-secured bookings.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <button className="flex items-center space-x-2 px-5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white text-[12px] font-black rounded-full shadow-lg shadow-green-600/25 transition-all duration-150 cursor-pointer border-none">
              <span>EXPLORE PLATFORM</span><ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button className="flex items-center px-5 py-2.5 border-2 border-gray-300 hover:border-gray-400 bg-white text-gray-700 text-[12px] font-black rounded-full transition-all duration-150 cursor-pointer">
              LEARN MORE
            </button>
          </div>

          <div className="flex flex-wrap gap-6 mb-5">
            {STATS.map(({ value, label }) => (
              <div key={label}>
                <div className="text-xl font-black text-gray-900">{value}</div>
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
                <Icon className="w-3 h-3 text-[#16a34a]" />
                <span className="text-[10px] font-bold text-gray-600">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT — Login Card */}
        <aside className="lg:w-[42%] flex items-center justify-start px-2 sm:px-4 xl:px-6 py-6 relative overflow-hidden">
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-bl from-gray-100/80 to-transparent pointer-events-none" />
          <div className="hidden lg:block absolute top-8 right-8 w-64 h-64 rounded-full bg-green-50 blur-3xl opacity-70 pointer-events-none" />

          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-gray-200/60 border border-gray-100 p-7 z-10">
            <div className="absolute top-0 left-8 right-8 h-[3px] bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] rounded-b-full" />

            <div className="mb-1">
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                Sign In
              </h2>
              <p className="text-[11px] text-gray-400 font-semibold mt-0.5">
                Access your Cargolytics account
              </p>
            </div>

            <div className="mt-4 mb-2 flex justify-center w-full">
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

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[9px] font-black text-[#16a34a] uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <p className="text-center text-[11px] text-gray-400 font-semibold mb-5">
              New to Cargolytics?{' '}
              <Link to="/signup" className="text-[#16a34a] font-black hover:underline">Create an Account</Link>
            </p>

            {error && (
              <div className="mb-4 flex items-start space-x-2.5 bg-red-50 border border-red-100 p-3 rounded-xl text-red-600 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Username</label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="Enter username…"
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 placeholder-gray-300 text-[13px] font-semibold transition-all duration-200" />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter password…"
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 placeholder-gray-300 text-[13px] font-semibold transition-all duration-200" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl text-[12px] shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer border-none flex items-center justify-center space-x-2">
                {loading
                  ? <><RotateCw className="w-3.5 h-3.5 animate-spin" /><span>Authenticating…</span></>
                  : <><span>ACCESS PLATFORM</span><ArrowRight className="w-3.5 h-3.5" /></>}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Or Use Demo Accounts</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {roles.map(({ key, label, desc, icon: Icon }) => {
                const active = username === key;
                return (
                  <button key={key} type="button" onClick={() => pickRole(key)}
                    className={`relative w-full max-w-[160px] p-2.5 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                      active ? 'border-[#16a34a] bg-[#16a34a] shadow-md shadow-green-600/20' : 'border-gray-200 bg-gray-50 hover:border-green-300 hover:bg-green-50/40'
                    }`}>
                    {active && <div className="absolute top-1.5 right-1.5"><Check className="w-2.5 h-2.5 text-white/80" /></div>}
                    <Icon className={`w-3.5 h-3.5 mb-1 ${active ? 'text-white' : 'text-gray-400'}`} />
                    <span className={`text-[10px] font-black block leading-none ${active ? 'text-white' : 'text-gray-700'}`}>{label}</span>
                    <span className={`text-[8px] font-semibold block mt-0.5 ${active ? 'text-white/60' : 'text-gray-400'}`}>{desc}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-center text-[9px] text-gray-300 font-semibold mt-5">
              © 2026 Cargolytics · Road Logistics Intelligence
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Login;
