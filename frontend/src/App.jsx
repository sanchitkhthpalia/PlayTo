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
            if (!res.ok) throw new Error('API unreachable');
            const data = await res.json();
            setMerchant(data);
            setBalance(data.balance_paise || 0);
            setHeldBalance(data.held_balance_paise || 0);
        } catch (err) { 
            console.error(err);
            if (err.message.includes('fetch')) showToast('Network Error: Check Internet/DNS', 'error');
        }
    }, []);

    const fetchPayouts = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}payouts/?merchant_id=${MERCHANT_ID}`);
            const data = await res.json();
            setPayouts(data);
        } catch (err) { console.error(err); }
    }, []);

    const fetchTransactions = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}transactions/?merchant_id=${MERCHANT_ID}`);
            const data = await res.json();
            setTransactions(data);
        } catch (err) { console.error(err); }
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
        
        const uuid = (typeof crypto.randomUUID === 'function') 
            ? crypto.randomUUID() 
            : Math.random().toString(36).substring(2) + Date.now().toString(36);

        try {
            const res = await fetch(`${API_BASE}payouts/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Idempotency-Key': uuid
                },
                body: JSON.stringify({
                    merchant_id: MERCHANT_ID,
                    amount_paise: Math.round(parseFloat(amount) * 100),
                    bank_account_id: bankAccount
                })
            });
            if (res.ok) {
                setAmount('');
                setBankAccount('');
                showToast('Payout requested successfully!');
                refreshAll();
            } else {
                const error = await res.json();
                showToast(error.error || "Payout failed", 'error');
            }
        } catch (err) {
            showToast('Network error: Unable to reach server', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0c] text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
            <div className="max-w-6xl mx-auto space-y-8">
                
                {/* Premium Header */}
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
                            <p className="text-2xl font-mono font-bold text-white">₹{(balance / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        </div>
                        <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-2xl backdrop-blur-xl">
                            <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-1">On Hold</p>
                            <p className="text-2xl font-mono font-bold text-indigo-400">₹{(heldBalance / 100).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    
                    <div className="lg:col-span-2 space-y-8">
                        {/* Payout History Section */}
                        <section className="bg-slate-900/30 border border-slate-800/50 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="px-6 py-4 border-b border-slate-800/50 flex justify-between items-center bg-slate-900/50">
                                <h2 className="font-semibold text-slate-300">Payout History</h2>
                                <button onClick={refreshAll} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Refresh</button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-xs uppercase text-slate-500 border-b border-slate-800/50 bg-slate-900/20">
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

                        {/* Recent Credits Section */}
                        <section className="bg-slate-900/30 border border-slate-800/50 rounded-3xl overflow-hidden shadow-2xl">
                            <div className="px-6 py-4 border-b border-slate-800/50 bg-slate-900/50 font-semibold text-slate-300">
                                Recent Credits
                            </div>
                            <div className="p-6 space-y-4">
                                {transactions.filter(t => t.type === 'credit').slice(0, 5).map(t => (
                                    <div key={t.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-800/20 border border-slate-800/50">
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
                                            </div>
                                            <p className="text-sm font-medium text-slate-300">Customer Payment</p>
                                        </div>
                                        <p className="font-mono font-bold text-emerald-500">+₹{(t.amount_paise / 100).toLocaleString()}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <aside className="space-y-8">
                        <section className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-8 rounded-3xl shadow-2xl shadow-indigo-500/20 text-white relative overflow-hidden group">
                            <h2 className="text-xl font-bold mb-6 relative z-10">Request Payout</h2>
                            <form onSubmit={handlePayout} className="space-y-6 relative z-10">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-200">Amount (INR)</label>
                                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all font-mono" placeholder="0.00" required />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-indigo-200">Bank Account</label>
                                    <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all font-mono" placeholder="HDFC0001234" required />
                                </div>
                                <button disabled={loading} className="w-full bg-white text-indigo-700 py-4 rounded-xl font-bold hover:bg-slate-100 transition-all shadow-xl disabled:opacity-50">
                                    {loading ? 'Processing...' : 'Initiate Transfer'}
                                </button>
                            </form>
                            <div className="absolute top-0 right-0 p-8 opacity-10 transform translate-x-1/2 -translate-y-1/2">
                                <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.75 14.82c-.39.18-.81.28-1.25.28-.56 0-1.09-.17-1.53-.47l-4.43-3.11c-.44-.31-.69-.8-.69-1.32s.25-1.01.69-1.32l4.43-3.11c.44-.3 1-.47 1.53-.47.44 0 .86.1 1.25.28V16.82z" /></svg>
                            </div>
                        </section>
                    </aside>

                </div>
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl text-white font-bold transform transition-all duration-300 animate-bounce cursor-pointer ${
                    notification.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                }`} onClick={() => setNotification(null)}>
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-1 rounded-full">
                            {notification.type === 'success' ? '✓' : '!'}
                        </div>
                        <span>{notification.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;