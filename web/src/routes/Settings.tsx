import { useState, useEffect } from "react";
import {
  Container, Title, Stack, Group, Text, Button,
  TextInput, Select, Badge,
  Modal, Loader, Divider, Center, Box, UnstyledButton,
  Textarea, Paper, ActionIcon, ScrollArea,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useConfig } from "../hooks/useConfig";
import { CategoryManager } from "../components/CategoryManager";
import { Toast } from "../components/Toast";
import { api } from "../services/api";
import type { SkillMeta, SkillSection, ExtractHistoryItem } from "../types/index";
import "./Settings.css";

const INTERVAL_OPTIONS = [
  { value: "5", label: "5 分钟" },
  { value: "15", label: "15 分钟" },
  { value: "30", label: "30 分钟" },
  { value: "60", label: "1 小时" },
  { value: "120", label: "2 小时" },
  { value: "0", label: "关闭" },
];

const SKILL_ICONS: Record<string, string> = {
  "kb-active-capture": "💬",
  "kb-file-import": "📄",
  "kb-feynman-review": "🧠",
};

const SKILL_LABELS: Record<string, string> = {
  "kb-active-capture": "对话知识提取",
  "kb-file-import": "文件知识导入",
  "kb-feynman-review": "费曼复习引导",
};

type SettingsSection = 'skills' | 'extraction' | 'categories' | 'storage';

