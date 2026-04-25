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
        } catch (err) { console.error(err); }
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

        // Fallback for random UUID if crypto isn't available
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
                    amount_paise: parseInt(amount) * 100,
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
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-900">
            <div className="max-w-6xl mx-auto space-y-8">
                <header className="flex justify-between items-end border-b pb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Playto Pay Dashboard</h1>
                        <p className="text-slate-500">Merchant: {merchant?.name || '...'}</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-white p-4 rounded shadow-sm border">
                            <p className="text-xs text-slate-500 uppercase font-bold">Available</p>
                            <p className="text-2xl font-mono">₹{(balance / 100).toFixed(2)}</p>
                        </div>
                        <div className="bg-white p-4 rounded shadow-sm border">
                            <p className="text-xs text-slate-500 uppercase font-bold">On Hold</p>
                            <p className="text-2xl font-mono text-blue-600">₹{(heldBalance / 100).toFixed(2)}</p>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-8">
                        {/* Payout Table */}
                        <section className="bg-white rounded border shadow-sm overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b font-bold">Payout History</div>
                            <table className="w-full text-left">
                                <thead className="text-xs bg-slate-50 text-slate-500 border-b">
                                    <tr>
                                        <th className="px-6 py-3">Date</th>
                                        <th className="px-6 py-3">Amount</th>
                                        <th className="px-6 py-3">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {payouts.map(p => (
                                        <tr key={p.id} className="text-sm">
                                            <td className="px-6 py-4">{new Date(p.created_at).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 font-mono">₹{(p.amount_paise / 100).toFixed(2)}</td>
                                            <td className="px-6 py-4 uppercase font-bold text-[10px]">
                                                <span className={p.status === 'completed' ? 'text-green-600' : p.status === 'failed' ? 'text-red-600' : 'text-blue-600'}>
                                                    {p.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        {/* Credits History */}
                        <section className="bg-white rounded border shadow-sm overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b font-bold">Recent Credits</div>
                            <div className="p-6 space-y-3">
                                {transactions.filter(t => t.type === 'credit').map(t => (
                                    <div key={t.id} className="flex justify-between text-sm border-b pb-2">
                                        <span>Customer Payment</span>
                                        <span className="text-green-600 font-mono">+₹{(t.amount_paise / 100).toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    <aside className="space-y-8">
                        <section className="bg-white p-6 rounded border shadow-sm">
                            <h2 className="font-bold mb-4">New Payout</h2>
                            <form onSubmit={handlePayout} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (INR)</label>
                                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full border rounded p-2" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Account ID</label>
                                    <input type="text" value={bankAccount} onChange={e => setBankAccount(e.target.value)} className="w-full border rounded p-2" required />
                                </div>
                                <button disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                                    {loading ? 'Processing...' : 'Request Payout'}
                                </button>
                            </form>
                        </section>
                    </aside>
                </div>
            </div>

            {/* Notification Toast */}
            {notification && (
                <div className={`fixed bottom-8 right-8 px-6 py-4 rounded shadow-lg text-white font-bold ${notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                    {notification.message}
                </div>
            )}
        </div>
    );
};

export default App;