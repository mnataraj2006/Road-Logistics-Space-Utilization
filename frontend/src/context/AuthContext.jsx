import React, { createContext, useState, useEffect } from 'react';
import api from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUserInfo = localStorage.getItem('userInfo');

      if (storedToken) {
        try {
          // Immediately set cached info to avoid flash of logged-out state
          if (storedUserInfo) {
            setUser(JSON.parse(storedUserInfo));
          }
          // Verify with authoritative backend /api/auth/me endpoint
          const { data } = await api.get('/auth/me');
          if (data && data.role) {
            const updatedUser = { ...data, token: storedToken };
            setUser(updatedUser);
            localStorage.setItem('userInfo', JSON.stringify(updatedUser));
          }
        } catch (err) {
          // If token is invalid or user was removed from DB (e.g. after db clean)
          console.warn('Session hydration failed or token expired:', err.message);
          setUser(null);
          localStorage.removeItem('userInfo');
          localStorage.removeItem('token');
        }
      } else {
        setUser(null);
        localStorage.removeItem('userInfo');
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/login', { username, password });
      setUser(data);
      localStorage.setItem('userInfo', JSON.stringify(data));
      if (data?.token) {
        localStorage.setItem('token', data.token);
      }
      setLoading(false);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please check credentials.');
      setLoading(false);
      return false;
    }
  };

  const googleLogin = async (idToken, additionalData = {}) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/auth/google', { idToken, ...additionalData });
      setUser(data);
      localStorage.setItem('userInfo', JSON.stringify(data));
      if (data?.token) {
        localStorage.setItem('token', data.token);
      }
      setLoading(false);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Google authentication failed.');
      setLoading(false);
      return false;
    }
  };

  const updateProfile = async (profileData) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.put('/auth/profile', profileData);
      setUser(data);
      localStorage.setItem('userInfo', JSON.stringify(data));
      if (data?.token) {
        localStorage.setItem('token', data.token);
      }
      setLoading(false);
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'Profile update failed.');
      setLoading(false);
      return false;
    }
  };

  const setAuthSession = (userData, token) => {
    const userPayload = userData?.user || userData;
    const finalToken = token || userData?.token;
    const combined = { ...userPayload, ...(finalToken ? { token: finalToken } : {}) };
    setUser(combined);
    localStorage.setItem('userInfo', JSON.stringify(combined));
    if (finalToken) {
      localStorage.setItem('token', finalToken);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('userInfo');
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, setAuthSession, loading, error, setError, login, googleLogin, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
