import { useState } from "react";
import { Stack, Text, Button, Center, Box, Title, Group, Badge } from "@mantine/core";
import { CategoryManager } from "./CategoryManager";

interface EmptyStateProps {
  onImportClick: () => void;
  categories: string[];
  categoryColors: Record<string, string>;
  onCategoriesChange: (cats: string[], colors: Record<string, string>) => void;
  onSave: () => void;
  saving?: boolean;
}

export function EmptyState({
  onImportClick,
  categories,
  categoryColors,
  onCategoriesChange,
  onSave,
  saving,
}: EmptyStateProps) {
  const [saved, setSaved] = useState(false);

  function handleSave() {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Center mih="70vh">
      <Box
        className="glass-card"
        style={{
          maxWidth: 560,
          width: '100%',
          padding: '48px 36px',
          textAlign: 'center',
        }}
      >
        <Stack align="center" gap="lg">
          {/* Logo & Welcome */}
          <img
            src="/images/logo_bird.png"
            alt="Memloom"
            style={{
              width: 120,
              height: 120,
              objectFit: 'cover',
              mixBlendMode: 'lighten',
              WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
              maskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
              filter: 'drop-shadow(0 0 24px rgba(56, 189, 248, 0.25))',
              animation: 'float-slow 4s ease-in-out infinite',
            }}
          />

          <Box>
            <Title
              order={2}
              mb={4}
              style={{
                background: '-webkit-linear-gradient(45deg, #fff, #94a3b8)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.5px',
              }}
            >
              欢迎使用忆织
            </Title>
            <Text c="dimmed" size="sm" lh={1.6}>
              在开始之前，先设定你的知识分类。<br />
              分类决定了 AI 如何组织你的知识——排在前面的优先级更高。
            </Text>
          </Box>

          {/* Category Setup */}
          <Box
            w="100%"
            style={{
              textAlign: 'left',
              padding: '20px 16px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <Group justify="space-between" align="center" mb="sm">
              <Text fw={600} size="sm">知识分类</Text>
              <Badge variant="dot" color="brand" size="sm">可拖拽排序</Badge>
            </Group>
            <CategoryManager
              categories={categories}
              categoryColors={categoryColors}
              onChange={onCategoriesChange}
            />
          </Box>

          {/* Actions */}
          <Group gap="sm" w="100%">
            <Button
              flex={1}
              size="md"
              radius="xl"
              color="brand"
              onClick={handleSave}
              loading={saving}
              style={{
                boxShadow: saved ? '0 0 20px rgba(16,185,129,0.5)' : '0 0 12px rgba(16,185,129,0.3)',
                border: '1px solid rgba(16,185,129,0.5)',
                transition: 'box-shadow 0.3s ease',
              }}
            >
              {saved ? '✅ 已保存' : '💾 保存分类设置'}
            </Button>
            <Button
              flex={1}
              size="md"
              radius="xl"
              variant="light"
              color="violet"
              onClick={onImportClick}
            >
              📤 导入知识
            </Button>
          </Group>

          <Text fz="xs" c="dimmed" lh={1.5}>
            你也可以直接在对话中积累知识，AI 会自动提取并归类。
          </Text>
        </Stack>
      </Box>
    </Center>
  );
}
