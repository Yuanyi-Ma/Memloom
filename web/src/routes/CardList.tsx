import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Container, Group, Title, Stack, Text, ActionIcon, SegmentedControl, Select, Box, Modal, Badge, ScrollArea, TypographyStylesProvider } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCards } from "../hooks/useCards";
import { SearchBar } from "../components/SearchBar";
import { CardListItem } from "../components/CardListItem";
import { showToast } from "../components/Toast";
import { api } from "../services/api";
import type { CardDetail } from "../types/index";

export default function CardList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get("type") || "all";
  
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { cards, loading, deleteCard } = useCards({ 
    keyword: keyword || undefined, 
    type: typeParam === 'all' ? undefined : typeParam,
    category: category || undefined
  });

  useEffect(() => {
    api.getCategories().then(res => setCategories(res.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCardId) {
      setDetailLoading(true);
      api.getCardById(selectedCardId)
        .then(setCardDetail)
        .catch(() => showToast("无法加载卡片详情", "error"))
        .finally(() => setDetailLoading(false));
    } else {
      setCardDetail(null);
    }
  }, [selectedCardId]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    await deleteCard(id);
    showToast("🗑️ 已移出知识库，将其记为负样本。", "info");
    if (selectedCardId === id) setSelectedCardId(null);
  };

  const handleTypeChange = (value: string) => {
    setSearchParams(prev => {
      prev.set("type", value);
      return prev;
    });
  };

  return (
    <Container size="xl" py="xl">
      <Group mb="lg" align="center">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={() => navigate("/")}>
          ←
        </ActionIcon>
        <Title order={3} style={{ flex: 1 }}>知识库管理</Title>
      </Group>

      <Stack mb="xl" gap="md">
        <SegmentedControl
          value={typeParam}
          onChange={handleTypeChange}
          data={[
            { label: '📚 全部', value: 'all' },
            { label: '📅 待复习', value: 'due' },
            { label: '🎓 已掌握', value: 'mastered' }
          ]}
          fullWidth
          radius="md"
        />
        <Group align="flex-start" grow>
          <Box style={{ flex: 1 }}>
            <SearchBar onSearch={setKeyword} />
          </Box>
          <Select 
            placeholder="按分类筛选"
            data={categories}
            value={category}
            onChange={setCategory}
            clearable
            size="md"
            radius="md"
            styles={{
              input: {
                background: 'var(--color-bg-secondary)',
                borderColor: 'var(--color-border)',
                '&:focus': { borderColor: 'var(--mantine-color-brand-5)' },
              },
            }}
          />
        </Group>
      </Stack>

      {loading ? (
        <Text c="dimmed" ta="center" py="xl">加载中...</Text>
      ) : (
        <Stack gap="sm">
          {cards.map(card => (
            <CardListItem 
              key={card.id} 
              card={card} 
              onClick={() => setSelectedCardId(card.id)}
              onDelete={(id) => handleDelete(id)} 
              highlight={keyword} 
            />
          ))}
          {cards.length === 0 && <Text c="dimmed" ta="center" py="xl">没有找到符合条件的知识卡片</Text>}
        </Stack>
      )}

      <Modal
        opened={!!selectedCardId}
        onClose={() => setSelectedCardId(null)}
        title={cardDetail ? <Title order={4}>{cardDetail.title}</Title> : "正在读取知识..."}
        size="lg"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        {detailLoading || !cardDetail ? (
          <Text c="dimmed" ta="center" py="xl">加载缓存中...</Text>
        ) : (
          <Stack gap="md">
            <Group>
              <Select
                size="xs"
                data={categories}
                value={cardDetail.category}
                onChange={async (val) => {
                  if (val && val !== cardDetail.category) {
                    try {
                      await api.updateCardCategory(cardDetail.id, val);
                      setCardDetail(prev => prev ? { ...prev, category: val } : prev);
                      showToast(`分类已更改为 ${val}`, "success");
                    } catch { showToast("分类更新失败", "error"); }
                  }
                }}
                styles={{
                  input: {
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '12px',
                    color: 'rgba(96, 165, 250, 0.9)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '2px 10px',
                    minHeight: 'unset',
                    height: '24px',
                    cursor: 'pointer',
                  }
                }}
              />
              {cardDetail.tags.map(t => <Badge key={t} variant="outline" size="sm">{t}</Badge>)}
            </Group>
            
            <Text fz="sm" c="dimmed">{cardDetail.brief}</Text>
            
            <ScrollArea h="50vh" type="auto" offsetScrollbars>
              <TypographyStylesProvider className="flashcard-body-text" style={{ padding: '0.5rem 0' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{cardDetail.detail}</ReactMarkdown>
              </TypographyStylesProvider>
            </ScrollArea>
           
            <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid var(--color-border)' }}>
              <Text fz="xs" c="dimmed">
                添加于: {new Date(cardDetail.created_at).toLocaleString()}
              </Text>
              <Text fz="xs" c="dimmed">
                掌握状态: {cardDetail.schedule.consecutive_correct}/3 
                (下次复习: {cardDetail.schedule.next_review_date})
              </Text>
            </Group>
            <Group justify="flex-end" mt="xs">
               <ActionIcon variant="light" color="red" size="md" onClick={() => handleDelete(cardDetail.id)} title="移出知识库">
                  🗑️
               </ActionIcon>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
