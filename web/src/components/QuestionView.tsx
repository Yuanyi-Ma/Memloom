import { motion } from "framer-motion";
import { Paper, Text, Stack } from "@mantine/core";

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
        <Stack align="stretch" gap="xl" w="100%">
          <Paper
            p={40}
            className="flashcard-3d"
          >
            <Text c="dimmed" size="sm" fw={600} mb="xs" tt="uppercase" style={{ letterSpacing: '1px' }}>TERM</Text>
            <Text className="flashcard-term">
              {question}
            </Text>
            
            <Text className="flashcard-body-text" c="dimmed" mt="xl" style={{ opacity: 0.7 }}>
              点击卡片任意位置查看答案
            </Text>
          </Paper>
        </Stack>
    </motion.div>
  );
}
