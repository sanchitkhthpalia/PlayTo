import React, { useState, useEffect } from 'react';

const API_BASE = 'https://playto-production-d2c3.up.railway.app/api/v1/';
const MERCHANT_ID = 1;

const App = () => {
  const [merchant, setMerchant] = useState(null);
  const [balance, setBalance] = useState(0);
  const [heldBalance, setHeldBalance] = useState(0);
  const [payouts, setPayouts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null); // { message, type: 'success' | 'error' }

  // Show a toast and auto-hide it
  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        // Ensure no double slashes: API_BASE is /api/v1/
        const res = await fetch(`${API_BASE}merchants/${MERCHANT_ID}/`);
        if (!res.ok) throw new Error("Failed to load balance");
        const data = await res.json();
        setMerchant(data);
        setBalance(data.balance_paise);
        setHeldBalance(data.held_balance_paise);
      } catch (e) {
        console.error("Balance fetch failed", e);
      }
    };

    fetchBalance();
    fetchPayouts();
    fetchTransactions();

    // Poll every 10s to see updates from Celery workers (e.g. holds released)
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchPayouts();
  }, []);

  const fetchPayouts = async () => {
    try {
      const res = await fetch(`${API_BASE}payouts/?merchant_id=${MERCHANT_ID}`);
      const data = await res.json();
      setPayouts(data);
    } catch (e) {
      console.error("Payouts load failed", e);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Reusing the payouts endpoint or adding a new generic ledger one
      const res = await fetch(`${API_BASE}transactions/?merchant_id=${MERCHANT_ID}`);
      const data = await res.json();
      setTransactions(data);
    } catch (e) {
      console.error("Ledger load failed", e);
    }
  };

  const requestPayout = async (e) => {
    e.preventDefault();
    setLoading(true);

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch(`${API_BASE}payouts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          merchant_id: MERCHANT_ID,
          amount_paise: parseInt(amount) * 100, 
          bank_account_id: bankAccount,
        }),
      });

      if (res.ok) {
        setAmount('');
        setBankAccount('');
        showToast('Payout requested successfully!', 'success');
        fetchBalance();
        fetchPayouts();
        fetchTransactions();
      } else {
        const error = await res.json();
        showToast(error.error || "Payout failed", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!merchant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-400 font-mono animate-pulse">Connecting to ledger...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8 bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payout Portal</h1>
          <p className="text-sm text-gray-500 font-medium">Merchant Dashboard</p>
        </div>
        
        {/* Ledger Summary Box */}
        <div className="bg-gray-900 text-white p-6 rounded-lg shadow-sm flex space-x-12 items-center">
          <div>
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">Available</h3>
            <p className="text-2xl font-bold">₹{(balance / 100).toFixed(2)}</p>
          </div>
          <div className="border-l border-gray-700 pl-12">
            <h3 className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">On Hold</h3>
            <p className="text-2xl font-bold text-yellow-500">₹{(heldBalance / 100).toFixed(2)}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-700">Request Payout</h2>
          <form onSubmit={requestPayout} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Amount (Rupees)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="2000"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Bank Account ID</label>
              <input
                type="text"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                placeholder="IFSC12345678"
                required
              />
            </div>
            <button
              disabled={loading}
              className="w-full bg-indigo-600 text-white font-semibold py-2 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Processing..." : "Initiate Transfer"}
            </button>
          </form>
        </section>

        <div className="bg-indigo-50 p-6 rounded-lg border border-indigo-100 flex items-center justify-center">
          <p className="text-sm text-indigo-700 leading-relaxed text-center">
            Every payout is protected by 24h idempotency. <br/>
            Your funds are moved to a 'Hold' state instantly upon request.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="text-sm font-bold p-4 border-b border-gray-200 text-gray-500 uppercase tracking-wider">Recent Credits</h2>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {transactions.filter(t => t.type === 'credit').map(t => (
              <div key={t.id} className="p-4 flex justify-between items-center">
                <span className="text-xs text-gray-400 font-mono">{t.created_at.split('T')[0]}</span>
                <span className="text-sm font-bold text-green-600">+₹{(t.amount_paise / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <h2 className="text-sm font-bold p-4 border-b border-gray-200 text-gray-500 uppercase tracking-wider">Payout History</h2>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {payouts.map(p => (
              <div key={p.id} className="p-4 flex justify-between items-center">
                <div>
                  <p className="text-xs font-mono text-gray-400">{p.idempotency_key.slice(0, 8)}...</p>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase">{p.status}</p>
                </div>
                <span className="text-sm font-bold text-gray-800">₹{(p.amount_paise / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      {/* Toast Notifications */}
      {notification && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-2xl text-white transform transition-all duration-300 animate-bounce ${
          notification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`}>
          <div className="flex items-center space-x-3 text-sm font-medium">
            {notification.type === 'success' ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;