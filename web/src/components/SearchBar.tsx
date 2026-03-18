import { TextInput } from "@mantine/core";

export function SearchBar({ onSearch }: { onSearch: (keyword: string) => void }) {
  return (
    <TextInput
      size="md"
      radius="md"
      placeholder="🔍 搜索知识卡片..."
      onChange={e => onSearch(e.target.value)}
      mb="md"
      styles={{
        input: {
          background: 'var(--color-bg-secondary)',
          borderColor: 'var(--color-border)',
          '&:focus': { borderColor: 'var(--mantine-color-brand-5)' },
        },
      }}
    />
  );
}
