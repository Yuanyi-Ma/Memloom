import { create } from "zustand";
import type { CardDetail, Rating, ViewState } from "../types/index";

interface ReviewState {
  queue: string[];
  currentIndex: number;
  currentCard: CardDetail | null;
  viewState: ViewState;
  sessionStats: { 会: number; 模糊: number; 不会: number };

  initSession: (queue: string[]) => void;
  setCurrentCard: (card: CardDetail) => void;
  setViewState: (state: ViewState) => void;
  rateAndNext: (rating: Rating) => void;
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  queue: [],
  currentIndex: 0,
  currentCard: null,
  viewState: "question",
  sessionStats: { 会: 0, 模糊: 0, 不会: 0 },

  initSession: (queue) =>
    set({
      queue,
      currentIndex: 0,
      currentCard: null,
      viewState: "question",
      sessionStats: { 会: 0, 模糊: 0, 不会: 0 },
    }),

  setCurrentCard: (card) => set({ currentCard: card }),

  setViewState: (state) => set({ viewState: state }),

  rateAndNext: (rating) => {
    const { currentIndex, queue, sessionStats } = get();
    const newStats = { ...sessionStats, [rating]: sessionStats[rating] + 1 };
    const nextIndex = currentIndex + 1;
    const isComplete = nextIndex >= queue.length;

    set({
      sessionStats: newStats,
      currentIndex: nextIndex,
      currentCard: null,
      viewState: isComplete ? "complete" : "question",
    });
  },
}));
