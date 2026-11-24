import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FinanceAnswers } from '../rules/finance';
import type { OptionAnswers, Parcel, PropertyAnswers } from '../rules/types';

/** Lazy-loaded parcel records (public/data/parcels.json). */
let parcelsPromise: Promise<Record<string, Parcel>> | null = null;
export function loadParcels(): Promise<Record<string, Parcel>> {
  if (!parcelsPromise) {
    parcelsPromise = fetch(`${import.meta.env.BASE_URL}data/parcels.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load parcel data (${r.status})`);
      return r.json();
    });
  }
  return parcelsPromise;
}

export function useParcels() {
  const [data, setData] = useState<Record<string, Parcel> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadParcels().then(setData, (e) => setError(String(e)));
  }, []);
  return { parcels: data, error };
}

interface Session {
  parcelId?: string;
  property: PropertyAnswers;
  options: Record<string, OptionAnswers>;
  finance: FinanceAnswers;
  bedroomsPref?: '1-2' | '2-3';
  ownerBannerDismissed?: boolean;
}

interface Ctx extends Session {
  setParcel: (id: string | undefined) => void;
  setProperty: (patch: Partial<PropertyAnswers>) => void;
  setOption: (optionId: string, patch: OptionAnswers) => void;
  setFinance: (patch: Partial<FinanceAnswers>) => void;
  setBedroomsPref: (v: '1-2' | '2-3' | undefined) => void;
  dismissOwnerBanner: () => void;
  reset: () => void;
}

const KEY = 'adu-explorer-session-v1';
const empty: Session = { property: {}, options: {}, finance: {} };

function read(): Session {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : empty;
  } catch {
    return empty;
  }
}

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Session>(read);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* storage unavailable — state still works in memory */
    }
  }, [s]);

  const setParcel = useCallback(
    (id: string | undefined) =>
      setS((prev) => (prev.parcelId === id ? prev : { ...empty, parcelId: id, finance: prev.finance })),
    [],
  );
  const setProperty = useCallback((patch: Partial<PropertyAnswers>) => setS((p) => ({ ...p, property: { ...p.property, ...patch } })), []);
  const setOption = useCallback(
    (optionId: string, patch: OptionAnswers) =>
      setS((p) => ({ ...p, options: { ...p.options, [optionId]: { ...p.options[optionId], ...patch } } })),
    [],
  );
  const setFinance = useCallback((patch: Partial<FinanceAnswers>) => setS((p) => ({ ...p, finance: { ...p.finance, ...patch } })), []);
  const setBedroomsPref = useCallback((v: '1-2' | '2-3' | undefined) => setS((p) => ({ ...p, bedroomsPref: v })), []);
  const dismissOwnerBanner = useCallback(() => setS((p) => ({ ...p, ownerBannerDismissed: true })), []);
  const reset = useCallback(() => setS(empty), []);

  const value = useMemo(
    () => ({ ...s, setParcel, setProperty, setOption, setFinance, setBedroomsPref, dismissOwnerBanner, reset }),
    [s, setParcel, setProperty, setOption, setFinance, setBedroomsPref, dismissOwnerBanner, reset],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
