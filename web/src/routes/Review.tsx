import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useReview } from "../hooks/useReview";
import { useReviewStore } from "../stores/reviewStore";
import { ReviewHeader } from "../components/ReviewHeader";
import { QuestionView } from "../components/QuestionView";
import { AnswerView } from "../components/AnswerView";
import { ChatPanel } from "../components/ChatPanel";
import { ReviewFooter } from "../components/ReviewFooter";
import { CompleteView } from "../components/CompleteView";
import "./Review.css";

export default function Review() {
  const review = useReview();
  const { queue, currentIndex, currentCard, viewState, sessionStats, startSession, rateAndLoadNext, setViewState } = review;

  useEffect(() => {
    startSession().then(() => {
      const state = useReviewStore.getState();
      if (state.queue.length === 0) {
        state.setViewState("complete");
      }
    });
  }, []);

  if (!currentCard && viewState !== "complete") {
    return (
      <div className="flex items-center justify-center h-screen max-w-xl mx-auto text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="review-aura-container">
      {viewState === "complete" ? (
        <CompleteView stats={sessionStats} />
      ) : (
        <div className="review-content-wrapper">
          <ReviewHeader current={currentIndex + 1} total={queue.length} category={currentCard?.category} />
          <div className="flex flex-1 flex-col justify-center items-stretch overflow-hidden">
            <AnimatePresence mode="wait">
              {viewState === "question" && currentCard && (
                <QuestionView key={currentCard.id + "-q"} question={currentCard.feynman_seed} onShowAnswer={() => setViewState("answer")} />
              )}
              {viewState === "answer" && currentCard && (
                <AnswerView question={currentCard.feynman_seed} detail={currentCard.detail} />
              )}
              {viewState === "chat" && currentCard && <ChatPanel cardId={currentCard.id} initialQuestion={currentCard.feynman_seed} />}
            </AnimatePresence>
          </div>
          <ReviewFooter viewState={viewState} onRate={rateAndLoadNext}
            onChat={() => setViewState("chat")} onShowAnswer={() => setViewState("answer")} />
        </div>
      )}
    </div>
  );
}
