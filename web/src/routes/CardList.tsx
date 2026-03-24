import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCards } from "../hooks/useCards";
import { SearchBar } from "../components/SearchBar";
import { CardListItem } from "../components/CardListItem";
import { showToast } from "../components/Toast";
import { api } from "../services/api";
import { ArrowLeft, Trash2 } from "lucide-react";
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h3 className="text-xl font-semibold flex-1">知识库管理</h3>
      </div>

      <div className="flex flex-col gap-4 mb-8">
        <Tabs value={typeParam} onValueChange={handleTypeChange} className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="all">📚 全部</TabsTrigger>
            <TabsTrigger value="due">📅 待复习</TabsTrigger>
            <TabsTrigger value="mastered">🎓 已掌握</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <SearchBar onSearch={setKeyword} />
          </div>
          <Select value={category || ""} onValueChange={(v) => setCategory(v || null)}>
            <SelectTrigger className="w-[180px] bg-secondary border-border">
              <SelectValue placeholder="按分类筛选" />
            </SelectTrigger>
            <SelectContent>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">加载中...</p>
      ) : (
        <div className="flex flex-col gap-2">
          {cards.map(card => (
            <CardListItem
              key={card.id}
              card={card}
              onClick={() => setSelectedCardId(card.id)}
              onDelete={(id) => handleDelete(id)}
              highlight={keyword}
            />
          ))}
          {cards.length === 0 && <p className="text-muted-foreground text-center py-8">没有找到符合条件的知识卡片</p>}
        </div>
      )}

      <Dialog open={!!selectedCardId} onOpenChange={(open) => { if (!open) setSelectedCardId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cardDetail ? cardDetail.title : "正在读取知识..."}</DialogTitle>
          </DialogHeader>
          {detailLoading || !cardDetail ? (
            <p className="text-muted-foreground text-center py-8">加载缓存中...</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={cardDetail.category}
                  onValueChange={async (val) => {
                    if (val && val !== cardDetail.category) {
                      try {
                        await api.updateCardCategory(cardDetail.id, val);
                        setCardDetail(prev => prev ? { ...prev, category: val } : prev);
                        showToast(`分类已更改为 ${val}`, "success");
                      } catch { showToast("分类更新失败", "error"); }
                    }
                  }}
                >
                  <SelectTrigger className="w-auto h-7 text-xs bg-blue-500/10 border-blue-500/30 text-blue-400 rounded-xl px-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cardDetail.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
              </div>

              <p className="text-sm text-muted-foreground">{cardDetail.brief}</p>

              <div className="max-h-[50vh] overflow-y-auto">
                <div className="prose-kb text-sm" style={{ padding: '0.5rem 0' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{cardDetail.detail}</ReactMarkdown>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  添加于: {new Date(cardDetail.created_at).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  掌握状态: {cardDetail.schedule.consecutive_correct}/3
                  (下次复习: {cardDetail.schedule.next_review_date})
                </p>
              </div>
              <div className="flex justify-end">
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(cardDetail.id)} title="移出知识库">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
