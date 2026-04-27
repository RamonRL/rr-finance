import React, { useState, useEffect } from 'react';
import { API_URL } from '../constants';
import { useAccount } from '../AccountContext';
import {
  AccountIcon,
  IconClose,
  IconPlus,
  IconArrowRight,
  IconArrowLeft,
  IconArrowLeftRight,
  IconPencil,
  IconTrash,
} from '../components/icons';

const now = new Date();
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const EXPENSE_CATEGORIES = ['Housing','Food & Groceries','Transport','Health','Entertainment','Shopping','Utilities','Subscriptions','Travel','Music','Fuel','Bizum','Gambling','Investments','Common','Other'];
const INCOME_CATEGORIES = ['Salary','Investment','Gift','Refund','Bizum','Gambling','Common','Other'];
const ALL_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];

const fmt = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

const emptyForm = {
  date: now.toISOString().split('T')[0],
  description: '',
  amount: '',
  type: 'expense',
  category: 'Food & Groceries',
  notes: '',
};

const emptyTransfer = {
  date: now.toISOString().split('T')[0],
  to_account_id: '',
  amount: '',
  notes: '',
};

const PAGE_SIZES = [25, 50, 100];

const inputCls = 'bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 w-full';
const labelCls = 'text-xs text-secondary';

export default function TransactionsPage() {
  const { accounts, selectedAccount } = useAccount();
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [transferForm, setTransferForm] = useState(emptyTransfer);
  const [editId, setEditId] = useState(null);
  const [filterYM, setFilterYM] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [search, setSearch] = useState('');
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const categories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const otherAccounts = accounts.filter(a => a.id !== selectedAccount?.id);

  const fetchTransactions = () => {
    if (!selectedAccount) return;
    const params = new URLSearchParams();
    params.set('account_id', selectedAccount.id);
    if (filterYM) {
      const [y, m] = filterYM.split('-').map(Number);
      params.set('year', y);
      params.set('month', m);
    }
    if (filterType) params.set('type', filterType);
    if (filterCategory) params.set('category', filterCategory);
    if (search) params.set('search', search);
    fetch(`${API_URL}/transactions?${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setTransactions(data); })
      .catch(() => {});
  };

  const fetchTransfers = () => {
    if (!selectedAccount) return;
    fetch(`${API_URL}/transfers?account_id=${selectedAccount.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setTransfers(data); })
      .catch(() => {});
  };

  useEffect(() => {
    fetchTransactions();
    fetchTransfers();
    setPage(1);
  }, [filterYM, filterType, filterCategory, search, selectedAccount]);

  useEffect(() => {
    if (!selectedAccount) return;
    fetch(`${API_URL}/available-months?account_id=${selectedAccount.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setAvailableMonths(data); })
      .catch(() => {});
  }, [selectedAccount]);

  useEffect(() => {
    if (otherAccounts.length > 0 && !transferForm.to_account_id) {
      setTransferForm(prev => ({ ...prev, to_account_id: otherAccounts[0].id }));
    }
  }, [selectedAccount, accounts]);

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'type') next.category = value === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { ...form, amount: parseFloat(form.amount), notes: form.notes || null, account_id: selectedAccount.id };
    const res = await fetch(editId ? `${API_URL}/transactions/${editId}` : `${API_URL}/transactions`, {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    setForm(prev => ({ ...emptyForm, date: prev.date }));
    setEditId(null);
    fetchTransactions();
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_account_id: selectedAccount.id,
        to_account_id: parseInt(transferForm.to_account_id),
        amount: parseFloat(transferForm.amount),
        date: transferForm.date,
        notes: transferForm.notes || null,
      }),
    });
    if (!res.ok) return;
    setTransferForm({ ...emptyTransfer, to_account_id: otherAccounts[0]?.id ?? '' });
    setShowTransferForm(false);
    fetchTransfers();
  };

  const handleEdit = (tx) => {
    setForm({ date: tx.date, description: tx.description, amount: String(tx.amount), type: tx.type, category: tx.category, notes: tx.notes || '' });
    setEditId(tx.id);
    setShowTransferForm(false);
    setMobileFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    await fetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' });
    fetchTransactions();
  };

  const handleDeleteTransfer = async (id) => {
    await fetch(`${API_URL}/transfers/${id}`, { method: 'DELETE' });
    fetchTransfers();
  };

  // Unified list: merge transactions + transfers filtered by month/year, sorted by date desc
  const transferRows = transfers
    .filter(t => {
      if (!filterYM) return true;
      const [fy, fm] = filterYM.split('-').map(Number);
      const d = new Date(t.date + 'T00:00:00');
      return d.getFullYear() === fy && d.getMonth() + 1 === fm;
    })
    .map(t => ({ ...t, _kind: 'transfer' }));

  const unified = [...transactions.map(t => ({ ...t, _kind: 'tx' })), ...transferRows]
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalPages = Math.ceil(unified.length / pageSize);
  const paginated = unified.slice((page - 1) * pageSize, page * pageSize);

  const accountName = (id) => accounts.find(a => a.id === id)?.name ?? '?';
  const accountColor = (id) => accounts.find(a => a.id === id)?.color ?? '#7a95b2';

  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-5 md:h-full md:overflow-hidden p-3 md:p-6 overflow-y-auto">

      {/* LEFT COLUMN — form */}
      <div className="w-full md:w-72 md:flex-shrink-0 md:overflow-y-auto md:custom-scrollbar space-y-3 md:space-y-4 md:pb-4">
        {/* Mobile toggle button — hidden on desktop */}
        <button
          onClick={() => setMobileFormOpen(o => !o)}
          className="md:hidden w-full flex items-center justify-between px-4 py-3 bg-surface border border-white/10 rounded-xl text-sm font-semibold text-white hover:border-accent-green/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-accent-green leading-none">{mobileFormOpen ? <IconClose size={16} /> : <IconPlus size={16} />}</span>
            {editId ? 'Edit transaction' : 'New transaction'}
          </span>
          <span className="text-xs text-muted">{mobileFormOpen ? 'Close' : 'Tap to open'}</span>
        </button>

        <h2 className="hidden md:block text-xl font-bold text-white">{editId ? 'Edit transaction' : 'New transaction'}</h2>

        <div className={`${mobileFormOpen ? 'block' : 'hidden'} md:block bg-surface border border-white/10 rounded-xl p-4 md:p-5`}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Date</label>
              <input type="date" name="date" value={form.date} onChange={handleFormChange} required className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Type</label>
              <select name="type" value={form.type} onChange={handleFormChange} className={inputCls}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Description</label>
              <input type="text" name="description" value={form.description} onChange={handleFormChange} required
                placeholder="e.g. Supermarket Mercadona" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Amount (€)</label>
              <input type="number" name="amount" value={form.amount} onChange={handleFormChange}
                required min="0.01" step="0.01" placeholder="0.00" className={inputCls} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Category</label>
              <select name="category" value={form.category} onChange={handleFormChange} className={inputCls}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Notes (optional)</label>
              <input type="text" name="notes" value={form.notes} onChange={handleFormChange}
                placeholder="Optional notes..." className={inputCls} />
            </div>
            <div className="flex gap-2 pt-1">
              {editId && (
                <button type="button" onClick={() => { setForm(prev => ({ ...emptyForm, date: prev.date })); setEditId(null); }}
                  className="flex-1 px-4 py-2 text-sm text-secondary hover:text-white border border-white/10 rounded-lg transition-colors">
                  Cancel
                </button>
              )}
              <button type="submit"
                className="flex-1 px-4 py-2 text-sm font-semibold bg-primary hover:bg-accent text-background rounded-lg transition-colors">
                {editId ? 'Save changes' : 'Add'}
              </button>
            </div>
          </form>
        </div>

        {/* Transfer */}
        <div className={`${mobileFormOpen ? 'block' : 'hidden'} md:block space-y-3`}>
          <button onClick={() => setShowTransferForm(p => !p)}
            className="w-full bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold text-sm font-semibold px-4 py-2 rounded-lg transition-colors border border-accent-gold/30 flex items-center justify-center gap-2">
            <IconArrowLeftRight size={16} /> {showTransferForm ? 'Cancel transfer' : 'New transfer'}
          </button>
          {showTransferForm && (
            <div className="bg-surface border border-accent-gold/20 rounded-xl p-4 md:p-5">
              <form onSubmit={handleTransferSubmit} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Date</label>
                  <input type="date" value={transferForm.date}
                    onChange={e => setTransferForm(p => ({ ...p, date: e.target.value }))} required
                    className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-gold/50 w-full" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>From</label>
                  <div className="bg-elevated border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-secondary flex items-center gap-2">
                    {selectedAccount && <AccountIcon name={selectedAccount.icon} size={14} />}
                    {selectedAccount?.name}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>To account</label>
                  <select value={transferForm.to_account_id}
                    onChange={e => setTransferForm(p => ({ ...p, to_account_id: e.target.value }))} required
                    className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-gold/50 w-full">
                    {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Amount (€)</label>
                  <input type="number" value={transferForm.amount}
                    onChange={e => setTransferForm(p => ({ ...p, amount: e.target.value }))}
                    required min="0.01" step="0.01" placeholder="0.00"
                    className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent-gold/50 w-full" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelCls}>Notes (optional)</label>
                  <input type="text" value={transferForm.notes}
                    onChange={e => setTransferForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes..."
                    className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent-gold/50 w-full" />
                </div>
                <button type="submit"
                  className="w-full px-4 py-2 text-sm font-semibold bg-accent-gold/20 hover:bg-accent-gold/30 text-accent-gold rounded-lg transition-colors border border-accent-gold/30">
                  Transfer
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN — history */}
      <div className="flex-1 flex flex-col md:overflow-hidden min-w-0">
        {/* Static header + filters */}
        <div className="md:flex-shrink-0 space-y-3 md:space-y-4 md:pb-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-bold text-white">History</h2>
            <span className="text-xs md:text-sm text-secondary">{unified.length} transactions</span>
          </div>

          {/* Filters */}
          <div className="bg-surface border border-white/10 rounded-xl p-3 md:p-4 grid grid-cols-2 md:flex md:flex-wrap gap-2 md:gap-3 md:items-center">
            <select value={filterYM} onChange={e => setFilterYM(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50">
              <option value="">All time</option>
              {availableMonths.map(m => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{m.label}</option>
              ))}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50">
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50">
              <option value="">All categories</option>
              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 col-span-2 md:flex-1 md:min-w-[120px]" />
          </div>
        </div>

        {/* Scrollable table + pagination */}
        <div className="md:flex-1 md:overflow-y-auto md:custom-scrollbar space-y-4 md:pb-4">

        {/* Table */}
        <div className="bg-surface border border-white/10 rounded-xl overflow-hidden">
          {unified.length === 0 ? (
            <div className="p-10 text-center text-muted">No transactions found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-white/[0.06] text-[10px] md:text-xs text-secondary uppercase tracking-widest">
                  <th className="px-2 md:px-4 py-2 md:py-3 text-left">Date</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-left">Description</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left">Category</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-right">Amount</th>
                  <th className="px-2 md:px-4 py-2 md:py-3 text-right w-10 md:w-auto"></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(row => {
                  if (row._kind === 'transfer') {
                    const isOut = row.from_account_id === selectedAccount?.id;
                    const otherId = isOut ? row.to_account_id : row.from_account_id;
                    return (
                      <tr key={`tr-${row.id}`} className="border-b border-white/[0.06] hover:bg-white/[0.06] transition-colors">
                        <td className="px-2 md:px-4 py-2 md:py-3 text-secondary text-xs md:text-sm whitespace-nowrap">{row.date}</td>
                        <td className="px-2 md:px-4 py-2 md:py-3 min-w-0">
                          <div className="flex flex-col md:flex-row md:items-center md:gap-2 min-w-0">
                            <span className="text-accent-gold font-medium text-xs md:text-sm truncate inline-flex items-center gap-1.5">
                              <IconArrowLeftRight size={14} /> Transfer
                            </span>
                            <span className="text-[10px] md:text-xs text-secondary truncate inline-flex items-center gap-1">
                              {isOut ? <IconArrowRight size={12} /> : <IconArrowLeft size={12} />}
                              <span style={{ color: accountColor(otherId) }}>{accountName(otherId)}</span>
                            </span>
                          </div>
                          {row.notes && <div className="text-[10px] md:text-xs text-muted truncate">({row.notes})</div>}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3">
                          <span className="text-xs px-2 py-1 rounded bg-accent-gold/10 text-accent-gold/70">Transfer</span>
                        </td>
                        <td className={`px-2 md:px-4 py-2 md:py-3 text-right font-semibold tabular-nums text-xs md:text-sm whitespace-nowrap ${isOut ? 'text-accent-gold' : 'text-accent-gold'}`}>
                          <span className="private">{isOut ? '-' : '+'}{fmt(row.amount)}</span>
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-right">
                          <button onClick={() => handleDeleteTransfer(row.id)}
                            aria-label="Delete"
                            className="text-accent-red/60 hover:text-accent-red transition-colors leading-none inline-flex items-center">
                            <span className="md:hidden"><IconTrash size={16} /></span>
                            <span className="hidden md:inline text-xs">Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`tx-${row.id}`} className="border-b border-white/[0.06] hover:bg-white/[0.06] transition-colors">
                      <td className="px-2 md:px-4 py-2 md:py-3 text-secondary text-xs md:text-sm whitespace-nowrap">{row.date}</td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-white min-w-0">
                        <div className="truncate text-xs md:text-sm">{row.description}</div>
                        <div className="md:hidden text-[10px] text-muted truncate">{row.category}{row.notes ? ` · ${row.notes}` : ''}</div>
                        {row.notes && <span className="hidden md:inline ml-2 text-xs text-muted">({row.notes})</span>}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded bg-white/[0.06] text-secondary">{row.category}</span>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-right font-semibold tabular-nums text-xs md:text-sm whitespace-nowrap">
                        <span className="private" style={{ color: row.type === 'income' ? '#00c896' : '#ff5c5c' }}>
                          {row.type === 'income' ? '+' : '-'}{fmt(row.amount)}
                        </span>
                      </td>
                      <td className="px-2 md:px-4 py-2 md:py-3 text-right whitespace-nowrap">
                        <button onClick={() => handleEdit(row)}
                          aria-label="Edit"
                          className="text-secondary hover:text-white mr-2 md:mr-3 transition-colors leading-none inline-flex items-center">
                          <span className="md:hidden"><IconPencil size={16} /></span>
                          <span className="hidden md:inline text-xs">Edit</span>
                        </button>
                        <button onClick={() => handleDelete(row.id)}
                          aria-label="Delete"
                          className="text-accent-red/60 hover:text-accent-red transition-colors leading-none inline-flex items-center">
                          <span className="md:hidden"><IconTrash size={16} /></span>
                          <span className="hidden md:inline text-xs">Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        </div>

        {/* Pagination — static footer */}
        <div className="md:flex-shrink-0 pt-3 flex items-center justify-between text-xs md:text-sm text-secondary">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-elevated border border-white/10 rounded-lg px-2 md:px-3 py-1.5 text-xs md:text-sm text-white focus:outline-none focus:border-primary/50"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / page</option>)}
          </select>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5 md:gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                aria-label="Previous page"
                className="px-2 md:px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 transition-colors inline-flex items-center"><IconArrowLeft size={14} /></button>
              <span>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                aria-label="Next page"
                className="px-2 md:px-3 py-1 rounded-lg border border-white/10 hover:border-white/20 disabled:opacity-30 transition-colors inline-flex items-center"><IconArrowRight size={14} /></button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
