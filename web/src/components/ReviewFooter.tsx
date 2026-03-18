import { Button, Group, Stack, Text } from "@mantine/core";
import type { Rating, ViewState } from "../types/index";

interface Props {
  viewState: ViewState;
  onRate: (r: Rating) => void;
  onChat: () => void;
  onShowAnswer: () => void;
}

export function ReviewFooter({ viewState, onRate, onChat, onShowAnswer }: Props) {
  if (viewState === "complete") return null;

  return (
    <Stack align="stretch" gap="md" w="100%" mt="xl">
      <Text ta="center" size="sm" c="dimmed" fw={500} style={{ opacity: 0.8, letterSpacing: '0.5px' }}>
        👇 请根据你对该知识点的掌握程度进行评估
      </Text>
      <Group
        className="feedback-footer"
        grow
        style={{ width: '100%', padding: '0 0 24px 0' }}
      >
        {(viewState === "question" || viewState === "answer") && (
          <>
            <Button className="feedback-btn-minimal btn-easy" onClick={() => onRate("会")}>
              ✅ 会
            </Button>
            <Button className="feedback-btn-minimal btn-neutral" onClick={onChat}>
              💬 尝试作答
            </Button>
            <Button className="feedback-btn-minimal btn-hard" onClick={() => onRate("不会")}>
              ❌ 不会
            </Button>
          </>
        )}
        {viewState === "chat" && (
          <>
            <Button className="feedback-btn-minimal btn-easy" onClick={() => onRate("会")}>
              ✅ 会
            </Button>
            <Button className="feedback-btn-minimal btn-good" onClick={() => onRate("模糊")}>
              🔶 模糊
            </Button>
            <Button className="feedback-btn-minimal btn-hard" onClick={() => onRate("不会")}>
              ❌ 不会
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
}
