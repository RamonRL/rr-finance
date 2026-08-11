import { useState, useMemo, useRef, useEffect } from 'react';

const MAX_SUGGESTIONS = 8;

// Accent- and case-insensitive, so "nomina" finds "Nómina".
// ̀-ͯ is the combining-diacritics block NFD splits accents into.
const COMBINING_MARKS = /[̀-ͯ]/g;
const norm = (s) => (s ?? '').normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

/** Split a label around the matched query so it can be highlighted. */
const splitMatch = (label, query) => {
  if (!query) return [label, '', ''];
  const i = norm(label).indexOf(norm(query));
  if (i < 0) return [label, '', ''];
  return [label.slice(0, i), label.slice(i, i + query.length), label.slice(i + query.length)];
};

/**
 * Text input backed by a dropdown of descriptions already used in Transactions.
 * The list narrows as you type; picking one can also carry its usual category.
 *
 * Enter is only swallowed when a suggestion is highlighted, so callers that bind
 * Enter to their own action (e.g. "Save & next") keep working.
 */
export default function DescriptionInput({
  value,
  onChange,
  onPick,
  suggestions = [],
  inputRef,
  className,
  placeholder,
  required,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const q = norm(value);
    if (!suggestions.length) return [];
    if (!q) return suggestions.slice(0, MAX_SUGGESTIONS);
    // Prefix matches are the more likely intent, so they float to the top.
    // `suggestions` arrives sorted by frequency, and filter/sort keep that order.
    const hits = suggestions.filter(s => norm(s.description).includes(q));
    const starts = hits.filter(s => norm(s.description).startsWith(q));
    const rest = hits.filter(s => !norm(s.description).startsWith(q));
    return [...starts, ...rest].slice(0, MAX_SUGGESTIONS);
  }, [value, suggestions]);

  // Reset the cursor whenever the visible list changes
  useEffect(() => { setHighlight(-1); }, [value]);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  // Keep the highlighted row in view
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    listRef.current.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  const choose = (s) => {
    onChange(s.description);
    onPick?.(s);
    setOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e) => {
    if (!open || matches.length === 0) {
      // Let ArrowDown reopen the list after it was dismissed
      if (e.key === 'ArrowDown' && matches.length) {
        e.preventDefault();
        setOpen(true);
        setHighlight(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h <= 0 ? matches.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      // Only consume Enter when the user is actually picking a suggestion
      e.preventDefault();
      e.stopPropagation();
      choose(matches[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        // Delay so a click on a suggestion lands before the list unmounts
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
      />

      {open && matches.length > 0 && (
        <ul ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto custom-scrollbar bg-elevated border border-white/10 rounded-lg shadow-2xl py-1">
          {matches.map((s, i) => {
            const [before, hit, after] = splitMatch(s.description, value);
            return (
              <li key={s.description}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}   // keep focus, avoid blur race
                  onClick={() => choose(s)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                    i === highlight ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-sm text-white truncate flex-1 min-w-0">
                    {before}<span className="text-accent-green font-semibold">{hit}</span>{after}
                  </span>
                  {s.category && (
                    <span className="text-[10px] text-secondary bg-white/[0.06] rounded px-1.5 py-0.5 whitespace-nowrap">
                      {s.category}
                    </span>
                  )}
                  <span className="text-[10px] text-muted tabular-nums w-6 text-right">{s.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
