import { useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { ViewActiveContext } from '@/components/ui';

export function DepartmentFilter({ departments, value, onChange }: {
  departments: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const active = useContext(ViewActiveContext);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const typeahead = useRef({ text: '', time: 0 });
  const options = ['', ...departments];
  const selectedIndex = Math.max(0, options.indexOf(value));
  const expanded = open && active;

  useEffect(() => {
    if (!expanded) return;
    const dismiss = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [expanded]);

  useEffect(() => {
    if (expanded) document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded, highlighted, listId]);

  // Retained pages should return with their filter closed.
  useEffect(() => { if (!active) setOpen(false); }, [active]);

  function show(index = selectedIndex) {
    typeahead.current = { text: '', time: 0 };
    setHighlighted(index);
    setOpen(true);
  }

  function choose(index: number) {
    onChange(options[index]);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!expanded) show(selectedIndex);
        else setHighlighted(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
        break;
      case 'Home':
      case 'End':
        event.preventDefault();
        setHighlighted(event.key === 'Home' ? 0 : options.length - 1);
        setOpen(true);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (expanded) choose(highlighted);
        else show();
        break;
      case 'Escape':
        if (expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = Date.now();
        const text = (now - typeahead.current.time < 600 ? typeahead.current.text : '') + event.key.toLocaleLowerCase('ro');
        typeahead.current = { text, time: now };
        const match = options.findIndex(option => (option || 'Toate departamentele').toLocaleLowerCase('ro').startsWith(text));
        if (match !== -1) { event.preventDefault(); setHighlighted(match); setOpen(true); }
      }
    }
  }

  return <div className="department-filter" ref={ref} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <button
      className="department-filter-trigger"
      type="button"
      ref={triggerRef}
      role="combobox"
      aria-label="Departament echipă"
      aria-haspopup="listbox"
      aria-expanded={expanded}
      aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded ? `${listId}-${highlighted}` : undefined}
      onClick={() => expanded ? setOpen(false) : show()}
      onKeyDown={handleKey}
    >
      <Building2 size={16} aria-hidden="true" />
      <span>{value || 'Toate departamentele'}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {expanded && <div className="department-filter-menu" id={listId} role="listbox" aria-label="Departamente">
      {options.map((option, index) => <div
        className="department-filter-option"
        id={`${listId}-${index}`}
        key={option}
        role="option"
        aria-selected={option === value}
        data-highlighted={index === highlighted}
        onPointerMove={() => setHighlighted(index)}
        onPointerDown={event => event.preventDefault()}
        onClick={() => choose(index)}
      >
        <span>{option || 'Toate departamentele'}</span>
        {option === value && <Check size={15} aria-hidden="true" />}
      </div>)}
    </div>}
  </div>;
}
