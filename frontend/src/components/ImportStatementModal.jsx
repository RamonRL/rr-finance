import { useState, useEffect, useMemo, useRef } from 'react';
import { API_URL } from '../constants';
import { IconClose, IconArrowLeft, IconArrowRight, IconCheck, IconTrash } from './icons';
import DescriptionInput from './DescriptionInput';

const EXPENSE_CATEGORIES = ['Housing','Food & Groceries','Transport','Health','Entertainment','Shopping','Utilities','Subscriptions','Travel','Music','Fuel','Bizum','Gambling','Investments','Common','Other'];
const INCOME_CATEGORIES = ['Salary','Investment','Gift','Refund','Bizum','Gambling','Common','Other'];

const fmtEur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const fmtDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const inputCls = 'bg-elevated border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 w-full';
const labelCls = 'text-xs text-secondary';

// A suggested category is only usable if it exists in the list for that type
const coerceCategory = (category, type) => {
  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.includes(category) ? category : '';
};

const draftFrom = (row) => ({
  date: row.date,
  description: row.description ?? '',
  amount: String(row.amount ?? ''),
  type: row.type,
  category: coerceCategory(row.category, row.type),
  notes: '',
});

export default function ImportStatementModal({
  accountId,
  accountName,
  onClose,
  onSaved,
  descriptions = [],
}) {
  const [phase, setPhase] = useState('upload');   // upload | review | done
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState({});   // row index -> created transaction id
  const [skipped, setSkipped] = useState({});

  const descRef = useRef(null);

  // Descriptions confirmed during this import, merged into the autocomplete
  // straight away so a long session keeps suggesting what you just typed.
  const [learned, setLearned] = useState([]);

  const allDescriptions = useMemo(() => {
    const byName = new Map();
    for (const s of [...descriptions, ...learned]) {
      const prev = byName.get(s.description);
      byName.set(s.description, prev
        ? { ...prev, count: prev.count + s.count }
        : { ...s });
    }
    return [...byName.values()].sort(
      (a, b) => b.count - a.count || a.description.localeCompare(b.description),
    );
  }, [descriptions, learned]);

  const queue = useMemo(
    () => (skipDuplicates ? rows.filter(r => !r.duplicate) : rows),
    [rows, skipDuplicates],
  );

  const current = queue[index] ?? null;
  const savedCount = Object.keys(savedIds).length;
  const skippedCount = Object.keys(skipped).length;

  // Load the draft whenever we land on a new row
  useEffect(() => {
    if (phase === 'review' && current) {
      setDraft(draftFrom(current));
      // Focus description: it is the field most likely to need a tweak
      setTimeout(() => descRef.current?.focus(), 0);
    }
  }, [phase, index, current?.date, current?.raw_description]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${API_URL}/import/statement?account_id=${accountId}`, {
        method: 'POST',
        body,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        setError(detail.detail || `Import failed (${res.status})`);
        return;
      }
      const data = await res.json();
      if (!data.rows?.length) {
        setError('No movements found in that file.');
        return;
      }
      setRows(data.rows);
      setMeta(data);
      setIndex(0);
      setPhase('summary');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const advance = () => {
    if (index + 1 >= queue.length) setPhase('done');
    else setIndex(i => i + 1);
  };

  const saveCurrent = async () => {
    if (!draft || saving) return;
    const amount = parseFloat(draft.amount);
    if (!draft.date || !draft.description.trim() || !amount || !draft.category) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: draft.date,
          description: draft.description.trim(),
          amount,
          type: draft.type,
          category: draft.category,
          notes: draft.notes || null,
          account_id: accountId,
        }),
      });
      if (!res.ok) {
        setError(`Could not save this movement (${res.status})`);
        return;
      }
      const created = await res.json();
      setSavedIds(prev => ({ ...prev, [index]: created.id }));
      setLearned(prev => [...prev, {
        description: draft.description.trim(),
        category: draft.category,
        type: draft.type,
        count: 1,
      }]);
      setError('');
      onSaved?.();
      advance();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const skipCurrent = () => {
    setSkipped(prev => ({ ...prev, [index]: true }));
    advance();
  };

  // Step back one row, deleting the transaction it created if there was one
  const goBack = async () => {
    if (index === 0) return;
    const prevIndex = index - 1;
    const txId = savedIds[prevIndex];
    if (txId) {
      await fetch(`${API_URL}/transactions/${txId}`, { method: 'DELETE' }).catch(() => {});
      setSavedIds(prev => {
        const next = { ...prev };
        delete next[prevIndex];
        return next;
      });
      onSaved?.();
    }
    setSkipped(prev => {
      const next = { ...prev };
      delete next[prevIndex];
      return next;
    });
    setIndex(prevIndex);
    setPhase('review');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && phase === 'review') {
      e.preventDefault();
      saveCurrent();
    }
  };

  const categories = draft?.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const canSave = draft && draft.date && draft.description.trim() && parseFloat(draft.amount) > 0 && draft.category;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-surface border border-white/10 rounded-2xl shadow-2xl my-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h2 className="text-white font-semibold">Import bank statement</h2>
            <p className="text-xs text-secondary">
              Sabadell .xls → <span className="text-white">{accountName}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-white transition-colors">
            <IconClose size={20} />
          </button>
        </div>

        {/* ── Upload ─────────────────────────────────────────────────────── */}
        {phase === 'upload' && (
          <div className="p-5 space-y-4">
            <p className="text-sm text-secondary">
              Export your movements from Banco Sabadell as <span className="text-white">.xls</span> and
              drop the file here. Nothing is saved until you review each movement.
            </p>
            <label className="block border border-dashed border-white/15 rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors">
              <input type="file" accept=".xls,.xlsx" className="hidden"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
              {file
                ? <span className="text-white text-sm">{file.name}</span>
                : <span className="text-muted text-sm">Click to choose a .xls file</span>}
            </label>
            {error && <p className="text-sm text-accent-red">{error}</p>}
            <button onClick={upload} disabled={!file || loading}
              className="w-full px-4 py-2.5 text-sm font-semibold bg-primary hover:bg-accent text-background rounded-lg transition-colors disabled:opacity-40">
              {loading ? 'Parsing…' : 'Parse statement'}
            </button>
          </div>
        )}

        {/* ── Summary before review ──────────────────────────────────────── */}
        {phase === 'summary' && meta && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Movements', value: meta.count },
                { label: 'From', value: fmtDate(meta.from) },
                { label: 'To', value: fmtDate(meta.to) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-elevated rounded-xl p-3 text-center">
                  <p className="text-[9px] text-muted uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-sm font-bold text-white tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            {meta.duplicates > 0 && (
              <label className="flex items-start gap-3 bg-accent-gold/[0.07] border border-accent-gold/25 rounded-xl p-3 cursor-pointer">
                <input type="checkbox" checked={skipDuplicates}
                  onChange={e => setSkipDuplicates(e.target.checked)} className="mt-0.5" />
                <span className="text-xs text-secondary">
                  <span className="text-accent-gold font-semibold">{meta.duplicates}</span> movements match
                  a transaction already in <span className="text-white">{accountName}</span> (same date, amount
                  and type). Skip them — handy when resuming an import you left halfway.
                </span>
              </label>
            )}

            <p className="text-xs text-muted">
              You will review {queue.length} movements one by one, oldest first. Each one is saved
              to the history the moment you confirm it, so you can stop whenever you like.
            </p>

            <div className="flex gap-2">
              <button onClick={() => setPhase('upload')}
                className="px-4 py-2.5 text-sm text-secondary hover:text-white border border-white/10 rounded-lg transition-colors">
                Back
              </button>
              <button onClick={() => setPhase('review')} disabled={queue.length === 0}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary hover:bg-accent text-background rounded-lg transition-colors disabled:opacity-40">
                Start review
              </button>
            </div>
          </div>
        )}

        {/* ── Review, one movement at a time ─────────────────────────────── */}
        {phase === 'review' && current && draft && (
          <div className="p-5 space-y-4" onKeyDown={onKeyDown}>

            {/* Progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary tabular-nums">{index + 1} / {queue.length}</span>
                <span className="text-muted tabular-nums">
                  <span className="text-accent-green">{savedCount} saved</span>
                  {skippedCount > 0 && <> · {skippedCount} skipped</>}
                </span>
              </div>
              <div className="h-1 bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all"
                  style={{ width: `${((index) / queue.length) * 100}%` }} />
              </div>
            </div>

            {/* Raw bank concept — the source of truth, never edited */}
            <div className="bg-elevated/60 rounded-lg px-3 py-2">
              <p className="text-[9px] text-muted uppercase tracking-widest mb-0.5">Bank concept</p>
              <p className="text-xs text-secondary break-words">{current.raw_description}</p>
            </div>

            {current.duplicate && (
              <p className="text-xs text-accent-gold bg-accent-gold/10 border border-accent-gold/25 rounded-lg px-3 py-2">
                A transaction with this date, amount and type already exists in {accountName}.
              </p>
            )}
            {!current.auto && (
              <p className="text-xs text-accent-blue bg-accent-blue/10 border border-accent-blue/25 rounded-lg px-3 py-2">
                No category could be guessed for this one — pick one below.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Date</label>
                <input type="date" value={draft.date}
                  onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Type</label>
                <select value={draft.type}
                  onChange={e => setDraft(d => ({
                    ...d,
                    type: e.target.value,
                    category: coerceCategory(d.category, e.target.value),
                  }))}
                  className={inputCls}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelCls}>Description</label>
              <DescriptionInput
                inputRef={descRef}
                value={draft.description}
                suggestions={allDescriptions}
                className={inputCls}
                onChange={v => setDraft(d => ({ ...d, description: v }))}
                onPick={s => setDraft(d => ({
                  ...d,
                  description: s.description,
                  // Reuse how this description is normally filed, but never
                  // overwrite a category that is already set.
                  category: d.category || coerceCategory(s.category, d.type),
                }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelCls}>Amount (€)</label>
                <input type="number" step="0.01" min="0.01" value={draft.amount}
                  onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelCls}>
                  Category {!draft.category && <span className="text-accent-blue">· required</span>}
                </label>
                <select value={draft.category}
                  onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
                  className={`${inputCls} ${!draft.category ? 'border-accent-blue/50' : ''}`}>
                  <option value="">— pick —</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelCls}>Notes (optional)</label>
              <input type="text" value={draft.notes}
                onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
                placeholder="Optional notes..." className={inputCls} />
            </div>

            {/* Amount preview */}
            <p className="text-center text-lg font-bold tabular-nums"
              style={{ color: draft.type === 'income' ? '#00c896' : '#ff5c5c' }}>
              {draft.type === 'income' ? '+' : '-'}{fmtEur(parseFloat(draft.amount) || 0)}
            </p>

            {error && <p className="text-sm text-accent-red">{error}</p>}

            <div className="flex gap-2">
              <button onClick={goBack} disabled={index === 0 || saving}
                title={savedIds[index - 1] ? 'Goes back and deletes the saved transaction' : 'Go back'}
                className="px-3 py-2.5 text-sm text-secondary hover:text-white border border-white/10 rounded-lg transition-colors disabled:opacity-30 inline-flex items-center">
                <IconArrowLeft size={16} />
              </button>
              <button onClick={skipCurrent} disabled={saving}
                className="px-4 py-2.5 text-sm text-secondary hover:text-white border border-white/10 rounded-lg transition-colors inline-flex items-center gap-1.5">
                <IconTrash size={14} /> Discard
              </button>
              <button onClick={saveCurrent} disabled={!canSave || saving}
                className="flex-1 px-4 py-2.5 text-sm font-semibold bg-primary hover:bg-accent text-background rounded-lg transition-colors disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                <IconCheck size={16} /> {saving ? 'Saving…' : 'Save & next'}
                <span className="hidden md:inline text-[10px] opacity-60">↵</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Done ───────────────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div className="p-8 text-center space-y-4">
            <p className="text-accent-green text-3xl font-bold tabular-nums">{savedCount}</p>
            <p className="text-sm text-secondary">
              transactions imported into {accountName}
              {skippedCount > 0 && <> · {skippedCount} discarded</>}
            </p>
            <div className="flex gap-2 justify-center pt-2">
              <button onClick={goBack}
                className="px-4 py-2.5 text-sm text-secondary hover:text-white border border-white/10 rounded-lg transition-colors inline-flex items-center gap-1.5">
                <IconArrowLeft size={16} /> Back to last one
              </button>
              <button onClick={onClose}
                className="px-6 py-2.5 text-sm font-semibold bg-primary hover:bg-accent text-background rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
