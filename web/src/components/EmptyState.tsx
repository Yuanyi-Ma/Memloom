import { Stack, Text, Button, Center } from "@mantine/core";

export function EmptyState({ onImportClick }: { onImportClick: () => void }) {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="lg">
        <img
          src="/images/empty-state.png"
          alt="开始你的知识之旅"
          style={{
            width: 200,
            height: 200,
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 16px rgba(16, 185, 129, 0.2))',
          }}
        />
        <Text fz="xl" fw={600} c="dimmed">知识库是空的</Text>
        <Text fz="sm" c="dimmed" ta="center" maw={320}>
          开始使用 OpenClaw 对话，或导入 Markdown 文档，让 AI 帮你提取核心知识。
        </Text>
        <Button color="brand" size="lg" radius="md" onClick={onImportClick}>
          📤 导入知识
        </Button>
      </Stack>
    </Center>
  );
}
