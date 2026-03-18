import { useState, useEffect } from "react";
import { Group, Badge, Progress, Text, ActionIcon } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

interface Props {
  current: number;
  total: number;
  category?: string;
}

let _cachedColors: Record<string, string> | null = null;
async function getCategoryColors(): Promise<Record<string, string>> {
  if (_cachedColors) return _cachedColors;
  try {
    const data = await api.getCategories();
    _cachedColors = data.colors;
    return _cachedColors;
  } catch {
    return {};
  }
}

export function ReviewHeader({ current, total, category }: Props) {
  const navigate = useNavigate();
  const progress = total > 0 ? (current / total) * 100 : 0;
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    getCategoryColors().then(setColors);
  }, []);

  return (
    <Group p="md" gap="md" align="center">
      <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate("/")}>
        ←
      </ActionIcon>
      <Progress
        value={progress}
        color="brand"
        radius="xl"
        size="sm"
        style={{ flex: 1 }}
        animated
      />
      <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {current} / {total}
      </Text>
      {category && (
        <Badge
          color={colors[category] || "gray"}
          variant="light"
          size="sm"
          radius="xl"
        >
          {category}
        </Badge>
      )}
    </Group>
  );
}

