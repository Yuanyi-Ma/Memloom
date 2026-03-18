import { useNavigate } from "react-router-dom";
import { Button, Group } from "@mantine/core";

export function ActionRow({ onImportClick }: { onImportClick: () => void }) {
  const navigate = useNavigate();
  return (
    <Group justify="center" gap="md" mt="lg">
      <Button
        variant="light"
        color="blue"
        size="lg"
        radius="md"
        onClick={() => navigate("/cards")}
        style={{ flex: 1, maxWidth: 240, minHeight: 56 }}
      >
        📋 知识筛选
      </Button>
      <Button
        variant="filled"
        color="brand"
        size="lg"
        radius="md"
        onClick={() => navigate("/review")}
        style={{ flex: 1, maxWidth: 240, minHeight: 56 }}
      >
        🧠 知识学习
      </Button>
      <Button
        variant="light"
        color="violet"
        size="lg"
        radius="md"
        onClick={onImportClick}
        style={{ flex: 1, maxWidth: 240, minHeight: 56 }}
      >
        📤 知识导入
      </Button>
    </Group>
  );
}
