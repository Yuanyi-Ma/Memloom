import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { api } from "../services/api";
import { showToast } from "../components/Toast";
import { ArrowLeft, Loader2, Sparkles, Settings as SettingsIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardSummary, CardDetail } from "../types/index";
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
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!detailCache[id]) {
      setDetailLoading(id);
      try {
        const detail = await api.getCardById(id);
        setDetailCache(prev => ({ ...prev, [id]: detail }));
      } catch { showToast("加载详情失败", "error"); }
      finally { setDetailLoading(null); }
    }
  }, [expandedId, detailCache]);

  const handleApprove = async (id: string, title: string) => {
    try {
      await api.updateCardStatus(id, 'active');
      showToast(`已批准卡片入库: ${title}`, "success");
      setCards(cards.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch { showToast("操作失败", "error"); }
  };

  const handleReject = async (id: string, title: string) => {
    try {
      await api.deleteCard(id);
      showToast(`已拒绝并删除: ${title}`, "success");
      setCards(cards.filter(c => c.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch { showToast("操作失败", "error"); }
  };

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
      <div className="max-w-7xl mx-auto px-4 py-8 inbox-container">
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 inbox-container">
      {/* Header */}
      <div className="mb-16">
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate("/")}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" title="AI Auto Review"><Sparkles className="h-5 w-5 text-violet-500" /></Button>
            <Button variant="ghost" size="icon" title="Settings" onClick={() => navigate("/settings")}><SettingsIcon className="h-5 w-5" /></Button>
          </div>
        </div>

        <div className="spotlight-search-wrapper">
          <Input
            className="spotlight-search bg-transparent border-none text-lg h-14 text-foreground"
            placeholder="搜索待处理的知识..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="filters-container">
            {categories.map(cat => (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                className={`glass-filter-btn ${activeCategory === cat ? 'border-primary text-primary' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-2">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-medium tracking-wide flex items-center gap-2">
            待审核卡片 <Badge className="bg-primary/10 text-primary border-primary/30">{cards.length}</Badge>
          </h3>
          {filteredCards.length !== cards.length && (
            <p className="text-sm text-muted-foreground">显示 {filteredCards.length} 条结果</p>
          )}
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <span className="text-6xl opacity-50 mb-5">📦</span>
            <p className="text-xl font-semibold mb-2">收件箱为空</p>
            <p className="text-muted-foreground">所有新知识已处理完毕，干得漂亮！</p>
            <Button className="mt-8" variant="secondary" onClick={() => navigate("/")}>返回探索</Button>
          </div>
        ) : (
          <div className="masonry-grid">
            {filteredCards.map(card => {
              const isExpanded = expandedId === card.id;
              const detail = detailCache[card.id];
              const isLoadingDetail = detailLoading === card.id;

              return (
                <div key={card.id} className="masonry-item">
                  <Card className="glass-card border-0 overflow-hidden">
                    <CardContent className="p-6 relative">
                      <div className="card-glow-accent"></div>

                      <div className="flex items-start justify-between mb-4">
                        <Select
                          value={card.category || ''}
                          onValueChange={async (val) => {
                            if (val && val !== card.category) {
                              try {
                                await api.updateCardCategory(card.id, val);
                                setCards(prev => prev.map(c => c.id === card.id ? { ...c, category: val } : c));
                                showToast(`分类已更改为 ${val}`, "success");
                              } catch { showToast("分类更新失败", "error"); }
                            }
                          }}
                        >
                          <SelectTrigger className="w-auto h-6 text-xs bg-violet-500/10 border-violet-500/30 text-violet-400 rounded-xl px-3" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allCategories.map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">{new Date(card.created_at).toLocaleDateString()}</span>
                      </div>

                      <div className="cursor-pointer" onClick={() => handleToggleDetail(card.id)}>
                        <p className="text-xl font-semibold mb-3 leading-snug">{card.title}</p>
                        <p className={`text-base text-muted-foreground mb-4 leading-relaxed ${isExpanded ? '' : 'line-clamp-4'}`}>
                          {card.brief}
                        </p>
                        {!isExpanded && (
                          <p className="text-sm text-muted-foreground text-center opacity-50">点击展开详情 ▾</p>
                        )}
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <Separator className="my-4 opacity-20" />
                            {isLoadingDetail ? (
                              <div className="flex justify-center py-4">
                                <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                              </div>
                            ) : detail ? (
                              <div>
                                <p className="text-sm font-medium mb-2 text-violet-400">📖 详细说明</p>
                                <p className="text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-wrap">
                                  {detail.detail}
                                </p>
                                {detail.feynman_seed && (
                                  <>
                                    <p className="text-sm font-medium mb-2 text-blue-400">🧠 复习问题</p>
                                    <p className="text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-wrap italic">
                                      {detail.feynman_seed}
                                    </p>
                                  </>
                                )}
                                {card.tags && card.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mb-4">
                                    {card.tags.map(tag => (
                                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                                    ))}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground text-center opacity-50 cursor-pointer" onClick={() => setExpandedId(null)}>
                                  收起详情 ▴
                                </p>
                              </div>
                            ) : null}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="mt-auto pt-4">
                        <div className="grid grid-cols-2 gap-3">
                          <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleReject(card.id, card.title)}>
                            ❌ 拒绝
                          </Button>
                          <Button onClick={() => handleApprove(card.id, card.title)}>
                            ✔️ 批准入库
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
