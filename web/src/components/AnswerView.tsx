import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";

export function AnswerView({ question, detail }: { question: string; detail: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="flashcard-3d-wrapper w-full"
    >
      <div className="flashcard-3d p-10 flex flex-col">
        <p className="text-muted-foreground text-sm font-semibold mb-2 uppercase tracking-widest">DEFINITION</p>
        <p className="flashcard-term" style={{ fontSize: '1.5rem', marginBottom: '16px' }}>{question}</p>
        <div className="flex-1 overflow-y-auto max-h-[50vh]">
          <div className="prose-kb flashcard-body-text">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail}</ReactMarkdown>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
