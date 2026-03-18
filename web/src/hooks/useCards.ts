import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import type { CardSummary, CardFilters } from "../types/index";

export function useCards(filters?: CardFilters) {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCards(filters);
      setCards(res.cards);
    } catch (err: any) {
      setError(err.message || "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(filters)]);

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
