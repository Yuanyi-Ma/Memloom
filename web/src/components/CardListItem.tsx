import { useState, useEffect } from "react";
import { Paper, Group, Text, Badge, ActionIcon, Box, Progress } from "@mantine/core";
import type { CardSummary } from "../types/index";
import { api } from "../services/api";

// 模块级缓存
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


function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 86400000;
}

export function CardListItem({ 
  card, 
  onClick,
  onDelete 
}: { 
  card: CardSummary; 
  onClick?: () => void;
  onDelete: (id: string) => void; 
  highlight?: string 
}) {
  const [colors, setColors] = useState<Record<string, string>>({});

  useEffect(() => {
    getCategoryColors().then(setColors);
  }, []);

  const progressValue = card.schedule ? Math.min((card.schedule.consecutive_correct / 3) * 100, 100) : 0;
  const isMastered = card.schedule && card.schedule.consecutive_correct >= 3;

  return (
    <Paper
      radius="md"
      style={{
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        transition: 'border-color 150ms ease, box-shadow 200ms ease',
        cursor: 'pointer'
      }}
      onClick={onClick}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--color-border)';
      }}
    >
      <Group
        p="sm"
        px="md"
        wrap="nowrap"
      >
        <Badge
          color={colors[card.category] || "gray"}
          variant="dot"
          size="xs"
          style={{ flexShrink: 0 }}
        >
          {card.category}
        </Badge>
        <Text fz="sm" style={{ flex: 1 }} truncate>
          {card.title}
        </Text>
        {isNew(card.created_at) && (
          <Badge color="blue" variant="light" size="xs">NEW</Badge>
        )}
        
        <Box w={80} ml="sm" mr="xs" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Progress 
            value={progressValue} 
            size="sm" 
            color={isMastered ? 'green' : 'blue'} 
            style={{ flex: 1 }} 
            title={`掌握度: ${card.schedule?.consecutive_correct || 0}/3`}
          />
        </Box>

        <Text fz="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {new Date(card.created_at).toLocaleDateString()}
        </Text>
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          onClick={e => { e.stopPropagation(); onDelete(card.id); }}
        >
          🗑️
        </ActionIcon>
      </Group>
    </Paper>
  );
}
