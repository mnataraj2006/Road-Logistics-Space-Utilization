import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  Users, UserPlus, Trash2, Shield,
  CheckCircle, AlertCircle, X, Search, Info, RotateCw
} from 'lucide-react';

const inputCls = 'w-full bg-gray-50 border border-gray-200 px-3 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold';

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Search and Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  // Add User Modal Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('shipper');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
      setSummary(data.summary);
    } catch (err) {
      console.error('Error fetching system users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');

    try {
      await api.post('/auth/register', { username, email, password, role });
      setFormSuccess(`User ${username} registered successfully!`);
      // Reset form
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('shipper');
      // Refresh list
      fetchUsers();
      // Delay closing modal
      setTimeout(() => setShowAddModal(false), 1500);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to register user.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'All' || u.role === roleFilter.toLowerCase();
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <div className="h-[3px] w-5 bg-[#16a34a] rounded-full" />
            <span className="text-[10px] font-black text-[#16a34a] uppercase tracking-[0.18em]">Admin Console</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">User Directory</h1>
          <p className="text-[12px] text-gray-400 font-semibold mt-0.5">Manage credentials, permissions, and roles for platform tenants.</p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-4 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl text-[12px] font-bold transition-all duration-150 shadow-md shadow-green-600/20 cursor-pointer border-none"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Tenant</span>
        </button>
      </div>

      {/* Summary Chips */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Total Accounts', value: summary.total, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Customer Accounts', value: summary.customers ?? summary.shippers, color: 'text-blue-600', bg: 'bg-blue-50/50' },
            { label: 'Logistics Manager Accounts', value: summary.managers ?? summary.carriers, color: 'text-emerald-700', bg: 'bg-emerald-50/50' }
          ].map(c => (
            <div key={c.label} className={`rounded-xl border border-gray-100 p-4 shadow-sm ${c.bg}`}>
              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">{c.label}</span>
              <span className={`text-[20px] font-black mt-1 block ${c.color}`}>{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by username or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 pl-9 pr-4 py-2.5 rounded-xl focus:border-[#16a34a] focus:ring-2 focus:ring-[#16a34a]/10 focus:outline-none text-gray-800 text-[12px] font-semibold"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-gray-100 p-1 rounded-xl text-[11px] font-bold">
          {['All', 'Customer', 'Logistics Manager'].map(role => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer border-none ${
                roleFilter === role
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 bg-transparent'
              }`}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {/* User Directory Table */}
      {loading ? (
        <div className="h-[30vh] flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-[#16a34a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredUsers.length > 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[11px] font-semibold text-gray-700">
              <thead>
                <tr className="bg-gray-50/80 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="px-5 py-3">User Details</th>
                  <th className="px-5 py-3">Email Address</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map(u => {
                  const handleDeleteUser = async () => {
                    if (u.role === 'admin' && users.filter(usr => usr.role === 'admin').length <= 1) {
                      alert('Cannot delete the last administrator account.');
                      return;
                    }
                    if (!window.confirm(`Delete user account "${u.username}"?`)) return;
                    try {
                      await api.delete(`/auth/users/${u._id}`);
                      fetchUsers();
                    } catch (err) {
                      console.error('Delete user error:', err);
                    }
                  };

                  return (
                    <tr key={u._id} className="hover:bg-green-50/20 transition-colors duration-100">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 font-bold uppercase">
                            {u.username.slice(0, 2)}
                          </div>
                          <span className="font-bold text-gray-800 text-[12px]">{u.username}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-gray-500 font-bold">{u.email}</td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border inline-block ${
                          u.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          u.role === 'carrier' ? 'bg-green-50 text-green-700 border-green-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-emerald-600 font-bold">
                        <span className="flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span>Active</span>
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <button
                          onClick={handleDeleteUser}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 text-[10px] font-black cursor-pointer transition-colors duration-100"
                        >
                          Delete Account
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl bg-white p-6">
          <div className="text-center text-gray-400 max-w-sm text-[12px] font-semibold">
            <Info className="w-8 h-8 mx-auto mb-3 text-gray-300" />
            <p>No matching user account records found.</p>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md p-6 rounded-2xl shadow-2xl border border-gray-100">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-[15px] font-black text-gray-900">Add Platform Tenant</h2>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer border-none">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {formError && <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-2 rounded-xl mb-4">{formError}</div>}
            {formSuccess && <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-4 py-2 rounded-xl mb-4">{formSuccess}</div>}

            <form onSubmit={handleAddUser} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required className={inputCls} />
              </div>
              
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className={inputCls} />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Initial Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required className={inputCls} />
              </div>

              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Platform Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
                  <option value="customer">Customer / Shipper</option>
                  <option value="logistics_manager">Logistics Manager (Fleet Operator)</option>
                </select>
              </div>

              <button type="submit" disabled={submitting} className="w-full bg-[#16a34a] hover:bg-[#15803d] py-3 rounded-xl font-black text-white shadow-md cursor-pointer mt-1 border-none text-[12px]">
                {submitting ? 'Registering...' : 'Add Tenant'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminUsers;
