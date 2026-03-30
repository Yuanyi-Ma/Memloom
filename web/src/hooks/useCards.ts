import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../services/api";
import type { CardSummary, CardFilters } from "../types/index";

function shallowEqual(a?: CardFilters, b?: CardFilters): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a) as (keyof CardFilters)[];
  const keysB = Object.keys(b) as (keyof CardFilters)[];
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => a[k] === b[k]);
}

export function useCards(filters?: CardFilters) {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filtersRef = useRef(filters);

  // Update ref only when filters actually change (shallow compare)
  if (!shallowEqual(filtersRef.current, filters)) {
    filtersRef.current = filters;
  }
  const stableFilters = filtersRef.current;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCards(stableFilters);
      setCards(res.cards);
    } catch (err: any) {
      setError(err.message || "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [stableFilters]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => load();

  const deleteCard = async (id: string) => {
    const prev = cards;
    setCards((c) => c.filter((card) => card.id !== id));
    try {
      await api.deleteCard(id);
    } catch {
      setCards(prev); // rollback
    }
  };

  return { cards, loading, error, refresh, deleteCard };
}
