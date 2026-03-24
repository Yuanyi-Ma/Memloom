import { Input } from "@/components/ui/input";

export function SearchBar({ onSearch }: { onSearch: (keyword: string) => void }) {
  return (
    <Input
      placeholder="🔍 搜索知识卡片..."
      onChange={e => onSearch(e.target.value)}
      className="bg-secondary border-border focus-visible:ring-primary mb-4"
    />
  );
}
