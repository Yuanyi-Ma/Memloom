import { useReviewStore } from "../stores/reviewStore";
import { api } from "../services/api";
import type { Rating, ReviewStartParams } from "../types/index";

export function useReview() {
  const store = useReviewStore();

  const startSession = async (params?: ReviewStartParams) => {
    const { queue } = await api.startReview(params ?? {});
    store.initSession(queue);
    if (queue.length > 0) {
      const card = await api.getCardById(queue[0]);
      store.setCurrentCard(card);
    }
  };

  const rateAndLoadNext = async (rating: Rating) => {
    const currentId = store.queue[store.currentIndex];
    await api.scheduleCard(currentId, rating);
    store.rateAndNext(rating);

    const nextIndex = store.currentIndex + 1;
    if (nextIndex < store.queue.length) {
      const card = await api.getCardById(store.queue[nextIndex]);
      store.setCurrentCard(card);
    }
  };

  return { ...store, startSession, rateAndLoadNext };
}
