import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { GoogleLogin } from '@react-oauth/google';
import {
  Lock, User, AlertCircle,
  Truck, RotateCw, ArrowRight,
  BarChart3, Zap, Globe, Shield
} from 'lucide-react';

const NAV_LINKS = ['Platform', 'Carriers', 'Shippers', 'Analytics', 'Pricing'];

const FEATURES = [
  { icon: Zap,       text: 'Dynamic Optimization' },
  { icon: Globe,     text: 'Multi-Stop Corridors' },
  { icon: BarChart3, text: 'Space Analytics' },
  { icon: Shield,    text: 'Escrow Settlements' },
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, user, error, setError, googleLogin } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isGoogleAuthConfigured = !!googleClientId && googleClientId !== 'dummy-google-client-id';

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError(null);
    const success = await googleLogin(credentialResponse.credential);
    setLoading(false);
    if (success) navigate('/');
  };

  const handleGoogleError = () => {
    setError('Google Sign-In failed. Please check configuration.');
  };

  useEffect(() => {
    setError(null);
    if (user) navigate('/');
  }, [user, navigate, setError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(username.trim(), password);
    setLoading(false);
    if (ok) navigate('/');
  };

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
          <Link to="/signup" className="no-underline flex items-center space-x-1.5 px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white text-[12px] font-black rounded-full shadow-md shadow-green-600/20 transition-all duration-150">
            <span>Register Account</span>
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

          <p className="text-gray-500 text-[13px] font-medium leading-relaxed max-w-md mb-8">
            Intelligent. Powerful. Reliable. Cargolytics connects logistics managers and customer shippers with real-time multi-stop truck space optimization, physical load planning, and automated lifecycle dispatch.
          </p>

          <div className="flex flex-wrap gap-2.5">
            {FEATURES.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-200 rounded-full shadow-xs">
                <Icon className="w-3.5 h-3.5 text-[#16a34a]" />
                <span className="text-[11px] font-bold text-gray-700">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT — Login Card */}
        <aside className="lg:w-[42%] flex items-center justify-start px-4 sm:px-8 xl:px-12 py-6 relative overflow-hidden">
          <div className="hidden lg:block absolute inset-0 bg-gradient-to-bl from-gray-100/80 to-transparent pointer-events-none" />
          <div className="hidden lg:block absolute top-8 right-8 w-64 h-64 rounded-full bg-green-50 blur-3xl opacity-70 pointer-events-none" />

          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl shadow-gray-200/60 border border-gray-100 p-8 z-10">
            <div className="absolute top-0 left-8 right-8 h-[3px] bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] rounded-b-full" />

            <div className="mb-6">
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                Sign In
              </h2>
              <p className="text-xs text-gray-400 font-semibold mt-1">
                Access your Cargolytics logistics account
              </p>
            </div>

            {isGoogleAuthConfigured && (
              <>
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

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-[9px] font-black text-[#16a34a] uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              </>
            )}

            {error && (
              <div className="mb-4 flex items-start space-x-2.5 bg-red-50 border border-red-100 p-3 rounded-xl text-red-600 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Username or Email</label>
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    placeholder="Enter your username or email…"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 placeholder-gray-400 text-xs font-semibold transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-[#16a34a] transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="Enter your password…"
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-900 placeholder-gray-400 text-xs font-semibold transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-200 text-white font-black rounded-xl text-xs shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transform hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 cursor-pointer border-none flex items-center justify-center space-x-2"
              >
                {loading
                  ? <><RotateCw className="w-4 h-4 animate-spin" /><span>Authenticating…</span></>
                  : <><span>ACCESS PLATFORM</span><ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-gray-100 space-y-2 text-center">
              <p className="text-xs text-gray-500 font-medium">
                Shipper / Consignor?{' '}
                <Link to="/signup" className="text-[#16a34a] font-bold hover:underline">
                  Create Customer Account
                </Link>
              </p>
              <p className="text-xs text-gray-500 font-medium">
                Fleet & Logistics Operator?{' '}
                <Link to="/register-logistics-company" className="text-slate-900 font-bold hover:underline">
                  Register Logistics Company
                </Link>
              </p>
            </div>

            <p className="text-center text-[10px] text-gray-400 font-semibold mt-6">
              © 2026 Cargolytics · Road Logistics Space Utilization
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default Login;
