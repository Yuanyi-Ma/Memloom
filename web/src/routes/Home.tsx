import { useState, useEffect } from "react";
import { Container, Title, Box, ActionIcon, Group, Card, Text, Button, Badge, ThemeIcon, Flex, Stack, RingProgress, Center } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useStats } from "../hooks/useStats";
import { useConfig } from "../hooks/useConfig";
import { EmptyState } from "../components/EmptyState";
import { ImportModal } from "../components/ImportModal";
import { showToast } from "../components/Toast";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from "../services/api";
import "./Home.css";

export default function Home() {
  const { stats, history, loading } = useStats();
  const { config, saving, saveConfig } = useConfig();
  const [showImport, setShowImport] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [onboardCats, setOnboardCats] = useState<string[]>([]);
  const [onboardColors, setOnboardColors] = useState<Record<string, string>>({});
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null); // null = loading
  const navigate = useNavigate();

  // 从配置初始化引导页的分类状态 & 判断是否需要引导
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
      <Container size="lg" py="xl">
        <Center h={400}>
          <Text c="dimmed">加载中...</Text>
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl" className="home-container">
      {/* 顶部全局操作区 */}
      <Group justify="flex-end" mb="xl">
        <Button 
          variant={pendingCount > 0 ? "light" : "subtle"} 
          color={pendingCount > 0 ? "brand" : "gray"}
          leftSection="📥" 
          onClick={() => navigate("/inbox")}
        >
          知识筛选区 {pendingCount > 0 && <Badge size="sm" variant="filled" color="brand" ml={4}>{pendingCount}</Badge>}
        </Button>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          onClick={() => navigate("/settings")}
          title="设置"
        >
          ⚙️
        </ActionIcon>
      </Group>

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
          {/* 大核心：复习卡片 (Hero Widget) */}
          <div className="bento-item bento-hero glass-card">
            <Box style={{ position: 'relative', zIndex: 2 }}>
              <img
                src="/images/logo_bird.png"
                alt="Memloom Logo"
                style={{
                  width: 180,
                  height: 180,
                  objectFit: 'cover',
                  // lighten: 只保留图片中比背景更亮的像素（即发光的鸟），暗色底自动和背景融合
                  mixBlendMode: 'lighten',
                  // 径向遮罩兜底：确保图片四角完全透明，防止任何可见边界
                  WebkitMaskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
                  maskImage: 'radial-gradient(circle at center, black 35%, transparent 70%)',
                  filter: 'drop-shadow(0 0 30px rgba(56, 189, 248, 0.3))',
                  animation: 'float-slow 4s ease-in-out infinite',
                }}
              />
              <Title order={1} mt="md" mb="xs" style={{ letterSpacing: '-1px', fontSize: '2.5rem' }} className="hero-title">
                忆织
              </Title>
              <Text c="dimmed" size="lg" mb="xl">
                知识无感织入，复习自然发生。今日有 <Text span c="brand" fw={700} style={{ fontSize: '1.2rem' }}>{stats.dueToday}</Text> 张卡片待复习。
              </Text>
              
              <Button 
                size="lg" 
                radius="xl" 
                color="brand" 
                onClick={() => navigate("/review")}
                style={{
                  boxShadow: '0 0 20px rgba(16,185,129,0.4)',
                  border: '1px solid rgba(16,185,129,0.6)'
                }}
              >
                🧠 进入知识学习
              </Button>
            </Box>
            <div className="bento-glow-blob blob-hero"></div>
          </div>

          {/* 右上：关键指标卡片群 */}
          <div className="bento-item bento-stats">
            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=all')} style={{ cursor: 'pointer' }}>
              <ThemeIcon size="lg" radius="md" variant="light" color="blue" mb="sm">📚</ThemeIcon>
              <Text c="dimmed" size="sm" fw={500} tt="uppercase">总收纳</Text>
              <Text fz="h2" fw={700} style={{ lineHeight: 1 }}>{stats.totalCards}</Text>
            </div>
            
            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=mastered')} style={{ cursor: 'pointer' }}>
              <ThemeIcon size="lg" radius="md" variant="light" color="green" mb="sm">✅</ThemeIcon>
              <Text c="dimmed" size="sm" fw={500} tt="uppercase">已掌握知识</Text>
              <Text fz="h2" fw={700} c="green.4" style={{ lineHeight: 1 }}>{stats.masteredCards}</Text>
            </div>
            
            <div className="mini-stat-card glass-card" onClick={() => navigate('/cards?type=due')} style={{ cursor: 'pointer' }}>
              <ThemeIcon size="lg" radius="md" variant="light" color="orange" mb="sm">📅</ThemeIcon>
              <Text c="dimmed" size="sm" fw={500} tt="uppercase">今日待复习</Text>
              <Text fz="h2" fw={700} c="orange.4" style={{ lineHeight: 1 }}>{stats.dueToday}</Text>
            </div>
            
            <div className="mini-stat-card glass-card" onClick={() => setShowImport(true)} style={{ cursor: 'pointer' }}>
              <ThemeIcon size="lg" radius="md" variant="light" color="violet" mb="sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </ThemeIcon>
              <Text c="dimmed" size="sm" fw={500} tt="uppercase">导入知识</Text>
              <Text fz="xs" c="dimmed" mt={4}>支持 Markdown / CSV</Text>
            </div>
          </div>

          {/* 右下：复习活跃度图表 */}
          <div className="bento-item bento-chart glass-card">
            <Group justify="space-between" align="center" mb="md">
              <Text fw={600} size="lg">复习活跃度</Text>
              <Badge variant="dot" color="brand">近14天</Badge>
            </Group>
            
            {history.length > 0 ? (
              <Box h={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => val.substring(5)} 
                      stroke="#9CA3AF"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }} 
                      axisLine={false} 
                      tickLine={false}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis 
                      stroke="#9CA3AF" 
                      tick={{ fontSize: 12 }} 
                      axisLine={false} 
                      tickLine={false} 
                      allowDecimals={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                        borderColor: 'rgba(255,255,255,0.1)', 
                        borderRadius: '12px',
                        backdropFilter: 'blur(10px)'
                      }}
                      itemStyle={{ color: '#10B981', fontWeight: 600 }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Center h={220}>
                <Text c="dimmed">暂无活跃数据，快去复习吧！</Text>
              </Center>
            )}
             <div className="bento-glow-blob blob-chart"></div>
          </div>
          
           {/* 底部左侧：掌握率圆环图 */}
           <div className="bento-item bento-ring glass-card">
             <Text fw={600} mb="lg" size="lg">掌握度概览</Text>
             <Center>
               <RingProgress
                 size={160}
                 thickness={16}
                 roundCaps
                 sections={[
                   { value: stats.totalCards > 0 ? (stats.masteredCards / stats.totalCards) * 100 : 0, color: 'brand' },
                   { value: stats.totalCards > 0 ? (stats.dueToday / stats.totalCards) * 100 : 0, color: 'orange' }
                 ]}
                 label={
                   <Text ta="center" fz="xl" fw={700}>
                     {stats.totalCards > 0 ? Math.round((stats.masteredCards / stats.totalCards) * 100) : 0}%
                   </Text>
                 }
               />
             </Center>
             <Group justify="center" mt="md" gap="lg">
               <Flex align="center" gap={8}>
                 <Box w={12} h={12} style={{ borderRadius: '50%', background: 'var(--mantine-color-brand-6)' }} />
                 <Text size="sm" c="dimmed">已掌握</Text>
               </Flex>
               <Flex align="center" gap={8}>
                 <Box w={12} h={12} style={{ borderRadius: '50%', background: 'var(--mantine-color-orange-6)' }} />
                 <Text size="sm" c="dimmed">待复习</Text>
               </Flex>
             </Group>
           </div>
           
           {/* 底部右侧：AI 学习建议 */}
           <div className="bento-item bento-tips glass-card">
             <Text fw={600} mb="sm" size="lg">AI 学习建议</Text>
             <Stack gap="xs">
               <Card p="sm" radius="md" bg="rgba(255,255,255,0.03)" withBorder style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                 <Flex gap="sm" align="flex-start">
                   <ThemeIcon variant="subtle" size="sm">💡</ThemeIcon>
                   <Text size="sm" lh={1.4}>建议您优先复习「{stats.dueToday}」张遗忘边缘的卡片，这将最大化您的记忆留存率。</Text>
                 </Flex>
               </Card>
             </Stack>
           </div>

        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(n) => showToast(`✅ 成功导入 ${n} 张知识卡片`, "success")}
        />
      )}
    </Container>
  );
}

