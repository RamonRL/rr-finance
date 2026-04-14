import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_URL } from './constants';

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [streamerMode, setStreamerMode] = useState(false);
  const toggleStreamerMode = useCallback(() => setStreamerMode(v => !v), []);

  const refreshAccounts = useCallback(() => {
    fetch(`${API_URL}/accounts`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAccounts(data);
          // Keep selected account in sync with fresh data
          setSelectedAccount(prev =>
            prev ? (data.find(a => a.id === prev.id) ?? data[0]) : (data.find(a => a.name === 'Personal') ?? data[0])
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => { refreshAccounts(); }, []);

  return (
    <AccountContext.Provider value={{ accounts, selectedAccount, setSelectedAccount, refreshAccounts, streamerMode, toggleStreamerMode }}>
      {children}
    </AccountContext.Provider>
  );
}

export const useAccount = () => useContext(AccountContext);
