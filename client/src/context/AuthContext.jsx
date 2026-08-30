import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

/**
 * Auth context provider
 * Manages authentication state, login/logout, and user profile
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Fetch current user profile
      api.get('/auth/me')
        .then(({ data }) => {
          setUser(data.data.user);
        })
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('token');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  /**
   * Login with email and password
   * @param {string} email 
   * @param {string} password 
   */
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    const { token, user } = data.data;
    
    localStorage.setItem('token', token);
    setUser(user);
    
    return user;
  }, []);

  /**
   * Logout - clear token and user state
   */
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
