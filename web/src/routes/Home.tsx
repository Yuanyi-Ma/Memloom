import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RingProgress } from "@/components/ring-progress";
import { useStats } from "../hooks/useStats";
import { useConfig } from "../hooks/useConfig";
import { EmptyState } from "../components/EmptyState";
import { ImportModal } from "../components/ImportModal";
import { showToast } from "../components/Toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from "../services/api";
import { Settings, Inbox, BookOpen, CheckCircle, Calendar, Plus } from "lucide-react";
import "./Home.css";

export default function Home() {
  const { stats, history, loading } = useStats();
  const { config, saving, saveConfig } = useConfig();
  const [showImport, setShowImport] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [onboardCats, setOnboardCats] = useState<string[]>([]);
  const [onboardColors, setOnboardColors] = useState<Record<string, string>>({});
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (config) {
      setOnboardCats(config.categories);
      setOnboardColors(config.categoryColors);
      setShowOnboarding(!config.initialized);
    }
  }, [config]);

  useEffect(() => {
    api.getCards({ status: 'pending' })
      .then(r => setPendingCount((r.cards || []).length))
      .catch(() => setPendingCount(0));
  }, []);

  async function handleOnboardSave() {
    const ok = await saveConfig({
      categories: onboardCats,
      categoryColors: onboardColors,
      initialized: true,
    });
    if (ok) setShowOnboarding(false);
  }

  if (loading || !stats || showOnboarding === null) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-[400px]">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 home-container">
      {/* 顶部全局操作区 */}
      <div className="flex justify-end gap-3 mb-8">
        <Button
          variant={pendingCount > 0 ? "secondary" : "ghost"}
          onClick={() => navigate("/inbox")}
          className="gap-2"
        >
          <Inbox className="h-4 w-4" />
          知识筛选区
          {pendingCount > 0 && (
            <Badge className="ml-1 bg-primary text-primary-foreground">{pendingCount}</Badge>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/settings")}
          title="设置"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {showOnboarding ? (
        <EmptyState
          onImportClick={() => setShowImport(true)}
          categories={onboardCats}
          categoryColors={onboardColors}
          onCategoriesChange={(cats, colors) => { setOnboardCats(cats); setOnboardColors(colors); }}
          onSave={handleOnboardSave}
          saving={saving}
        />
      ) : (
        <div className="bento-grid">
          {/* Hero Widget */}
          <div className="bento-item bento-hero glass-card">
            <div className="relative z-[2]">
              <img
                src="/images/logo_bird.png"
                alt="Memloom Logo"
                style={{
                  width: 180, height: 180, objectFit: 'cover',
                  mixBlendMode: 'lighten',
                  WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
                  maskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
                  filter: 'drop-shadow(0 0 30px rgba(56, 189, 248, 0.3))',
                  animation: 'float-slow 4s ease-in-out infinite',
                }}
              />
              <h1 className="text-4xl font-bold mt-4 mb-2 tracking-tight hero-title">
                忆织
              </h1>
              <p className="text-lg text-muted-foreground mb-8">
                知识无感织入，复习自然发生。今日有{' '}
                <span className="text-primary font-bold text-xl">{stats.dueToday}</span>{' '}
                张卡片待复习。
              </p>
              <Button
                size="lg"
                onClick={() => navigate("/review")}
                className="rounded-full shadow-lg shadow-primary/30 border border-primary/60 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                🧠 进入知识学习
              </Button>
            </div>
            <div className="bento-glow-blob blob-hero"></div>
          </div>

          {/* 右上：关键指标卡片群 */}
          <div className="bento-item bento-stats">
            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=all')} style={{ cursor: 'pointer' }}>
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-blue-500/10 text-blue-500 mb-3">
                <BookOpen className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium uppercase text-muted-foreground">总收纳</p>
              <p className="text-3xl font-bold leading-none">{stats.totalCards}</p>
            </div>

            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=mastered')} style={{ cursor: 'pointer' }}>
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-green-500/10 text-green-500 mb-3">
                <CheckCircle className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium uppercase text-muted-foreground">已掌握知识</p>
              <p className="text-3xl font-bold leading-none text-green-500">{stats.masteredCards}</p>
            </div>

            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=due')} style={{ cursor: 'pointer' }}>
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-orange-500/10 text-orange-500 mb-3">
                <Calendar className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium uppercase text-muted-foreground">今日待复习</p>
              <p className="text-3xl font-bold leading-none text-orange-500">{stats.dueToday}</p>
            </div>

            <div className="mini-stat-card glass-card" onClick={() => setShowImport(true)} style={{ cursor: 'pointer' }}>
              <div className="flex items-center justify-center h-10 w-10 rounded-md bg-violet-500/10 text-violet-500 mb-3">
                <Plus className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium uppercase text-muted-foreground">导入知识</p>
              <p className="text-xs text-muted-foreground mt-1">支持 Markdown / CSV</p>
            </div>
          </div>

          {/* 右下：复习活跃度图表 */}
          <div className="bento-item bento-chart glass-card">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-lg">复习活跃度</p>
              <Badge variant="outline" className="text-primary border-primary/30">近14天</Badge>
            </div>

            {history.length > 0 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(val) => val.substring(5)}
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      axisLine={false} tickLine={false}
                      interval={0} angle={-35} textAnchor="end" height={45}
                    />
                    <YAxis
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 12 }}
                      axisLine={false} tickLine={false} allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--popover)',
                        borderColor: 'var(--border)',
                        borderRadius: '12px',
                        backdropFilter: 'blur(10px)',
                        color: 'var(--popover-foreground)',
                      }}
                      itemStyle={{ color: 'var(--primary)', fontWeight: 600 }}
                    />
                    <Area type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[220px]">
                <p className="text-muted-foreground">暂无活跃数据，快去复习吧！</p>
              </div>
            )}
            <div className="bento-glow-blob blob-chart"></div>
          </div>

          {/* 底部左侧：掌握率圆环图 */}
          <div className="bento-item bento-ring glass-card">
            <p className="font-semibold text-lg mb-6">掌握度概览</p>
            <div className="flex justify-center">
              <RingProgress
                size={160}
                thickness={16}
                sections={[
                  { value: stats.totalCards > 0 ? (stats.masteredCards / stats.totalCards) * 100 : 0, color: 'var(--primary)' },
                  { value: stats.totalCards > 0 ? (stats.dueToday / stats.totalCards) * 100 : 0, color: '#f97316' },
                ]}
                label={
                  <span className="text-xl font-bold">
                    {stats.totalCards > 0 ? Math.round((stats.masteredCards / stats.totalCards) * 100) : 0}%
                  </span>
                }
              />
            </div>
            <div className="flex justify-center mt-4 gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-sm text-muted-foreground">已掌握</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-sm text-muted-foreground">待复习</span>
              </div>
            </div>
          </div>

          {/* 底部右侧：AI 学习建议 */}
          <div className="bento-item bento-tips glass-card">
            <p className="font-semibold text-lg mb-3">AI 学习建议</p>
            <div className="flex flex-col gap-2">
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-3">
                  <div className="flex gap-3 items-start">
                    <span className="text-sm">💡</span>
                    <p className="text-sm leading-relaxed">
                      建议您优先复习「{stats.dueToday}」张遗忘边缘的卡片，这将最大化您的记忆留存率。
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(n) => showToast(`✅ 成功导入 ${n} 张知识卡片`, "success")}
        />
      )}
    </div>
  );
}
