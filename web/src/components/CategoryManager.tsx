import { useState, useRef } from "react";
import {
  Group, Badge, ActionIcon, TextInput, Button, Stack,
  ColorSwatch, Popover, SimpleGrid, Text, Box,
} from "@mantine/core";

const PRESET_COLORS = [
  "green", "blue", "yellow", "gray", "red",
  "violet", "cyan", "orange", "pink", "teal",
];

interface CategoryManagerProps {
  categories: string[];
  categoryColors: Record<string, string>;
  onChange: (categories: string[], colors: Record<string, string>) => void;
}

export function CategoryManager({ categories, categoryColors, onChange }: CategoryManagerProps) {
  const [newCat, setNewCat] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragCounter = useRef(0);

  function toSlug(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  }

  function addCategory() {
    const slug = toSlug(newCat);
    if (!slug || categories.includes(slug)) return;
    const usedColors = Object.values(categoryColors);
    const nextColor = PRESET_COLORS.find(c => !usedColors.includes(c)) || "gray";
    onChange(
      [...categories, slug],
      { ...categoryColors, [slug]: nextColor },
    );
    setNewCat("");
  }

  function removeCategory(cat: string) {
    if (categories.length <= 1) return;
    const newCats = categories.filter(c => c !== cat);
    const newColors = { ...categoryColors };
    delete newColors[cat];
    onChange(newCats, newColors);
  }

  function setColor(cat: string, color: string) {
    onChange(categories, { ...categoryColors, [cat]: color });
    setColorPickerFor(null);
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragEnter(idx: number) {
    dragCounter.current++;
    setDragOverIdx(idx);
  }

  function handleDragLeave() {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIdx(null);
      dragCounter.current = 0;
    }
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      setDragOverIdx(null);
      dragCounter.current = 0;
      return;
    }
    const reordered = [...categories];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onChange(reordered, categoryColors);
    setDragIdx(null);
    setDragOverIdx(null);
    dragCounter.current = 0;
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
    dragCounter.current = 0;
  }

  return (
    <Stack gap="md">
      <Group gap={6} style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.12)',
      }}>
        <Text fz="sm" style={{ opacity: 0.7 }}>↕️</Text>
        <Text fz="xs" c="dimmed" lh={1.5}>
          拖拽调整顺序 · 排在前面的分类将被优先匹配
        </Text>
      </Group>

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {categories.map((cat, idx) => (
          <Box
            key={cat}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragLeave={handleDragLeave}
            onDragOver={e => e.preventDefault()}
            onDrop={() => handleDrop(idx)}
            onDragEnd={handleDragEnd}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'grab',
              opacity: dragIdx === idx ? 0.4 : 1,
              transform: dragOverIdx === idx && dragIdx !== idx ? 'scale(1.05)' : 'none',
              transition: 'transform 0.15s ease, opacity 0.15s ease',
              borderRadius: 6,
              padding: '2px 4px',
              outline: dragOverIdx === idx && dragIdx !== idx
                ? '2px solid rgba(59,130,246,0.5)'
                : '2px solid transparent',
            }}
          >
            <Text fz="xs" c="dimmed" fw={600} style={{ minWidth: 14, textAlign: 'center', userSelect: 'none' }}>
              {idx + 1}
            </Text>
            <Popover
              opened={colorPickerFor === cat}
              onClose={() => setColorPickerFor(null)}
              position="bottom"
            >
              <Popover.Target>
                <ColorSwatch
                  color={`var(--mantine-color-${categoryColors[cat] || "gray"}-6)`}
                  size={16}
                  style={{ cursor: "pointer" }}
                  onClick={() => setColorPickerFor(cat)}
                />
              </Popover.Target>
              <Popover.Dropdown>
                <SimpleGrid cols={5} spacing={4}>
                  {PRESET_COLORS.map(c => (
                    <ColorSwatch
                      key={c}
                      color={`var(--mantine-color-${c}-6)`}
                      size={24}
                      style={{ cursor: "pointer" }}
                      onClick={() => setColor(cat, c)}
                    />
                  ))}
                </SimpleGrid>
              </Popover.Dropdown>
            </Popover>
            <Badge
              color={categoryColors[cat] || "gray"}
              variant="light"
              rightSection={
                categories.length > 1 ? (
                  <ActionIcon
                    size={14}
                    variant="transparent"
                    color="red"
                    onClick={() => removeCategory(cat)}
                  >
                    ×
                  </ActionIcon>
                ) : null
              }
            >
              {cat}
            </Badge>
          </Box>
        ))}
      </Box>

      <Group gap="xs">
        <TextInput
          placeholder="新分类名称"
          size="xs"
          value={newCat}
          onChange={e => setNewCat(e.currentTarget.value)}
          onKeyDown={e => e.key === "Enter" && addCategory()}
          style={{ flex: 1 }}
        />
        <Button size="xs" variant="light" onClick={addCategory} disabled={!toSlug(newCat)}>
          添加
        </Button>
      </Group>

      <Text fz="xs" c="dimmed">至少保留 1 个分类。新分类自动转为 slug 格式（小写+连字符）。</Text>
    </Stack>
  );
}
