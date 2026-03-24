import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="glass-card max-w-[560px] w-full px-9 py-12 text-center">
        <div className="flex flex-col items-center gap-6">
          {/* Logo & Welcome */}
          <img
            src="/images/logo_bird.png"
            alt="Memloom"
            className="w-[120px] h-[120px] object-cover"
            style={{
              mixBlendMode: 'lighten',
              WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
              maskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
              filter: 'drop-shadow(0 0 24px rgba(56, 189, 248, 0.25))',
              animation: 'float-slow 4s ease-in-out infinite',
            }}
          />

          <div>
            <h2 className="text-2xl font-bold mb-1 bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent tracking-tight">
              欢迎使用忆织
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              在开始之前，先设定你的知识分类。<br />
              分类决定了 AI 如何组织你的知识——排在前面的优先级更高。
            </p>
          </div>

          {/* Category Setup */}
          <div className="w-full text-left p-5 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06]">
            <div className="flex justify-between items-center mb-3">
              <span className="font-semibold text-sm">知识分类</span>
              <Badge variant="outline" className="text-primary border-primary/30 text-xs">可拖拽排序</Badge>
            </div>
            <CategoryManager
              categories={categories}
              categoryColors={categoryColors}
              onChange={onCategoriesChange}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button
              className="flex-1 rounded-full shadow-lg shadow-green-500/30 border border-green-500/50 bg-green-600 hover:bg-green-700 text-white"
              size="lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saved ? '✅ 已保存' : '💾 保存分类设置'}
            </Button>
            <Button
              className="flex-1 rounded-full"
              variant="secondary"
              size="lg"
              onClick={onImportClick}
            >
              📤 导入知识
            </Button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            你也可以直接在对话中积累知识，AI 会自动提取并归类。
          </p>
        </div>
      </div>
    </div>
  );
}