export default function Settings() {
  const navigate = useNavigate();
  const { config, loading, saving, error, saveConfig, fetchConfig } = useConfig();
  const [activeSection, setActiveSection] = useState<SettingsSection>('skills');

  const [form, setForm] = useState({
    extractIntervalMinutes: 30,
    maxNegativeSamples: 50,
    categories: [] as string[],
    categoryColors: {} as Record<string, string>,
  });

  // Skills state
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [editingSkill, setEditingSkill] = useState<SkillMeta | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [skillSaving, setSkillSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  // Extract history for chart
  const [extractHistory, setExtractHistory] = useState<ExtractHistoryItem[]>([]);

  useEffect(() => {
    if (config) {
      setForm({
        extractIntervalMinutes: config.extractIntervalMinutes,
        maxNegativeSamples: config.maxNegativeSamples,
        categories: config.categories,
        categoryColors: config.categoryColors,
      });
    }
  }, [config]);

  useEffect(() => {
    api.getSkills()
      .then(data => setSkills(data.skills))
      .catch(() => {});
    api.getExtractHistory()
      .then(data => setExtractHistory(data))
      .catch(() => {});
  }, []);

  function openSkillEditor(skill: SkillMeta) {
    setEditingSkill(skill);
    const editable = skill.sections.find(s => s.editable);
    setEditableContent(editable?.content || "");
  }

  async function handleSave() {
    const ok = await saveConfig(form);
    if (ok) {
      setToast({ message: "设置已保存", type: "success" });
    } else {
      setToast({ message: error || "保存失败", type: "error" });
    }
  }

  async function handleSkillSave() {
    if (!editingSkill) return;
    setSkillSaving(true);
    try {
      const updated = await api.updateSkill(editingSkill.id, editableContent);
      setSkills(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditingSkill(null);
      setToast({ message: `Skill「${SKILL_LABELS[updated.id] || updated.name}」已保存`, type: "success" });
    } catch (err: any) {
      setToast({ message: err.message || "保存失败", type: "error" });
    } finally {
      setSkillSaving(false);
    }
  }

  async function handleReset() {
    setResetConfirm(false);
    const ok = await saveConfig({
      extractIntervalMinutes: 30,
      maxNegativeSamples: 50,
      categories: ["programming", "systems-design", "academic", "general"],
      categoryColors: {
        programming: "green",
        "systems-design": "blue",
        academic: "yellow",
        general: "gray",
      },
    });
    if (ok) {
      setToast({ message: "已恢复默认设置", type: "success" });
      fetchConfig();
    }
  }

  if (loading) {
    return (
      <Container size="xl" py="xl" className="settings-page">
        <Center h="50vh"><Loader color="brand" type="bars" /></Center>
      </Container>
    );
  }

  const isRunning = form.extractIntervalMinutes > 0;
  const lastTime = config?.lastExtractTime
    ? new Date(config.lastExtractTime).toLocaleString("zh-CN")
    : "—";

  // 获取 Skill 的简短描述（截取第一句）
  function getSkillBrief(skill: SkillMeta): string {
    const editable = skill.sections.find(s => s.editable);
    if (!editable) return skill.description;
    // 截取可编辑部分前 80 字符
    const brief = editable.content.replace(/^#+\s.*\n+/, '').replace(/\n/g, ' ').trim();
    return brief.length > 80 ? brief.slice(0, 80) + '...' : brief;
  }

  return (
    <Container size="xl" py="xl" className="settings-page">
      <Group justify="space-between" mb="xl">
        <Title order={2} style={{ letterSpacing: '1px' }}>全局设置</Title>
        <Group>
          <Button variant="subtle" color="gray" onClick={() => navigate("/")} radius="xl">
            取消
          </Button>
          <Button color="brand" loading={saving} onClick={handleSave} radius="xl">
            保存更改
          </Button>
        </Group>
      </Group>

      <div className="settings-layout">
        <div className="settings-sidebar">
           <UnstyledButton className="settings-nav-item" data-active={activeSection === 'skills'} onClick={() => setActiveSection('skills')}>
             🧩 Skills 管理
           </UnstyledButton>
           <UnstyledButton className="settings-nav-item" data-active={activeSection === 'extraction'} onClick={() => setActiveSection('extraction')}>
             ⏱️ 自动提取器
           </UnstyledButton>
           <UnstyledButton className="settings-nav-item" data-active={activeSection === 'categories'} onClick={() => setActiveSection('categories')}>
             🏷️ 知识分类标签
           </UnstyledButton>
           <UnstyledButton className="settings-nav-item" data-active={activeSection === 'storage'} onClick={() => setActiveSection('storage')}>
             💾 存储与数据库
           </UnstyledButton>
           
           <Divider my="lg" color="dark.4" />
           <UnstyledButton className="settings-nav-item" style={{ color: '#ef4444' }} onClick={() => setResetConfirm(true)}>
             ⚠️ 恢复出厂设置
           </UnstyledButton>
        </div>

        <div className="settings-content glass-card" style={{ padding: '40px' }}>
          {activeSection === 'skills' && (
            <Stack gap="xl">
              <Box>
                <Text fw={600} size="xl" mb={4}>Skills 管理</Text>
                <Text c="dimmed" size="sm">Skills 是忆织与 AI 对话时使用的技能指令，决定了知识如何被提取、导入和复习。</Text>
              </Box>

              {skills.length === 0 ? (
                <Center py="xl">
                  <Text c="dimmed">未找到 Skills</Text>
                </Center>
              ) : (
                <Stack gap="md">
                  {skills.map(skill => {
                    const editableSection = skill.sections.find(s => s.editable);
                    return (
                      <Paper
                        key={skill.id}
                        p="lg"
                        radius="md"
                        className="skill-card-hover"
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                        onClick={() => openSkillEditor(skill)}
                      >
                        <Group justify="space-between" align="flex-start">
                          <Group gap="md" align="flex-start" style={{ flex: 1 }}>
                            <Text fz={28}>{SKILL_ICONS[skill.id] || "🔧"}</Text>
                            <Box style={{ flex: 1 }}>
                              <Group gap="xs" mb={4}>
                                <Text fw={600} size="md">{SKILL_LABELS[skill.id] || skill.name}</Text>
                                <Badge variant="outline" size="xs" color="cyan">{skill.id}</Badge>
                              </Group>
                              {editableSection && (
                                <Badge size="xs" color="blue" variant="light" mb={6}>
                                  可自定义: {editableSection.label}
                                </Badge>
                              )}
                              <Text c="dimmed" size="sm" lineClamp={2} lh={1.5}>
                                {skill.description.slice(0, 60)}...
                              </Text>
                            </Box>
                          </Group>
                          <ActionIcon variant="subtle" color="gray" size="lg">
                            ✏️
                          </ActionIcon>
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          )}

          {activeSection === 'extraction' && (
            <Stack gap="xl">
              <Text fw={600} size="xl">后台提取任务</Text>
              <Group justify="space-between" mb="md" p="md" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Box>
                  <Text fw={500} mb={4}>提取服务状态</Text>
                  <Text size="sm" c="dimmed">上次运行: {lastTime}</Text>
                </Box>
                <Badge color={isRunning ? "green" : "gray"} variant="dot" size="lg">
                  {isRunning ? "运行中" : "已空闲"}
                </Badge>
              </Group>
              <Select
                label="自动提取检查间隔"
                data={INTERVAL_OPTIONS}
                className="glass-input-wrapper"
                classNames={{ input: 'glass-input' }}
                value={String(form.extractIntervalMinutes)}
                onChange={v => setForm(f => ({ ...f, extractIntervalMinutes: Number(v) }))}
                size="md"
              />

              {/* 提取历史折线图 */}
              <Box className="extract-chart-wrapper">
                <Group justify="space-between" align="center" mb="md">
                  <Text fw={600} size="lg">提取历史</Text>
                  <Badge variant="dot" color="cyan">最近 {extractHistory.length} 次</Badge>
                </Group>
                {extractHistory.length > 0 ? (
                  <Box h={240}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={extractHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="extractGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="time"
                          tickFormatter={(val: string) => {
                            const d = new Date(val);
                            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                          }}
                          stroke="#9CA3AF"
                          tick={{ fontSize: 11, fill: '#9CA3AF' }}
                          axisLine={false}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          stroke="#9CA3AF"
                          tick={{ fontSize: 12, fill: '#9CA3AF' }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: 'rgba(6, 182, 212, 0.3)',
                            borderRadius: '12px',
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                          }}
                          labelFormatter={(val) => {
                            const d = new Date(String(val));
                            return d.toLocaleString('zh-CN');
                          }}
                          formatter={(value) => [`${value} 条对话`, '扫描到的新对话']}
                          itemStyle={{ color: '#06b6d4', fontWeight: 600 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="url(#extractStroke)"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#extractGradient)"
                          dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: '#06b6d4', stroke: 'rgba(6,182,212,0.4)', strokeWidth: 4 }}
                        />
                        <defs>
                          <linearGradient id="extractStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                        </defs>
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                ) : (
                  <Center h={180}>
                    <Stack align="center" gap="xs">
                      <Text fz={32}>📊</Text>
                      <Text c="dimmed" size="sm">暂无提取记录，等待定时器运行后将在此展示趋势</Text>
                    </Stack>
                  </Center>
                )}
              </Box>
            </Stack>
          )}

          {activeSection === 'categories' && (
            <Stack gap="xl">
              <Box>
                <Text fw={600} size="xl" mb={4}>分类标签管理</Text>
                <Text c="dimmed" size="sm">定义知识卡片的分类标签，排列顺序即为分类优先级。</Text>
              </Box>
              <CategoryManager
                categories={form.categories}
                categoryColors={form.categoryColors}
                onChange={(cats, colors) =>
                  setForm(f => ({ ...f, categories: cats, categoryColors: colors }))
                }
              />
            </Stack>
          )}

          {activeSection === 'storage' && (
            <Stack gap="xl">
              <Text fw={600} size="xl">本地数据库配置</Text>
              <TextInput
                label="本地数据库路径"
                value="~/.memloom/"
                disabled
                className="glass-input-wrapper"
                classNames={{ input: 'glass-input' }}
                size="md"
              />
            </Stack>
          )}
        </div>
      </div>

      {/* Skill 分区编辑弹窗 */}
      <Modal
        opened={!!editingSkill}
        onClose={() => setEditingSkill(null)}
        title={
          <Group gap="sm">
            <Text fz={20}>{editingSkill ? (SKILL_ICONS[editingSkill.id] || "🔧") : ""}</Text>
            <Text fw={600}>{editingSkill ? (SKILL_LABELS[editingSkill.id] || editingSkill.name) : ""}</Text>
          </Group>
        }
        centered
        size="xl"
        overlayProps={{ blur: 10, backgroundOpacity: 0.5 }}
      >
        {editingSkill && (
          <ScrollArea.Autosize mah="70vh" offsetScrollbars>
            <Stack gap="lg">
              {editingSkill.sections.map((section, i) => (
                <Box key={i}>
                  <Group gap="xs" mb={8}>
                    <Badge
                      size="sm"
                      color={section.editable ? "blue" : "gray"}
                      variant={section.editable ? "filled" : "outline"}
                    >
                      {section.editable ? "✏️ 可编辑" : "🔒 系统规则"}
                    </Badge>
                    <Text size="xs" c="dimmed" fw={500}>{section.label}</Text>
                  </Group>

                  {section.editable ? (
                    <Textarea
                      value={editableContent}
                      onChange={e => setEditableContent(e.currentTarget.value)}
                      minRows={10}
                      autosize
                      size="sm"
                      styles={{
                        input: {
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          lineHeight: 1.6,
                          background: 'rgba(59,130,246,0.04)',
                          border: '1px solid rgba(59,130,246,0.2)',
                        },
                      }}
                    />
                  ) : (
                    <Paper
                      p="md"
                      radius="md"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      <Text
                        size="xs"
                        c="dimmed"
                        style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.6, opacity: 0.7 }}
                      >
                        {section.content}
                      </Text>
                    </Paper>
                  )}
                </Box>
              ))}

              <Group justify="flex-end" gap="sm" mt="md">
                <Button variant="default" onClick={() => setEditingSkill(null)}>取消</Button>
                <Button color="brand" loading={skillSaving} onClick={handleSkillSave}>
                  保存修改
                </Button>
              </Group>
            </Stack>
          </ScrollArea.Autosize>
        )}
      </Modal>

      <Modal
        opened={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title={<Text fw={600}>危险区域：重置设置</Text>}
        centered
        overlayProps={{ blur: 10, backgroundOpacity: 0.5 }}
      >
        <Text fz="sm" c="dimmed" mb="xl" lh={1.6}>
          这将会清除分类信息以及后台提取任务偏好，恢复到出厂默认状态。Skill 内容不受影响。确定继续？
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setResetConfirm(false)}>取消</Button>
          <Button color="red" onClick={handleReset}>是的，强制重置</Button>
        </Group>
      </Modal>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </Container>
  );
}
