import { useEffect, useState, useMemo, useCallback } from "react";
import { Container, Title, Card, Text, Group, Badge, ActionIcon, Loader, Box, TextInput, Button, Center, Collapse, Divider, Select } from "@mantine/core";
import { api } from "../services/api";
import { showToast } from "../components/Toast";
import type { CardSummary, CardDetail } from "../types/index";
import { useNavigate } from "react-router-dom";
import "./Inbox.css";

export default function Inbox() {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, CardDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const navigate = useNavigate();

  const loadPendingCards = async () => {
    try {
      setLoading(true);
      const res = await api.getCards({ status: 'pending' });
      setCards(res.cards || []);
    } catch (err) {
      showToast("获取待筛选卡片失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingCards();
    api.getCategories().then(res => setAllCategories(res.categories)).catch(() => {});
  }, []);

  const handleToggleDetail = useCallback(async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!detailCache[id]) {
      setDetailLoading(id);
      try {
        const detail = await api.getCardById(id);
        setDetailCache(prev => ({ ...prev, [id]: detail }));
      } catch {
        showToast("加载详情失败", "error");
      } finally {
        setDetailLoading(null);
      }
    }
  }, [expandedId, detailCache]);

  const handleApprove = async (id: string, title: string) => {
    try {
      await api.updateCardStatus(id, 'active');
      showToast(`已批准卡片入库: ${title}`, "success");
      setCards(cards.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      showToast("操作失败", "error");
    }
  };

  const handleReject = async (id: string, title: string) => {
    try {
      await api.deleteCard(id);
      showToast(`已拒绝并删除: ${title}`, "success");
      setCards(cards.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      showToast("操作失败", "error");
    }
  };

  // Derive categories dynamically from pending cards
  const categories = useMemo(() => {
    const cats = new Set(cards.map(c => c.category).filter(Boolean));
    return ["All", ...Array.from(cats)];
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = card.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            card.brief.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === "All" || card.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [cards, searchQuery, activeCategory]);

  if (loading) {
    return (
      <Container size="xl" py="xl" className="inbox-container">
        <Center h="50vh">
          <Loader color="brand" type="bars" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl" className="inbox-container">
      {/* Header with Spotlight Search */}
      <Box mb={60}>
        <Group justify="space-between" mb="xs">
          <ActionIcon variant="transparent" color="gray" onClick={() => navigate("/")} size="xl">
            <Text fz="h2">←</Text>
          </ActionIcon>
          <Group gap="xs">
             <ActionIcon variant="subtle" title="AI Auto Review" color="violet">✨</ActionIcon>
             <ActionIcon variant="subtle" title="Settings" onClick={() => navigate("/settings")}>⚙️</ActionIcon>
          </Group>
        </Group>

        <div className="spotlight-search-wrapper">
          <TextInput
            className="spotlight-search"
            size="xl"
            radius="xl"
            placeholder="搜索待处理的知识..."
            leftSection={<Text size="lg">🔍</Text>}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            styles={{
              input: { 
                border: 'none', 
                backgroundColor: 'transparent',
                color: '#fff',
                fontSize: '1.1rem'
              }
            }}
          />
          
          <div className="filters-container">
            {categories.map(cat => (
              <Button
                key={cat}
                variant="default"
                size="sm"
                className="glass-filter-btn"
                data-active={activeCategory === cat}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </Box>

      {/* Main Content Area */}
      <Box px="md">
        <Group justify="space-between" mb="xl">
           <Title order={3} fw={500} style={{ letterSpacing: '0.5px' }}>
             待审核卡片 <Badge color="brand" variant="light" ml="sm" size="lg">{cards.length}</Badge>
           </Title>
           {filteredCards.length !== cards.length && (
              <Text c="dimmed" size="sm">显示 {filteredCards.length} 条结果</Text>
           )}
        </Group>

        {cards.length === 0 ? (
          <Center py={100} style={{ flexDirection: 'column' }}>
            <Box style={{ fontSize: '4rem', opacity: 0.5, marginBottom: '20px' }}>📦</Box>
            <Text size="xl" fw={600} mb="sm" style={{ letterSpacing: '0.5px' }}>收件箱为空</Text>
            <Text size="md" c="dimmed">所有新知识已处理完毕，干得漂亮！</Text>
            <Button mt="xl" variant="light" color="brand" onClick={() => navigate("/")}>返回探索</Button>
          </Center>
        ) : (
          <div className="masonry-grid">
            {filteredCards.map(card => {
              const isExpanded = expandedId === card.id;
              const detail = detailCache[card.id];
              const isLoadingDetail = detailLoading === card.id;

              return (
                <div key={card.id} className="masonry-item">
                  <Card shadow="sm" padding="xl" className="glass-card">
                    <div className="card-glow-accent"></div>
                    
                    <Group justify="space-between" mb="md" align="flex-start">
                      <Group gap="xs" align="center">
                        <Select
                          size="xs"
                          variant="unstyled"
                          data={allCategories}
                          value={card.category || ''}
                          onChange={async (val) => {
                            if (val && val !== card.category) {
                              try {
                                await api.updateCardCategory(card.id, val);
                                setCards(prev => prev.map(c => c.id === card.id ? { ...c, category: val } : c));
                                showToast(`分类已更改为 ${val}`, "success");
                              } catch { showToast("分类更新失败", "error"); }
                            }
                          }}
                          styles={{
                            input: {
                              backgroundColor: 'rgba(139, 92, 246, 0.1)',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              borderRadius: '12px',
                              color: 'rgba(139, 92, 246, 0.9)',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              padding: '2px 10px',
                              minHeight: 'unset',
                              height: '22px',
                              cursor: 'pointer',
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Group>
                      <Text size="xs" c="dimmed">{new Date(card.created_at).toLocaleDateString()}</Text>
                    </Group>

                    {/* 可点击区域 */}
                    <Box
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleToggleDetail(card.id)}
                    >
                      <Text fw={600} size="xl" mb="sm" lh={1.3} style={{ color: '#f8fafc' }}>
                        {card.title}
                      </Text>
                      
                      <Text size="sm" c="dimmed" lineClamp={isExpanded ? undefined : 4} mb="md" lh={1.6}>
                        {card.brief}
                      </Text>

                      {!isExpanded && (
                        <Text size="xs" c="dimmed" ta="center" mb="sm" style={{ opacity: 0.5 }}>
                          点击展开详情 ▾
                        </Text>
                      )}
                    </Box>

                    {/* 展开的详情区域 */}
                    <Collapse in={isExpanded}>
                      <Divider my="md" color="rgba(255,255,255,0.08)" />
                      
                      {isLoadingDetail ? (
                        <Center py="md">
                          <Loader size="sm" color="violet" />
                        </Center>
                      ) : detail ? (
                        <Box>
                          <Text size="sm" fw={500} mb="xs" style={{ color: 'rgba(167, 139, 250, 0.9)' }}>
                            📖 详细说明
                          </Text>
                          <Text size="sm" c="dimmed" lh={1.7} mb="md" style={{ whiteSpace: 'pre-wrap' }}>
                            {detail.detail}
                          </Text>

                          {detail.feynman_seed && (
                            <>
                              <Text size="sm" fw={500} mb="xs" style={{ color: 'rgba(96, 165, 250, 0.9)' }}>
                                🧠 复习问题
                              </Text>
                              <Text size="sm" c="dimmed" lh={1.7} mb="md" style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                                {detail.feynman_seed}
                              </Text>
                            </>
                          )}

                          {card.tags && card.tags.length > 0 && (
                            <Group gap={4} mb="md">
                              {card.tags.map(tag => (
                                <Badge key={tag} size="xs" variant="dot" color="gray">
                                  {tag}
                                </Badge>
                              ))}
                            </Group>
                          )}

                          <Text size="xs" c="dimmed" ta="center" style={{ opacity: 0.5, cursor: 'pointer' }}
                            onClick={() => setExpandedId(null)}>
                            收起详情 ▴
                          </Text>
                        </Box>
                      ) : null}
                    </Collapse>
                    
                    <Box mt="auto" pt="md">
                      <Group gap="sm" grow>
                        <Button 
                          variant="light" 
                          color="red" 
                          radius="md" 
                          onClick={() => handleReject(card.id, card.title)}
                          leftSection="❌"
                        >
                          拒绝
                        </Button>
                        <Button 
                          variant="filled" 
                          color="brand" 
                          radius="md" 
                          onClick={() => handleApprove(card.id, card.title)}
                          leftSection="✔️"
                        >
                          批准入库
                        </Button>
                      </Group>
                    </Box>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </Box>
    </Container>
  );
}

