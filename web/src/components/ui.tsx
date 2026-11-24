import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Metric, Reason, Status, TraceStep } from '../rules/types';
import type { Question } from '../rules/options';

export const STATUS_LABEL: Record<Status, string> = {
  possible: 'Looks possible',
  info: 'More information needed',
  closer: 'Closer look needed',
  notsupported: 'Not supported as proposed',
  unavailable: 'Not available here',
};
const STATUS_ICON: Record<Status, string> = { possible: '✓', info: '?', closer: '!', notsupported: '✕', unavailable: '✕' };

export function Badge({ status, large }: { status: Status; large?: boolean }) {
  return (
    <span className={`badge ${status}${large ? ' large' : ''}`}>
      <span className="ico" aria-hidden>
        {STATUS_ICON[status]}
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Header() {
  return (
    <header className="site-header">
      <div className="inner">
        <Link to="/" className="brand">
          Boston ADU Explorer
        </Link>
        <span className="proto-tag">MIT student prototype · not an official City of Boston service</span>
        <nav aria-label="Main">
          <NavLink to="/find">Find your property</NavLink>
          <NavLink to="/rules">About ADUs</NavLink>
          <NavLink to="/have-a-say">Have a say</NavLink>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="inner stack" style={{ ['--gap' as string]: '8px' }}>
        <p>
          Results are preliminary, based on public data and your answers. They are not a zoning determination, permit or legal advice. This MIT prototype is
          inspired by the City of Boston’s ADU Guidebook but is not affiliated with or endorsed by the City.
        </p>
        <p className="row small" style={{ fontFamily: 'var(--ui)' }}>
          <a href="https://www.boston.gov/departments/housing/accessory-dwelling-units-adus-boston" target="_blank" rel="noreferrer">
            Boston’s ADU program
          </a>
          ·<Link to="/rules">Rules and sources</Link>·<Link to="/have-a-say">Have a say</Link>·<a href="mailto:ADU@boston.gov">ADU@boston.gov</a>
        </p>
      </div>
    </footer>
  );
}

export function ProcessBand({ text }: { text?: string }) {
  return (
    <section className="process-band" aria-label="Where you are in Boston’s ADU process">
      <div className="inner stack" style={{ ['--gap' as string]: '6px' }}>
        <div className="eyebrow">Where you are in Boston’s ADU process</div>
        <p className="body">{text ?? 'You’re exploring what’s possible (Learn). Your next step may be to speak with a design professional (Plan).'}</p>
        <div className="process" role="list">
          {['Learn', 'Plan', 'Permit', 'Build', 'Move in'].map((s, i) => (
            <div key={s} role="listitem" className={`step${i === 0 ? ' here' : ''}`} aria-current={i === 0 ? 'step' : undefined}>
              Step {i + 1}:<br />
              {s}
              {i === 0 && <span className="visually-hidden"> (you are here)</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="steps" aria-label="Progress">
      {['Explore', 'Answer questions', 'Your result'].map((s, i) => (
        <span key={s} className={i + 1 === current ? 'on' : i + 1 < current ? 'done' : ''} aria-current={i + 1 === current ? 'step' : undefined}>
          {i + 1} {s}
        </span>
      ))}
    </div>
  );
}

export function Tiles({ items }: { items: Metric[] }) {
  return (
    <div className="grid-tiles">
      {items.map((m) => (
        <div className="tile" key={m.label}>
          <div className="label">{m.label}</div>
          <div className="value">{m.value}</div>
          <div className="note">{m.note}</div>
        </div>
      ))}
    </div>
  );
}

export function Expandable({ title, children, open }: { title: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="exp" open={open}>
      <summary>{title}</summary>
      <div className="exp-body">{children}</div>
    </details>
  );
}

const REASON_KIND: Record<Reason['kind'], [string, string]> = {
  supports: ['Supports this result', '✓'],
  issue: ['Requirement to look at', '!'],
  missing: ['Missing information', '?'],
  confirm: ['To confirm with a professional', 'i'],
  notsupported: ['Not supported', '✕'],
};

export function Reasons({ items }: { items: Reason[] }) {
  return (
    <ul className="reasons">
      {items.map((r, i) => (
        <li key={i} className={`reason ${r.kind}`}>
          <span className="ico" aria-hidden>
            {REASON_KIND[r.kind][1]}
          </span>
          <div>
            <div className="kind">{REASON_KIND[r.kind][0]}</div>
            <div className="title">{r.title}</div>
            <p className="text">{r.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function QuestionField({
  q,
  value,
  onChange,
  name,
}: {
  q: Question;
  value: string | undefined;
  onChange: (v: string) => void;
  name: string;
}) {
  return (
    <fieldset className="q">
      <div className="qgroup">{q.group}</div>
      <legend>{q.text}</legend>
      {q.help && <p className="help">{q.help}</p>}
      <div className="choices">
        {q.choices.map((c) => (
          <label key={c.value} className="choice">
            <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      {q.why && (
        <details className="exp why">
          <summary>Why are we asking?</summary>
          <div className="exp-body">{q.why}</div>
        </details>
      )}
    </fieldset>
  );
}

export function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay-bg" onClick={onClose}>
      <div className="overlay" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="btn small" onClick={onClose}>
            Close ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

const TRACE_LABEL: Record<TraceStep['result'], string> = { pass: 'Meets', fail: 'Doesn’t meet', unknown: 'Not known', flag: 'Flag', info: 'Note' };

export function TraceList({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="trace">
      {steps.map((t, i) => (
        <li key={i}>
          <div>
            <div style={{ fontWeight: 600 }}>{t.rule}</div>
            <div className="serif muted" style={{ fontSize: 15 }}>
              {t.detail}
            </div>
            <div className="src">Source: {t.source}</div>
          </div>
          <span className={`r ${t.result}`}>{TRACE_LABEL[t.result]}</span>
        </li>
      ))}
    </ol>
  );
}

export function Banner({ tone, title, children, action }: { tone: 'warn' | 'info' | 'no'; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === 'no' ? 'alert' : 'status'}>
      <span className="ico" aria-hidden>
        {tone === 'info' ? 'i' : '!'}
      </span>
      <div className="stack" style={{ ['--gap' as string]: '4px', flex: 1 }}>
        <strong>{title}</strong>
        {children && <div className="serif small" style={{ fontSize: 15 }}>{children}</div>}
        {action}
      </div>
    </div>
  );
}

export function Preliminary() {
  return <p className="serif small muted">Preliminary — based on city data and your answers. Not a permit, approval or City determination.</p>;
}
