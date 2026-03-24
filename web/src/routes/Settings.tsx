import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useConfig } from "../hooks/useConfig";
import { CategoryManager } from "../components/CategoryManager";
import { Toast } from "../components/Toast";
import { showToast } from "../components/Toast";
import { api } from "../services/api";
import { Loader2, Pencil } from "lucide-react";
import type { SkillMeta, ExtractHistoryItem } from "../types/index";
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

  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [editingSkill, setEditingSkill] = useState<SkillMeta | null>(null);
  const [editableContent, setEditableContent] = useState("");
  const [skillSaving, setSkillSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
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
    api.getSkills().then(data => setSkills(data.skills)).catch(() => {});
    api.getExtractHistory().then(data => setExtractHistory(data)).catch(() => {});
  }, []);

  function openSkillEditor(skill: SkillMeta) {
    setEditingSkill(skill);
    const editable = skill.sections.find(s => s.editable);
    setEditableContent(editable?.content || "");
  }

  async function handleSave() {
    const ok = await saveConfig(form);
    if (ok) {
      showToast("设置已保存", "success");
    } else {
      showToast(error || "保存失败", "error");
    }
  }

  async function handleSkillSave() {
    if (!editingSkill) return;
    setSkillSaving(true);
    try {
      const updated = await api.updateSkill(editingSkill.id, editableContent);
      setSkills(prev => prev.map(s => s.id === updated.id ? updated : s));
      setEditingSkill(null);
      showToast(`Skill「${SKILL_LABELS[updated.id] || updated.name}」已保存`, "success");
    } catch (err: any) {
      showToast(err.message || "保存失败", "error");
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
      categoryColors: { programming: "green", "systems-design": "blue", academic: "yellow", general: "gray" },
    });
    if (ok) {
      showToast("已恢复默认设置", "success");
      fetchConfig();
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 settings-page">
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const isRunning = form.extractIntervalMinutes > 0;
  const lastTime = config?.lastExtractTime
    ? new Date(config.lastExtractTime).toLocaleString("zh-CN")
    : "—";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 settings-page">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold tracking-wide">全局设置</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => navigate("/")} className="rounded-full">取消</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存更改
          </Button>
        </div>
      </div>

      <div className="settings-layout">
        <div className="settings-sidebar">
          <button className="settings-nav-item" data-active={activeSection === 'skills'} onClick={() => setActiveSection('skills')}>
            🧩 Skills 管理
          </button>
          <button className="settings-nav-item" data-active={activeSection === 'extraction'} onClick={() => setActiveSection('extraction')}>
            ⏱️ 自动提取器
          </button>
          <button className="settings-nav-item" data-active={activeSection === 'categories'} onClick={() => setActiveSection('categories')}>
            🏷️ 知识分类标签
          </button>
          <button className="settings-nav-item" data-active={activeSection === 'storage'} onClick={() => setActiveSection('storage')}>
            💾 存储与数据库
          </button>

          <Separator className="my-6" />
          <button className="settings-nav-item text-destructive" onClick={() => setResetConfirm(true)}>
            ⚠️ 恢复出厂设置
          </button>
        </div>

        <div className="settings-content glass-card" style={{ padding: '40px' }}>
          {activeSection === 'skills' && (
            <div className="flex flex-col gap-8">
              <div>
                <p className="text-xl font-semibold mb-1">Skills 管理</p>
                <p className="text-sm text-muted-foreground">Skills 是忆织与 AI 对话时使用的技能指令，决定了知识如何被提取、导入和复习。</p>
              </div>

              {skills.length === 0 ? (
                <div className="flex justify-center py-8">
                  <p className="text-muted-foreground">未找到 Skills</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {skills.map(skill => {
                    const editableSection = skill.sections.find(s => s.editable);
                    return (
                      <div
                        key={skill.id}
                        className="p-5 rounded-lg bg-card/50 border border-border/50 cursor-pointer hover:border-border transition-all"
                        onClick={() => openSkillEditor(skill)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-4 flex-1">
                            <span className="text-3xl">{SKILL_ICONS[skill.id] || "🔧"}</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">{SKILL_LABELS[skill.id] || skill.name}</span>
                                <Badge variant="outline" className="text-xs text-cyan-500 border-cyan-500/30">{skill.id}</Badge>
                              </div>
                              {editableSection && (
                                <Badge className="text-xs mb-2 bg-blue-500/10 text-blue-400 border-0">
                                  可自定义: {editableSection.label}
                                </Badge>
                              )}
                              <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                                {skill.description.slice(0, 60)}...
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSection === 'extraction' && (
            <div className="flex flex-col gap-8">
              <p className="text-xl font-semibold">后台提取任务</p>
              <div className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border/50">
                <div>
                  <p className="font-medium mb-1">提取服务状态</p>
                  <p className="text-sm text-muted-foreground">上次运行: {lastTime}</p>
                </div>
                <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "bg-green-500/10 text-green-500 border-green-500/30" : ""}>
                  {isRunning ? "运行中" : "已空闲"}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>自动提取检查间隔</Label>
                <Select value={String(form.extractIntervalMinutes)} onValueChange={v => setForm(f => ({ ...f, extractIntervalMinutes: Number(v) }))}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="extract-chart-wrapper">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-lg font-semibold">提取历史</p>
                  <Badge variant="outline" className="text-cyan-500 border-cyan-500/30">最近 {extractHistory.length} 次</Badge>
                </div>
                {extractHistory.length > 0 ? (
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={extractHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="extractGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.5} />
                            <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="extractStroke" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="time"
                          tickFormatter={(val: string) => { const d = new Date(val); return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`; }}
                          stroke="var(--muted-foreground)" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                          axisLine={false} tickLine={false} interval="preserveStartEnd"
                        />
                        <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--popover)', borderColor: 'var(--border)', borderRadius: '12px', backdropFilter: 'blur(12px)', color: 'var(--popover-foreground)' }}
                          labelFormatter={(val) => new Date(String(val)).toLocaleString('zh-CN')}
                          formatter={(value) => [`${value} 条对话`, '扫描到的新对话']}
                          itemStyle={{ color: '#06b6d4', fontWeight: 600 }}
                        />
                        <Area type="monotone" dataKey="count" stroke="url(#extractStroke)" strokeWidth={2.5} fillOpacity={1} fill="url(#extractGradient)"
                          dot={{ r: 3, fill: '#06b6d4', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#06b6d4', stroke: 'rgba(6,182,212,0.4)', strokeWidth: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[180px] gap-2">
                    <span className="text-3xl">📊</span>
                    <p className="text-sm text-muted-foreground">暂无提取记录，等待定时器运行后将在此展示趋势</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'categories' && (
            <div className="flex flex-col gap-8">
              <div>
                <p className="text-xl font-semibold mb-1">分类标签管理</p>
                <p className="text-sm text-muted-foreground">定义知识卡片的分类标签，排列顺序即为分类优先级。</p>
              </div>
              <CategoryManager
                categories={form.categories}
                categoryColors={form.categoryColors}
                onChange={(cats, colors) => setForm(f => ({ ...f, categories: cats, categoryColors: colors }))}
              />
            </div>
          )}

          {activeSection === 'storage' && (
            <div className="flex flex-col gap-8">
              <p className="text-xl font-semibold">本地数据库配置</p>
              <div className="space-y-2">
                <Label>本地数据库路径</Label>
                <Input value="~/.memloom/" disabled className="bg-secondary border-border" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Skill Editor Dialog */}
      <Dialog open={!!editingSkill} onOpenChange={(open) => { if (!open) setEditingSkill(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{editingSkill ? (SKILL_ICONS[editingSkill.id] || "🔧") : ""}</span>
              <span>{editingSkill ? (SKILL_LABELS[editingSkill.id] || editingSkill.name) : ""}</span>
            </DialogTitle>
          </DialogHeader>
          {editingSkill && (
            <div className="flex flex-col gap-6">
              {editingSkill.sections.map((section, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={section.editable ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}>
                      {section.editable ? "✏️ 可编辑" : "🔒 系统规则"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">{section.label}</span>
                  </div>
                  {section.editable ? (
                    <Textarea
                      value={editableContent}
                      onChange={e => setEditableContent(e.target.value)}
                      rows={10}
                      className="font-mono text-sm leading-relaxed bg-blue-500/5 border-blue-500/20"
                    />
                  ) : (
                    <div className="p-4 rounded-lg bg-card/50 border border-border/50 max-h-[200px] overflow-auto">
                      <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed opacity-70">
                        {section.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingSkill(null)}>取消</Button>
                <Button onClick={handleSkillSave} disabled={skillSaving}>
                  {skillSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  保存修改
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Confirm Dialog */}
      <Dialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>危险区域：重置设置</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            这将会清除分类信息以及后台提取任务偏好，恢复到出厂默认状态。Skill 内容不受影响。确定继续？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetConfirm(false)}>取消</Button>
            <Button variant="destructive" onClick={handleReset}>是的，强制重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
