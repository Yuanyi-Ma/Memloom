import { motion } from "framer-motion";

export function QuestionView({ question, onShowAnswer }: { question: string; onShowAnswer: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.05, y: -20 }}
      className="flashcard-3d-wrapper"
      onClick={onShowAnswer}
      style={{ cursor: 'pointer' }}
    >
      <div className="flex flex-col items-stretch gap-6 w-full">
        <div className="flashcard-3d p-10">
          <p className="text-muted-foreground text-sm font-semibold mb-2 uppercase tracking-widest">TERM</p>
          <p className="flashcard-term">{question}</p>
          <p className="flashcard-body-text mt-8 text-primary/70 font-medium text-base tracking-wide">
            👆 点击卡片任意位置查看答案
          </p>
        </div>
      </div>
    </motion.div>
  );
}
