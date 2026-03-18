import { Paper, Text, ScrollArea, TypographyStylesProvider } from "@mantine/core";
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
      className="flashcard-3d-wrapper"
      style={{ width: '100%' }}
    >
      <Paper p={40} className="flashcard-3d" style={{ display: 'flex', flexDirection: 'column' }}>
        <Text c="dimmed" size="sm" fw={600} mb="xs" tt="uppercase" style={{ letterSpacing: '1px' }}>DEFINITION</Text>
        <Text className="flashcard-term" style={{ fontSize: '1.5rem', marginBottom: '16px' }}>{question}</Text>
        <ScrollArea h="50vh" type="auto" offsetScrollbars>
            <TypographyStylesProvider className="flashcard-body-text">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail}</ReactMarkdown>
            </TypographyStylesProvider>
        </ScrollArea>
      </Paper>
    </motion.div>
  );
}
