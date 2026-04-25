import React, { useState, useEffect, useCallback } from 'react';

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
  const [notification, setNotification] = useState(null);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}merchants/${MERCHANT_ID}/`);
      const data = await res.json();
      setMerchant(data);
      setBalance(data.balance_paise || 0);
      setHeldBalance(data.held_balance_paise || 0);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchPayouts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}payouts/?merchant_id=${MERCHANT_ID}`);
      const data = await res.json();
      setPayouts(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}transactions/?merchant_id=${MERCHANT_ID}`);
      const data = await res.json();
      setTransactions(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchBalance();
    fetchPayouts();
    fetchTransactions();
  }, [fetchBalance, fetchPayouts, fetchTransactions]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handlePayout = async (e) => {
    e.preventDefault();
    if (!amount || !bankAccount) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}payouts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
          merchant_id: MERCHANT_ID,
          amount_paise: parseInt(amount) * 100,
          bank_account_id: bankAccount
        })
      });

      if (res.ok) {
        setAmount('');
        setBankAccount('');
        showToast('Payout requested successfully!', 'success');
        refreshAll();
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

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-slate-800/50">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">
              Payout Dashboard
            </h1>
            <p className="text-slate-500 mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Connected to ledger for {merchant?.name || '...'}
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl backdrop-blur-xl">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1">Available</p>
              <p className="text-2xl font-mono font-bold text-white">₹{(balance / 100).toLocaleString()}</p>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl backdrop-blur-xl">
              <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1">On Hold</p>
              <p className="text-2xl font-mono font-bold text-indigo-400">₹{(heldBalance / 100).toLocaleString()}</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content: History */}
          <div className="lg:col-span-2 space-y-8">
            <section className="bg-slate-900/30 border border-slate-800/50 rounded-3xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                <h2 className="font-semibold text-slate-300">Payout History</h2>
                <button onClick={refreshAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-xs uppercase text-slate-500 border-b border-slate-800/50">
                      <th className="px-6 py-4 font-bold">Initiated</th>
                      <th className="px-6 py-4 font-bold">Amount</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/30">
                    {payouts.map(p => (
                      <tr key={p.id} className="hover:bg-indigo-500/5 transition-colors group">
                        <td className="px-6 py-4 text-xs font-mono text-slate-400">
                          {new Date(p.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-200">
                          ₹{(p.amount_paise / 100).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            p.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            p.status === 'failed' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                            'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Credits History */}
            <section className="bg-slate-900/30 border border-slate-800/50 rounded-3xl overflow-hidden shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/50">
                <h2 className="font-semibold text-slate-300">Recent Credits</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {transactions.filter(t => t.type === 'credit').slice(0, 5).map(t => (
                    <div key={t.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-800/20 border border-slate-800/50 hover:border-emerald-500/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-300">Merchant Credit</p>
                          <p className="text-[10px] text-slate-500 font-mono italic">{new Date(t.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <p className="font-mono font-bold text-emerald-500">+₹{(t.amount_paise / 100).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar: Request Payout */}
          <div className="space-y-8">
            <section className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-3xl shadow-2xl shadow-indigo-500/20 text-white relative overflow-hidden group">
              <div className="relative z-10">
                <h2 className="text-xl font-bold mb-6">Request Payout</h2>
                <form onSubmit={handlePayout} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-200">Amount (INR)</label>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all font-mono"
                      placeholder="0.00"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-200">Bank Account ID</label>
                    <input 
                      type="text" 
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all font-mono"
                      placeholder="HDFC0001234..."
                      required
                    />
                  </div>
                  <button 
                    disabled={loading}
                    className="w-full bg-white text-indigo-700 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group-hover:scale-[1.02]"
                  >
                    {loading ? 'Processing...' : 'Initiate Transfer'}
                  </button>
                </form>
              </div>
              <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/2 -translate-y-1/2">
                <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.75 14.82c-.39.18-.81.28-1.25.28-.56 0-1.09-.17-1.53-.47l-4.43-3.11c-.44-.31-.69-.8-.69-1.32s.25-1.01.69-1.32l4.43-3.11c.44-.3 1-.47 1.53-.47.44 0 .86.1 1.25.28V16.82z" /></svg>
              </div>
            </section>

            <section className="bg-slate-900/30 border border-slate-800/50 p-6 rounded-3xl">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Security Notice</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                All payouts are processed using idempotent hash-keys for network safety. 
                Funds are held in escrow until bank settlement is finalized.
              </p>
            </section>
          </div>

        </div>
      </div>

      {/* Toast Notifications */}
      {notification && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-2xl text-white transform transition-all duration-300 animate-bounce cursor-pointer ${
          notification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
        }`} onClick={() => setNotification(null)}>
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