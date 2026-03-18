import { useState } from "react";
import {
  Group, Badge, ActionIcon, TextInput, Button, Stack,
  ColorSwatch, Popover, SimpleGrid, Text,
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

  return (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        {categories.map(cat => (
          <Group key={cat} gap={4} wrap="nowrap">
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
          </Group>
        ))}
      </Group>

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
