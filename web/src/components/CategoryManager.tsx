import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X } from "lucide-react";

const PRESET_COLORS = [
  "green", "blue", "yellow", "gray", "red",
  "violet", "cyan", "orange", "pink", "teal",
];

const COLOR_HEX: Record<string, string> = {
  green: '#22c55e', blue: '#3b82f6', yellow: '#eab308',
  gray: '#9ca3af', red: '#ef4444', violet: '#8b5cf6',
  cyan: '#06b6d4', orange: '#f97316', pink: '#ec4899', teal: '#14b8a6',
};

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

  function handleDragStart(idx: number) { setDragIdx(idx); }
  function handleDragEnter(idx: number) { dragCounter.current++; setDragOverIdx(idx); }
  function handleDragLeave() { dragCounter.current--; if (dragCounter.current <= 0) { setDragOverIdx(null); dragCounter.current = 0; } }
  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); dragCounter.current = 0; return; }
    const reordered = [...categories];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    onChange(reordered, categoryColors);
    setDragIdx(null); setDragOverIdx(null); dragCounter.current = 0;
  }
  function handleDragEnd() { setDragIdx(null); setDragOverIdx(null); dragCounter.current = 0; }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/[0.06] border border-blue-500/[0.12]">
        <span className="text-sm opacity-70">↕️</span>
        <span className="text-xs text-muted-foreground leading-relaxed">
          拖拽调整顺序 · 排在前面的分类将被优先匹配
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat, idx) => {
          const catColor = categoryColors[cat] || "gray";
          const hex = COLOR_HEX[catColor] || '#9ca3af';
          return (
            <div
              key={cat}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragLeave={handleDragLeave}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className="flex items-center gap-1 cursor-grab rounded-md px-1 py-0.5 transition-all"
              style={{
                opacity: dragIdx === idx ? 0.4 : 1,
                transform: dragOverIdx === idx && dragIdx !== idx ? 'scale(1.05)' : 'none',
                outline: dragOverIdx === idx && dragIdx !== idx ? `2px solid ${hex}50` : '2px solid transparent',
              }}
            >
              <span className="text-xs text-muted-foreground font-semibold min-w-[14px] text-center select-none">
                {idx + 1}
              </span>
              <div
                className="rounded-full w-4 h-4 cursor-pointer shrink-0 border border-white/20"
                style={{ background: hex }}
                onClick={() => setColorPickerFor(cat)}
              />
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${hex}15`, color: hex }}
              >
                {cat}
                {categories.length > 1 && (
                  <button className="text-destructive hover:text-destructive/80 ml-0.5" onClick={() => removeCategory(cat)}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="新分类名称"
          value={newCat}
          onChange={e => setNewCat(e.currentTarget.value)}
          onKeyDown={e => e.key === "Enter" && addCategory()}
          className="flex-1 h-8 text-sm bg-secondary border-border"
        />
        <Button size="sm" variant="secondary" onClick={addCategory} disabled={!toSlug(newCat)}>
          添加
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">至少保留 1 个分类。新分类自动转为 slug 格式（小写+连字符）。</p>

      {/* Color Picker Dialog */}
      <Dialog open={!!colorPickerFor} onOpenChange={(open) => { if (!open) setColorPickerFor(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>选择颜色 — {colorPickerFor}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                className="rounded-full w-8 h-8 border-2 transition-all hover:scale-110"
                style={{
                  background: COLOR_HEX[c],
                  borderColor: categoryColors[colorPickerFor || ''] === c ? 'white' : 'transparent',
                }}
                onClick={() => colorPickerFor && setColor(colorPickerFor, c)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
