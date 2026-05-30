import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlineOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import LibraryBooksOutlinedIcon from "@mui/icons-material/LibraryBooksOutlined";
import LinkIcon from "@mui/icons-material/Link";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import UpdateIcon from "@mui/icons-material/Update";

type ViewMode = "review" | "library" | "graph";
type EditKind = "pending" | "canonical";
type ConfirmKind = "accept" | "reject" | "update";

type Relation = {
  type?: string;
  id: string;
  target?: "canonical" | "pending";
  reason?: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  abstract: string;
  agent?: string | null;
  human?: string | null;
  domain: string;
  form: string;
  relations?: Relation[];
  temporal?: { invalid_at?: string | null };
  learning?: { active_recall_questions?: string[] | null };
  source?: {
    session_id?: string;
    turn_range?: number[];
    evidence_quote?: string;
    extracted_at?: string;
  };
  attribution?: {
    kind?: string;
    claim_owner?: string;
    adoption?: string;
  };
  weight?: {
    use_count?: number;
    last_used?: string | null;
  };
  audit_status?: string;
  human_audited_at?: string;
  rejected_at?: string;
  m1_judgment?: string;
  m1_neighbors?: Array<{
    id?: string;
    sim?: number | string;
    suggested_relation?: string;
  }>;
  m1_merge_preview?: string;
};

type UpdatePreview = {
  title?: string | null;
  abstract?: string | null;
  agent?: string | null;
  human?: string | null;
};

type ReviewState = {
  knowledge_dir: string;
  domains: string[];
  pending: Record<string, KnowledgeItem>;
  canonical: Record<string, KnowledgeItem>;
  duplicates: Record<string, KnowledgeItem>;
  rejected: Record<string, KnowledgeItem>;
  stats: {
    pending_count: number;
    canonical_count: number;
    duplicate_count: number;
    rejected_count: number;
    pending_by_judgment: Record<string, number>;
    pending_by_domain: Record<string, number>;
    pending_by_form: Record<string, number>;
    canonical_by_domain: Record<string, number>;
  };
};

type EditForm = {
  title: string;
  domain: string;
  form: string;
  abstract: string;
  agent: string;
  human: string;
  invalid_at: string;
  relations: string;
};

type ToastState = {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info";
};

type GraphNode = {
  id: string;
  kind: "pending" | "canonical";
  item: KnowledgeItem;
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "link" | "update";
  reason?: string;
};

const emptyEditForm: EditForm = {
  title: "",
  domain: "",
  form: "methodology",
  abstract: "",
  agent: "",
  human: "",
  invalid_at: "",
  relations: "[]",
};

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function values<T>(obj: Record<string, T> | undefined | null) {
  return Object.values(obj || {});
}

function byId(collection: Record<string, KnowledgeItem> | undefined, id: string | null) {
  if (!id) return null;
  return collection?.[id] || null;
}

function requestJson<T>(path: string, options: RequestInit = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  }).then(async (res) => {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body as T;
  });
}

function inferRelationTarget(rel: Relation) {
  if (rel.target === "pending" || rel.target === "canonical") return rel.target;
  return String(rel.id || "").startsWith("p_") ? "pending" : "canonical";
}

function parseMergePreview(value?: string | null): UpdatePreview | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as UpdatePreview;
  } catch {
    return null;
  }
}

function buildGraph(data: ReviewState): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
  const pending = values(data.pending);
  const canonical = values(data.canonical);
  const byAnyId: Record<string, { kind: GraphNode["kind"]; item: KnowledgeItem }> = {};
  for (const item of pending) byAnyId[item.id] = { kind: "pending", item };
  for (const item of canonical) byAnyId[item.id] = { kind: "canonical", item };

  const edgeMap = new Map<string, GraphEdge>();
  const addEdge = (sourceId: string, targetId: string | undefined, type: GraphEdge["type"], reason?: string) => {
    if (!targetId || !byAnyId[sourceId] || !byAnyId[targetId]) return;
    const key = `${sourceId}:${targetId}:${type}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { id: key, sourceId, targetId, type, reason });
  };

  for (const item of [...pending, ...canonical]) {
    for (const rel of item.relations || []) addEdge(item.id, rel.id, rel.type === "update" ? "update" : "link", rel.reason);
  }
  for (const item of pending) {
    if (item.m1_judgment === "update") addEdge(item.id, item.m1_neighbors?.[0]?.id, "update");
  }

  const edges = [...edgeMap.values()];
  const linkedIds = new Set<string>();
  for (const edge of edges) {
    linkedIds.add(edge.sourceId);
    linkedIds.add(edge.targetId);
  }

  const pendingNodes = pending.filter((item) => linkedIds.has(item.id) || item.relations?.length || item.m1_judgment === "update");
  const canonicalNodes = canonical.filter((item) => linkedIds.has(item.id) || (item.relations || []).length);
  const nodeHeight = 92;
  const rowGap = 28;
  const top = 34;
  const leftX = 48;
  const rightX = 628;
  const rowCount = Math.max(pendingNodes.length, canonicalNodes.length, 1);
  const height = Math.max(390, top * 2 + rowCount * nodeHeight + (rowCount - 1) * rowGap);
  const placeNodes = (items: KnowledgeItem[], kind: GraphNode["kind"], x: number) =>
    items.map((item, index) => {
      const laneHeight = items.length * nodeHeight + Math.max(items.length - 1, 0) * rowGap;
      const offset = Math.max((height - laneHeight) / 2, top);
      return { id: item.id, kind, item, x, y: offset + index * (nodeHeight + rowGap) };
    });

  return {
    nodes: [...placeNodes(pendingNodes, "pending", leftX), ...placeNodes(canonicalNodes, "canonical", rightX)],
    edges,
    width: 980,
    height,
  };
}

function judgmentCode(value?: string) {
  if (value === "update") return "UPDATE";
  if (value === "link") return "LINK";
  if (value === "none" || !value) return "NEW";
  return value.toUpperCase();
}

function judgmentLabel(value?: string) {
  if (value === "update") return "建议更新";
  if (value === "link") return "建议关联";
  if (value === "none" || !value) return "新知识";
  return text(value);
}

function judgmentDetail(value?: string, relationCount = 0) {
  if (value === "update") return "AIDA 判断这条候选可能更新一条旧知识，审核时优先检查右侧更新目标。";
  if (value === "link") return "AIDA 判断这条候选应作为新知识入库，并保留正式库关联。";
  if (relationCount > 0) return `AIDA 判断暂无正式库匹配，但它和 ${relationCount} 条待审候选有关。`;
  return "AIDA 判断暂无正式库匹配，可以作为新知识审核。";
}

function judgmentTone(value?: string) {
  if (value === "update") {
    return { main: "#b56a00", bg: "#fff5df", border: "#f0c979", icon: <UpdateIcon fontSize="small" /> };
  }
  if (value === "link") {
    return { main: "#1f6feb", bg: "#e8f1ff", border: "#abc9ff", icon: <LinkIcon fontSize="small" /> };
  }
  return { main: "#168a5b", bg: "#e9f8f0", border: "#9ddab8", icon: <AddCircleOutlineIcon fontSize="small" /> };
}

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.length > 4 ? `.../${parts.slice(-3).join("/")}` : path;
}

function searchableText(item: KnowledgeItem) {
  return [
    item.id,
    item.title,
    item.abstract,
    item.agent,
    item.human,
    item.domain,
    item.form,
    item.source?.evidence_quote,
    item.attribution?.claim_owner,
  ]
    .join("\n")
    .toLowerCase();
}

function makeEditForm(item: KnowledgeItem): EditForm {
  return {
    title: item.title || "",
    domain: item.domain || "",
    form: item.form || "methodology",
    abstract: item.abstract || "",
    agent: item.agent || "",
    human: item.human || "",
    invalid_at: item.temporal?.invalid_at || "",
    relations: JSON.stringify(item.relations || [], null, 2),
  };
}

export default function App() {
  const [data, setData] = useState<ReviewState | null>(null);
  const [view, setView] = useState<ViewMode>("review");
  const [loading, setLoading] = useState(true);
  const [selectedPendingId, setSelectedPendingId] = useState<string | null>(null);
  const [selectedCanonicalId, setSelectedCanonicalId] = useState<string | null>(null);
  const [reviewSearch, setReviewSearch] = useState("");
  const [judgmentFilter, setJudgmentFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryFormFilter, setLibraryFormFilter] = useState("");
  const [libraryDomain, setLibraryDomain] = useState("");
  const [editTarget, setEditTarget] = useState<{ kind: EditKind; id: string } | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [confirmAction, setConfirmAction] = useState<{ kind: ConfirmKind; id: string } | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "", severity: "info" });

  const notify = (message: string, severity: ToastState["severity"] = "info") => {
    setToast({ open: true, message, severity });
  };

  const loadState = async () => {
    setLoading(true);
    try {
      const next = await requestJson<ReviewState>("/api/state");
      setData(next);
      setSelectedPendingId((current) => (current && next.pending[current] ? current : Object.keys(next.pending)[0] || null));
      setSelectedCanonicalId((current) =>
        current && next.canonical[current] ? current : Object.keys(next.canonical)[0] || null,
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, []);

  const pendingItems = useMemo(() => {
    if (!data) return [];
    const query = reviewSearch.trim().toLowerCase();
    return values(data.pending).filter((item) => {
      if (judgmentFilter && item.m1_judgment !== judgmentFilter) return false;
      if (domainFilter && item.domain !== domainFilter) return false;
      if (!query) return true;
      return searchableText(item).includes(query);
    });
  }, [data, reviewSearch, judgmentFilter, domainFilter]);

  const canonicalItems = useMemo(() => {
    if (!data) return [];
    const query = librarySearch.trim().toLowerCase();
    return values(data.canonical).filter((item) => {
      if (libraryDomain && item.domain !== libraryDomain) return false;
      if (libraryFormFilter && item.form !== libraryFormFilter) return false;
      if (!query) return true;
      return searchableText(item).includes(query);
    });
  }, [data, librarySearch, libraryFormFilter, libraryDomain]);

  useEffect(() => {
    if (!pendingItems.length) {
      setSelectedPendingId(null);
      return;
    }
    if (!selectedPendingId || !pendingItems.some((item) => item.id === selectedPendingId)) {
      setSelectedPendingId(pendingItems[0].id);
    }
  }, [pendingItems, selectedPendingId]);

  useEffect(() => {
    if (!canonicalItems.length) {
      setSelectedCanonicalId(null);
      return;
    }
    if (!selectedCanonicalId || !canonicalItems.some((item) => item.id === selectedCanonicalId)) {
      setSelectedCanonicalId(canonicalItems[0].id);
    }
  }, [canonicalItems, selectedCanonicalId]);

  const selectedPending = byId(data?.pending, selectedPendingId);
  const selectedCanonical = byId(data?.canonical, selectedCanonicalId);
  const editItem = editTarget ? byId(editTarget.kind === "pending" ? data?.pending : data?.canonical, editTarget.id) : null;

  useEffect(() => {
    if (editItem) setEditForm(makeEditForm(editItem));
  }, [editItem]);

  const openEditor = (kind: EditKind, id: string) => {
    setEditTarget({ kind, id });
  };

  const closeEditor = () => {
    setEditTarget(null);
    setEditForm(emptyEditForm);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    let relations: Relation[];
    try {
      relations = JSON.parse(editForm.relations || "[]") as Relation[];
    } catch {
      notify("Relations JSON 解析失败", "error");
      return;
    }
    const patch = {
      title: editForm.title.trim(),
      domain: editForm.domain,
      form: editForm.form,
      abstract: editForm.abstract.trim(),
      agent: editForm.agent.trim() || null,
      human: editForm.human.trim() || null,
      temporal: { invalid_at: editForm.invalid_at.trim() || null },
      relations,
    };
    const prefix = editTarget.kind === "pending" ? "/api/pending" : "/api/canonical";
    try {
      await requestJson(`${prefix}/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      closeEditor();
      await loadState();
      notify("已保存", "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "保存失败", "error");
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);
    try {
      if (kind === "accept") {
        const result = await requestJson<{ accepted_id: string; state: ReviewState }>(
          `/api/pending/${encodeURIComponent(id)}/accept`,
          { method: "POST", body: JSON.stringify({ mode: "accept_as_new" }) },
        );
        setData(result.state);
        setSelectedPendingId(Object.keys(result.state.pending)[0] || null);
        notify(`已入库 ${result.accepted_id}`, "success");
      }
      if (kind === "reject") {
        const result = await requestJson<{ rejected_id: string; state: ReviewState }>(
          `/api/pending/${encodeURIComponent(id)}/reject`,
          { method: "POST" },
        );
        setData(result.state);
        setSelectedPendingId(Object.keys(result.state.pending)[0] || null);
        notify(`已拒绝 ${result.rejected_id}`, "success");
      }
      if (kind === "update") {
        const result = await requestJson<{ updated_id: string; state: ReviewState }>(
          `/api/pending/${encodeURIComponent(id)}/accept`,
          { method: "POST", body: JSON.stringify({ mode: "apply_update" }) },
        );
        setData(result.state);
        setSelectedPendingId(Object.keys(result.state.pending)[0] || null);
        notify(`已更新 ${result.updated_id}`, "success");
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "操作失败", "error");
    }
  };

  if (!data && loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default" }}>
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <CircularProgress size={30} />
          <Typography color="text.secondary">正在加载知识库</Typography>
        </Stack>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 3 }}>
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 480 }}>
          <Typography variant="h3" sx={{ mb: 1 }}>
            加载失败
          </Typography>
          <Typography color="text.secondary">请确认 review server 已经启动，并且 knowledge 目录可读。</Typography>
        </Paper>
        <Toast toast={toast} setToast={setToast} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "236px minmax(0, 1fr)" },
      }}
    >
      <SideNav data={data} view={view} setView={setView} />
      <Box sx={{ minWidth: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
        <TopBar
          view={view}
          data={data}
          loading={loading}
          onReload={() => {
            void loadState().then(() => notify("已刷新", "success"));
          }}
        />
        {view === "review" ? (
          <ReviewView
            data={data}
            items={pendingItems}
            selected={selectedPending}
            selectedId={selectedPendingId}
            reviewSearch={reviewSearch}
            judgmentFilter={judgmentFilter}
            domainFilter={domainFilter}
            setReviewSearch={setReviewSearch}
            setJudgmentFilter={setJudgmentFilter}
            setDomainFilter={setDomainFilter}
            setSelectedPendingId={setSelectedPendingId}
            openEditor={openEditor}
            setConfirmAction={setConfirmAction}
          />
        ) : view === "library" ? (
          <LibraryView
            data={data}
            items={canonicalItems}
            selected={selectedCanonical}
            selectedId={selectedCanonicalId}
            librarySearch={librarySearch}
            libraryFormFilter={libraryFormFilter}
            libraryDomain={libraryDomain}
            setLibrarySearch={setLibrarySearch}
            setLibraryFormFilter={setLibraryFormFilter}
            setLibraryDomain={setLibraryDomain}
            setSelectedCanonicalId={setSelectedCanonicalId}
            openEditor={openEditor}
          />
        ) : (
          <GraphView data={data} />
        )}
      </Box>
      <EditDrawer
        data={data}
        target={editTarget}
        item={editItem}
        form={editForm}
        setForm={setEditForm}
        onClose={closeEditor}
        onSave={saveEdit}
      />
      <ConfirmDialog action={confirmAction} data={data} onClose={() => setConfirmAction(null)} onConfirm={runConfirmedAction} />
      <Toast toast={toast} setToast={setToast} />
    </Box>
  );
}

function SideNav({ data, view, setView }: { data: ReviewState; view: ViewMode; setView: (view: ViewMode) => void }) {
  return (
    <Box
      component="aside"
      sx={{
        bgcolor: "background.paper",
        borderRight: { xs: 0, lg: "1px solid" },
        borderBottom: { xs: "1px solid", lg: 0 },
        borderColor: "divider",
        p: 2,
        display: "flex",
        flexDirection: { xs: "row", lg: "column" },
        gap: 2,
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={1.2} sx={{ minWidth: 0, alignItems: "center" }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            bgcolor: "#172033",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
          }}
        >
          K
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, lineHeight: 1.1 }}>Knowledge</Typography>
          <Typography variant="body2" color="text.secondary">
            Review
          </Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: "row", lg: "column" }} spacing={0.75} sx={{ minWidth: 0 }}>
        <NavButton active={view === "review"} icon={<InboxOutlinedIcon />} label="待审" onClick={() => setView("review")} />
        <NavButton
          active={view === "graph"}
          icon={<AccountTreeOutlinedIcon />}
          label="图谱"
          onClick={() => setView("graph")}
        />
        <NavButton
          active={view === "library"}
          icon={<LibraryBooksOutlinedIcon />}
          label="知识库"
          onClick={() => setView("library")}
        />
      </Stack>

      <Stack spacing={1} sx={{ mt: { xs: 0, lg: "auto" }, display: { xs: "none", lg: "flex" } }}>
        <Metric label="待审" value={data.stats.pending_count} tone="#1f6feb" />
        <Metric label="正式知识" value={data.stats.canonical_count} tone="#168a5b" />
        <Metric label="已拒绝" value={data.stats.rejected_count} tone="#c0362c" />
        <Typography variant="body2" color="text.secondary" title={data.knowledge_dir} sx={{ pt: 1 }}>
          {shortPath(data.knowledge_dir)}
        </Typography>
      </Stack>
    </Box>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      startIcon={icon}
      onClick={onClick}
      variant={active ? "contained" : "text"}
      color={active ? "primary" : "inherit"}
      sx={{
        justifyContent: "flex-start",
        px: 1.4,
        bgcolor: active ? "primary.main" : "transparent",
        color: active ? "#fff" : "text.primary",
        "&:hover": { bgcolor: active ? "primary.dark" : "action.hover" },
      }}
    >
      {label}
    </Button>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        borderRadius: 2,
        bgcolor: alpha(tone, 0.045),
        borderColor: alpha(tone, 0.18),
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 24, lineHeight: 1.15, fontWeight: 800, color: tone }}>{value}</Typography>
    </Paper>
  );
}

function TopBar({
  view,
  data,
  loading,
  onReload,
}: {
  view: ViewMode;
  data: ReviewState;
  loading: boolean;
  onReload: () => void;
}) {
  const title = view === "review" ? "待审知识" : view === "library" ? "知识库管理" : "知识图谱";
  const subtitle =
    view === "review"
      ? "直接展示 AIDA 的 update / link / new 判断，并把正式库关联与待审关联分开。"
      : view === "library"
        ? `浏览 canonical 中的 ${data.stats.canonical_count} 条正式知识。`
        : "把待审候选、正式知识和自动关联画成可检查的节点关系。";
  return (
    <Box
      component="header"
      sx={{
        minHeight: 80,
        bgcolor: "rgba(255,255,255,.92)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid",
        borderColor: "divider",
        px: { xs: 2, md: 3 },
        py: 1.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1">{title}</Typography>
        <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
      </Box>
      <Tooltip title="重新读取 knowledge 文件">
        <span>
          <Button startIcon={<RefreshIcon />} variant="outlined" onClick={onReload} disabled={loading}>
            刷新
          </Button>
        </span>
      </Tooltip>
    </Box>
  );
}

function ReviewView({
  data,
  items,
  selected,
  selectedId,
  reviewSearch,
  judgmentFilter,
  domainFilter,
  setReviewSearch,
  setJudgmentFilter,
  setDomainFilter,
  setSelectedPendingId,
  openEditor,
  setConfirmAction,
}: {
  data: ReviewState;
  items: KnowledgeItem[];
  selected: KnowledgeItem | null;
  selectedId: string | null;
  reviewSearch: string;
  judgmentFilter: string;
  domainFilter: string;
  setReviewSearch: (value: string) => void;
  setJudgmentFilter: (value: string) => void;
  setDomainFilter: (value: string) => void;
  setSelectedPendingId: (id: string) => void;
  openEditor: (kind: EditKind, id: string) => void;
  setConfirmAction: (action: { kind: ConfirmKind; id: string }) => void;
}) {
  return (
    <Box
      sx={{
        height: { xs: "auto", lg: "calc(100vh - 80px)" },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(320px, 31%) minmax(0, 1fr) minmax(340px, 28%)" },
        minWidth: 0,
      }}
    >
      <QueuePane
        data={data}
        items={items}
        selectedId={selectedId}
        reviewSearch={reviewSearch}
        judgmentFilter={judgmentFilter}
        domainFilter={domainFilter}
        setReviewSearch={setReviewSearch}
        setJudgmentFilter={setJudgmentFilter}
        setDomainFilter={setDomainFilter}
        setSelectedPendingId={setSelectedPendingId}
      />
      <PendingDetail item={selected} openEditor={openEditor} setConfirmAction={setConfirmAction} />
      <RelationPane data={data} item={selected} />
    </Box>
  );
}

function QueuePane({
  data,
  items,
  selectedId,
  reviewSearch,
  judgmentFilter,
  domainFilter,
  setReviewSearch,
  setJudgmentFilter,
  setDomainFilter,
  setSelectedPendingId,
}: {
  data: ReviewState;
  items: KnowledgeItem[];
  selectedId: string | null;
  reviewSearch: string;
  judgmentFilter: string;
  domainFilter: string;
  setReviewSearch: (value: string) => void;
  setJudgmentFilter: (value: string) => void;
  setDomainFilter: (value: string) => void;
  setSelectedPendingId: (id: string) => void;
}) {
  return (
    <Box
      sx={{
        borderRight: { xs: 0, lg: "1px solid" },
        borderBottom: { xs: "1px solid", lg: 0 },
        borderColor: "divider",
        p: 2,
        overflow: "auto",
        minWidth: 0,
        maxHeight: { xs: "46vh", lg: "none" },
      }}
    >
      <Stack spacing={1.3}>
        <TextField
          size="small"
          placeholder="搜索标题、摘要、正文、证据"
          value={reviewSearch}
          onChange={(event) => setReviewSearch(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="判类"
            value={judgmentFilter}
            onChange={(event) => setJudgmentFilter(event.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="none">NEW</MenuItem>
            <MenuItem value="link">LINK</MenuItem>
            <MenuItem value="update">UPDATE</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="领域"
            value={domainFilter}
            onChange={(event) => setDomainFilter(event.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="">全部</MenuItem>
            {data.domains.map((domain) => (
              <MenuItem key={domain} value={domain}>
                {domain}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          {["none", "link", "update"].map((key) => (
            <JudgmentCountChip key={key} value={key} count={data.stats.pending_by_judgment[key] || 0} />
          ))}
        </Stack>
        <Divider />
        <Stack spacing={1}>
          {items.length ? (
            items.map((item) => (
              <CandidateRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onClick={() => setSelectedPendingId(item.id)}
              />
            ))
          ) : (
            <EmptyState title="没有匹配的待审候选" subtitle="调整筛选条件后再试。" />
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

function JudgmentCountChip({ value, count }: { value: string; count: number }) {
  const tone = judgmentTone(value);
  return (
    <Chip
      size="small"
      icon={tone.icon}
      label={`${judgmentCode(value)} ${count}`}
      sx={{
        bgcolor: tone.bg,
        color: tone.main,
        border: "1px solid",
        borderColor: tone.border,
        "& .MuiChip-icon": { color: tone.main },
      }}
    />
  );
}

function CandidateRow({ item, active, onClick }: { item: KnowledgeItem; active: boolean; onClick: () => void }) {
  const tone = judgmentTone(item.m1_judgment);
  const relationCount = (item.relations || []).length;
  return (
    <Paper
      component="button"
      type="button"
      onClick={onClick}
      variant="outlined"
      sx={{
        width: "100%",
        p: 1.35,
        display: "block",
        textAlign: "left",
        borderRadius: 2,
        borderColor: active ? tone.main : "divider",
        bgcolor: active ? alpha(tone.main, 0.055) : "background.paper",
        boxShadow: active ? `0 0 0 2px ${alpha(tone.main, 0.16)}` : "none",
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        "&:before": {
          content: '""',
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          bgcolor: tone.main,
        },
        "&:hover": {
          borderColor: tone.main,
          bgcolor: alpha(tone.main, 0.045),
        },
      }}
    >
      <Stack spacing={0.8} sx={{ pl: 0.45 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 800, minWidth: 0, pr: 1 }} className="truncate-two">
            {item.title}
          </Typography>
          <JudgmentChip value={item.m1_judgment} />
        </Stack>
        <Typography variant="body2" color="text.secondary" className="truncate-two">
          {item.abstract}
        </Typography>
        <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip size="small" variant="outlined" label={item.domain} />
          <Chip size="small" variant="outlined" label={item.form} />
          <Chip size="small" variant="outlined" label={`${relationCount} links`} />
          <Chip size="small" variant="outlined" label={text(item.attribution?.claim_owner)} />
        </Stack>
      </Stack>
    </Paper>
  );
}

function JudgmentChip({ value }: { value?: string }) {
  const tone = judgmentTone(value);
  return (
    <Chip
      size="small"
      icon={tone.icon}
      label={judgmentCode(value)}
      sx={{
        bgcolor: tone.bg,
        color: tone.main,
        border: "1px solid",
        borderColor: tone.border,
        minWidth: 92,
        "& .MuiChip-icon": { color: tone.main },
      }}
    />
  );
}

function PendingDetail({
  item,
  openEditor,
  setConfirmAction,
}: {
  item: KnowledgeItem | null;
  openEditor: (kind: EditKind, id: string) => void;
  setConfirmAction: (action: { kind: ConfirmKind; id: string }) => void;
}) {
  if (!item) {
    return (
      <Box sx={{ p: 2, overflow: "auto", minWidth: 0 }}>
        <EmptyState title="暂无待审候选" subtitle="merge 之后的新候选会出现在这里。" />
      </Box>
    );
  }

  const relationCount = (item.relations || []).length;
  const source = item.source || {};
  const attr = item.attribution || {};

  return (
    <Box sx={{ p: 2.2, overflow: "auto", minWidth: 0 }}>
      <DecisionBanner item={item} relationCount={relationCount} />
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ p: 2.2 }}>
          <Stack spacing={1.1}>
            <Typography variant="h2">{item.title}</Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip size="small" variant="outlined" label={item.id} />
              <Chip size="small" variant="outlined" label={item.domain} />
              <Chip size="small" variant="outlined" label={item.form} />
              <Chip size="small" variant="outlined" label={`${text(attr.kind)} / ${text(attr.claim_owner)} / ${text(attr.adoption)}`} />
            </Stack>
          </Stack>
        </Box>
        <Divider />
        <DetailSection title="摘要">
          <Typography className="pre-wrap">{item.abstract}</Typography>
        </DetailSection>
        <DetailSection title="Agent / Human">
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5 }}>
            <InfoBlock title="Agent" text={item.agent} />
            <InfoBlock title="Human" text={item.human} />
          </Box>
        </DetailSection>
        <DetailSection title="证据">
          <Box
            sx={{
              borderLeft: "3px solid",
              borderColor: "divider",
              bgcolor: "#f8fafc",
              px: 1.5,
              py: 1.2,
              borderRadius: "0 8px 8px 0",
            }}
          >
            <Typography className="pre-wrap" color="text.secondary">
              {text(source.evidence_quote)}
            </Typography>
          </Box>
        </DetailSection>
        <DetailSection title="元数据">
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }, gap: 1 }}>
            <Field label="Session" value={source.session_id} />
            <Field label="Turn" value={Array.isArray(source.turn_range) ? source.turn_range.join(" - ") : ""} />
            <Field label="Extracted" value={source.extracted_at} />
            <Field label="Status" value={item.audit_status} />
            <Field label="Use Count" value={item.weight?.use_count} />
            <Field label="Invalid At" value={item.temporal?.invalid_at} />
          </Box>
        </DetailSection>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ p: 1.5, bgcolor: "#fbfcfe", borderTop: "1px solid", borderColor: "divider", flexWrap: "wrap" }}
        >
          <Button
            startIcon={<CheckCircleOutlineIcon />}
            variant="contained"
            color="success"
            onClick={() => setConfirmAction({ kind: "accept", id: item.id })}
          >
            接受入库
          </Button>
          {item.m1_judgment === "update" ? (
            <Button startIcon={<UpdateIcon />} variant="contained" color="warning" onClick={() => setConfirmAction({ kind: "update", id: item.id })}>
              应用更新
            </Button>
          ) : null}
          <Button startIcon={<EditOutlinedIcon />} variant="outlined" onClick={() => openEditor("pending", item.id)}>
            编辑
          </Button>
          <Button startIcon={<DeleteOutlineIcon />} variant="outlined" color="error" onClick={() => setConfirmAction({ kind: "reject", id: item.id })}>
            拒绝
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

function DecisionBanner({ item, relationCount }: { item: KnowledgeItem; relationCount: number }) {
  const tone = judgmentTone(item.m1_judgment);
  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 1.5,
        p: 1.6,
        borderRadius: 2,
        borderColor: tone.border,
        bgcolor: tone.bg,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.2}
        sx={{ alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between" }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: "#fff",
              color: tone.main,
              display: "grid",
              placeItems: "center",
              border: "1px solid",
              borderColor: tone.border,
            }}
          >
            {tone.icon}
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 850, color: tone.main }}>
              AIDA 自动判断：{judgmentLabel(item.m1_judgment)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {judgmentDetail(item.m1_judgment, relationCount)}
            </Typography>
          </Box>
        </Stack>
        <JudgmentChip value={item.m1_judgment} />
      </Stack>
    </Paper>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
      <Typography
        variant="body2"
        sx={{ mb: 0.85, color: "text.secondary", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4 }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function InfoBlock({ title, text: value }: { title: string; text?: string | null }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "#fbfcfe", borderRadius: 2, p: 1.25 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 800, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography className="pre-wrap">{text(value)}</Typography>
    </Box>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", bgcolor: "#fbfcfe", borderRadius: 2, p: 1.1, minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography className="pre-wrap" sx={{ fontWeight: 650 }}>
        {text(value)}
      </Typography>
    </Box>
  );
}

function RelationPane({ data, item }: { data: ReviewState; item: KnowledgeItem | null }) {
  if (!item) {
    return (
      <Box
        sx={{
          borderLeft: { xs: 0, lg: "1px solid" },
          borderColor: "divider",
          p: 2,
          bgcolor: "#fbfcfe",
          overflow: "auto",
        }}
      />
    );
  }

  const relations = item.relations || [];
  const canonicalRels = relations.filter((rel) => inferRelationTarget(rel) === "canonical");
  const pendingRels = relations.filter((rel) => inferRelationTarget(rel) === "pending");

  return (
    <Box
      sx={{
        borderLeft: { xs: 0, lg: "1px solid" },
        borderColor: "divider",
        p: 2,
        bgcolor: "#fbfcfe",
        overflow: "auto",
        minWidth: 0,
      }}
    >
      <Stack spacing={1.6}>
        {item.m1_judgment === "update" ? <UpdateTargetBlock item={item} data={data} /> : null}
        <RelationGroup title="正式知识关联" subtitle="写入 canonical 时只保留这一组正式关系" relations={canonicalRels} data={data} />
        <RelationGroup title="建议一起审核" subtitle="待审之间的临时关系，只作为审核上下文" relations={pendingRels} data={data} />
      </Stack>
    </Box>
  );
}

function UpdateTargetBlock({ item, data }: { item: KnowledgeItem; data: ReviewState }) {
  const neighbor = item.m1_neighbors?.[0];
  const target = neighbor?.id ? byId(data.canonical, neighbor.id) : null;
  const preview = parseMergePreview(item.m1_merge_preview);
  return (
    <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2, borderColor: "#f0c979", bgcolor: "#fffaf0" }}>
      <SectionHeading title="更新对照" subtitle="左侧是当前正式知识，右侧是应用更新后的结构化版本。" />
      <Stack spacing={1.1}>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip size="small" color="warning" variant="outlined" label={`目标 ${text(neighbor?.id, "未指定")}`} />
          <Chip size="small" variant="outlined" label={target?.title || "目标不存在"} />
          <Chip size="small" variant="outlined" label={`sim ${text(neighbor?.sim)}`} />
        </Stack>
        {target && preview ? (
          <UpdatePreviewCompare target={target} preview={preview} />
        ) : (
          <Box sx={{ borderLeft: "3px solid", borderColor: "#f0c979", bgcolor: "#fff", px: 1.5, py: 1.2, borderRadius: "0 8px 8px 0" }}>
            <Typography variant="body2" className="pre-wrap" color="text.secondary">
              {text(item.m1_merge_preview, "缺少 m1_merge_preview")}
            </Typography>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

function UpdatePreviewCompare({ target, preview }: { target: KnowledgeItem; preview: UpdatePreview }) {
  const fields: Array<{ key: keyof UpdatePreview; label: string }> = [
    { key: "title", label: "标题" },
    { key: "abstract", label: "摘要" },
    { key: "agent", label: "Agent" },
    { key: "human", label: "Human" },
  ];
  return (
    <Box sx={{ border: "1px solid", borderColor: "#f0c979", bgcolor: "#fff", borderRadius: 2, overflow: "hidden" }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          bgcolor: "#fff7e8",
          borderBottom: "1px solid",
          borderColor: "#f0c979",
        }}
      >
        <CompareHeader title="当前正式知识" subtitle={target.id} />
        <CompareHeader title="应用更新后" subtitle="m1_merge_preview" />
      </Box>
      <Stack divider={<Divider flexItem />} spacing={0}>
        {fields.map((field) => (
          <UpdateCompareRow
            key={field.key}
            label={field.label}
            before={target[field.key]}
            after={preview[field.key]}
          />
        ))}
      </Stack>
    </Box>
  );
}

function CompareHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ px: 1.25, py: 1 }}>
      <Typography variant="body2" sx={{ fontWeight: 850 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </Box>
  );
}

function UpdateCompareRow({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const changed = text(before) !== text(after);
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, position: "relative" }}>
      <CompareCell label={label} value={before} tone="before" changed={changed} />
      <CompareCell label={label} value={after} tone="after" changed={changed} />
    </Box>
  );
}

function CompareCell({
  label,
  value,
  tone,
  changed,
}: {
  label: string;
  value: unknown;
  tone: "before" | "after";
  changed: boolean;
}) {
  const isAfter = tone === "after";
  return (
    <Box
      sx={{
        minWidth: 0,
        p: 1.25,
        borderLeft: { xs: 0, md: isAfter ? "1px solid" : 0 },
        borderTop: { xs: isAfter ? "1px solid" : 0, md: 0 },
        borderColor: "divider",
        bgcolor: isAfter && changed ? "#fffaf0" : "#fff",
      }}
    >
      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 800, mb: 0.45 }}>
        {label}
      </Typography>
      <Typography variant="body2" className="pre-wrap" sx={{ fontWeight: isAfter && changed ? 650 : 400 }}>
        {text(value)}
      </Typography>
    </Box>
  );
}

function RelationGroup({
  title,
  subtitle,
  relations,
  data,
}: {
  title: string;
  subtitle: string;
  relations: Relation[];
  data: ReviewState;
}) {
  return (
    <Box>
      <SectionHeading title={title} subtitle={subtitle} />
      <Stack spacing={1}>
        {relations.length ? (
          relations.map((rel, index) => <RelationCard key={`${rel.id}-${index}`} rel={rel} data={data} />)
        ) : (
          <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2, bgcolor: "#fff" }}>
            <Typography variant="body2" color="text.secondary">
              没有关联。
            </Typography>
          </Paper>
        )}
      </Stack>
    </Box>
  );
}

function RelationCard({ rel, data }: { rel: Relation; data: ReviewState }) {
  const target = inferRelationTarget(rel);
  const targetItem = target === "canonical" ? byId(data.canonical, rel.id) : byId(data.pending, rel.id);
  return (
    <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2, bgcolor: "#fff", boxShadow: "none" }}>
      <Stack spacing={0.7}>
        <Typography sx={{ fontWeight: 800 }}>{targetItem?.title || "目标不存在"}</Typography>
        <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip size="small" color={target === "canonical" ? "success" : "primary"} variant="outlined" label={target === "canonical" ? "正式" : "待审"} />
          <Chip size="small" variant="outlined" label={rel.type || "link"} />
          <Chip size="small" variant="outlined" label={rel.id} />
        </Stack>
        <Typography variant="body2" className="pre-wrap" color="text.secondary">
          {text(rel.reason)}
        </Typography>
      </Stack>
    </Paper>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box sx={{ mb: 0.8 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
    </Box>
  );
}

const graphNodeWidth = 304;
const graphNodeHeight = 92;

function GraphView({ data }: { data: ReviewState }) {
  const graph = useMemo(() => buildGraph(data), [data]);
  const nodesById = useMemo(() => Object.fromEntries(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const linkCount = graph.edges.filter((edge) => edge.type === "link").length;
  const updateCount = graph.edges.filter((edge) => edge.type === "update").length;

  return (
    <Box sx={{ height: { xs: "auto", lg: "calc(100vh - 80px)" }, overflow: "auto", p: 2.4, minWidth: 0 }}>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 320px" }, gap: 2, minHeight: "100%" }}>
        <Paper variant="outlined" sx={{ p: 1.6, borderRadius: 2, minWidth: 0, bgcolor: "#fff" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" } }}>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
              <Chip size="small" color="primary" variant="outlined" label={`link ${linkCount}`} />
              <Chip size="small" color="warning" variant="outlined" label={`update ${updateCount}`} />
              <Chip size="small" variant="outlined" label={`节点 ${graph.nodes.length}`} />
            </Stack>
            <Stack direction="row" spacing={1.2} sx={{ alignItems: "center" }}>
              <GraphLegend color="#1f6feb" label="link" />
              <GraphLegend color="#b56a00" label="update" />
            </Stack>
          </Stack>

          {graph.edges.length ? (
            <Box sx={{ mt: 1.6, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2, bgcolor: "#f8fafc" }}>
              <Box sx={{ position: "relative", width: graph.width, height: graph.height, minWidth: graph.width }}>
                <svg width={graph.width} height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} style={{ position: "absolute", inset: 0 }}>
                  <defs>
                    <marker id="graph-arrow-link" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f6feb" />
                    </marker>
                    <marker id="graph-arrow-update" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#b56a00" />
                    </marker>
                  </defs>
                  {graph.edges.map((edge) => (
                    <GraphEdgePath key={edge.id} edge={edge} nodesById={nodesById} />
                  ))}
                </svg>
                {graph.nodes.map((node) => (
                  <GraphNodeCard key={node.id} node={node} />
                ))}
              </Box>
            </Box>
          ) : (
            <EmptyState title="暂无可视化关系" subtitle="待审或正式知识里出现 link / update 后会生成图谱。" />
          )}
        </Paper>
        <GraphRelationList graph={graph} nodesById={nodesById} />
      </Box>
    </Box>
  );
}

function GraphLegend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.6} sx={{ alignItems: "center" }}>
      <Box sx={{ width: 28, height: 3, bgcolor: color, borderRadius: 999 }} />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}

function GraphEdgePath({ edge, nodesById }: { edge: GraphEdge; nodesById: Record<string, GraphNode> }) {
  const source = nodesById[edge.sourceId];
  const target = nodesById[edge.targetId];
  if (!source || !target) return null;
  const sourceOnLeft = source.x <= target.x;
  const sx = source.x + (sourceOnLeft ? graphNodeWidth : 0);
  const sy = source.y + graphNodeHeight / 2;
  const tx = target.x + (sourceOnLeft ? 0 : graphNodeWidth);
  const ty = target.y + graphNodeHeight / 2;
  const sameLane = Math.abs(source.x - target.x) < 20;
  const c1x = sameLane ? sx + 92 : sx + (sourceOnLeft ? 165 : -165);
  const c2x = sameLane ? tx + 92 : tx + (sourceOnLeft ? -165 : 165);
  const path = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;
  const color = edge.type === "update" ? "#b56a00" : "#1f6feb";
  const marker = edge.type === "update" ? "url(#graph-arrow-update)" : "url(#graph-arrow-link)";
  return <path d={path} fill="none" stroke={color} strokeWidth={2.3} strokeLinecap="round" markerEnd={marker} opacity={0.86} />;
}

function GraphNodeCard({ node }: { node: GraphNode }) {
  const pending = node.kind === "pending";
  const isUpdate = node.item.m1_judgment === "update";
  const tone = pending ? (isUpdate ? "#b56a00" : "#1f6feb") : "#168a5b";
  return (
    <Paper
      variant="outlined"
      sx={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: graphNodeWidth,
        height: graphNodeHeight,
        p: 1.2,
        borderRadius: 2,
        borderColor: alpha(tone, 0.42),
        bgcolor: "#fff",
        boxShadow: `0 8px 20px ${alpha("#172033", 0.07)}`,
        overflow: "hidden",
      }}
    >
      <Stack spacing={0.65}>
        <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Chip size="small" color={pending ? "primary" : "success"} variant="outlined" label={pending ? "待审" : "正式"} />
          <Chip size="small" variant="outlined" label={node.item.m1_judgment ? judgmentCode(node.item.m1_judgment) : node.item.form} />
          <Typography variant="body2" color="text.secondary" sx={{ ml: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {node.id}
          </Typography>
        </Stack>
        <Typography sx={{ fontWeight: 850, lineHeight: 1.25 }} className="truncate-two">
          {node.item.title}
        </Typography>
      </Stack>
    </Paper>
  );
}

function GraphRelationList({ graph, nodesById }: { graph: { edges: GraphEdge[] }; nodesById: Record<string, GraphNode> }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.6, borderRadius: 2, bgcolor: "#fff", minWidth: 0 }}>
      <SectionHeading title="关系列表" subtitle="和图谱中的线一一对应。" />
      <Stack spacing={1}>
        {graph.edges.length ? (
          graph.edges.map((edge) => {
            const source = nodesById[edge.sourceId];
            const target = nodesById[edge.targetId];
            return (
              <Paper key={edge.id} variant="outlined" sx={{ p: 1.2, borderRadius: 2, bgcolor: edge.type === "update" ? "#fffaf0" : "#fbfcfe" }}>
                <Stack spacing={0.7}>
                  <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap" }}>
                    <Chip size="small" color={edge.type === "update" ? "warning" : "primary"} variant="outlined" label={edge.type} />
                    <Chip size="small" variant="outlined" label={`${edge.sourceId} → ${edge.targetId}`} />
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 800 }} className="truncate-two">
                    {source?.item.title || edge.sourceId}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" className="truncate-two">
                    {target?.item.title || edge.targetId}
                  </Typography>
                  {edge.reason ? (
                    <Typography variant="body2" color="text.secondary" className="pre-wrap">
                      {edge.reason}
                    </Typography>
                  ) : null}
                </Stack>
              </Paper>
            );
          })
        ) : (
          <EmptyState title="没有关系" subtitle="当前数据里没有可展示的 link 或 update。" />
        )}
      </Stack>
    </Paper>
  );
}

function LibraryView({
  data,
  items,
  selected,
  selectedId,
  librarySearch,
  libraryFormFilter,
  libraryDomain,
  setLibrarySearch,
  setLibraryFormFilter,
  setLibraryDomain,
  setSelectedCanonicalId,
  openEditor,
}: {
  data: ReviewState;
  items: KnowledgeItem[];
  selected: KnowledgeItem | null;
  selectedId: string | null;
  librarySearch: string;
  libraryFormFilter: string;
  libraryDomain: string;
  setLibrarySearch: (value: string) => void;
  setLibraryFormFilter: (value: string) => void;
  setLibraryDomain: (value: string) => void;
  setSelectedCanonicalId: (id: string) => void;
  openEditor: (kind: EditKind, id: string) => void;
}) {
  return (
    <Box
      sx={{
        height: { xs: "auto", lg: "calc(100vh - 80px)" },
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "220px minmax(0, 1fr) minmax(340px, 30%)" },
      }}
    >
      <Box sx={{ borderRight: { xs: 0, lg: "1px solid" }, borderColor: "divider", p: 2, overflow: "auto" }}>
        <SectionHeading title="领域" />
        <Stack spacing={0.75}>
          {["", ...data.domains].map((domain) => (
            <Button
              key={domain || "_all"}
              variant={domain === libraryDomain ? "contained" : "text"}
              color={domain === libraryDomain ? "primary" : "inherit"}
              onClick={() => setLibraryDomain(domain)}
              sx={{ justifyContent: "flex-start" }}
            >
              {domain || "全部"}
            </Button>
          ))}
        </Stack>
      </Box>
      <Box sx={{ p: 2, overflow: "auto", minWidth: 0 }}>
        <Stack spacing={1.4}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              size="small"
              placeholder="搜索正式知识"
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              size="small"
              label="形态"
              value={libraryFormFilter}
              onChange={(event) => setLibraryFormFilter(event.target.value)}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">全部</MenuItem>
              <MenuItem value="practice">practice</MenuItem>
              <MenuItem value="methodology">methodology</MenuItem>
              <MenuItem value="theory">theory</MenuItem>
            </TextField>
          </Stack>
          <Stack spacing={1}>
            {items.length ? (
              items.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  active={item.id === selectedId}
                  onClick={() => setSelectedCanonicalId(item.id)}
                />
              ))
            ) : (
              <EmptyState title="暂无已入库知识" subtitle="先在待审页接受候选，正式知识会出现在这里。" />
            )}
          </Stack>
        </Stack>
      </Box>
      <Box
        sx={{
          borderLeft: { xs: 0, lg: "1px solid" },
          borderColor: "divider",
          p: 2,
          bgcolor: "#fbfcfe",
          overflow: "auto",
          minWidth: 0,
        }}
      >
        <LibraryInspector item={selected} data={data} openEditor={openEditor} />
      </Box>
    </Box>
  );
}

function LibraryRow({ item, active, onClick }: { item: KnowledgeItem; active: boolean; onClick: () => void }) {
  const theme = useTheme();
  return (
    <Paper
      component="button"
      type="button"
      variant="outlined"
      onClick={onClick}
      sx={{
        width: "100%",
        p: 1.45,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: 1,
        textAlign: "left",
        cursor: "pointer",
        borderRadius: 2,
        borderColor: active ? "primary.main" : "divider",
        bgcolor: active ? alpha(theme.palette.primary.main, 0.055) : "background.paper",
        boxShadow: active ? `0 0 0 2px ${alpha(theme.palette.primary.main, 0.13)}` : "none",
      }}
    >
      <Stack spacing={0.7} sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 800 }} className="truncate-two">
          {item.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" className="truncate-two">
          {item.abstract}
        </Typography>
        <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Chip size="small" variant="outlined" label={item.domain} />
          <Chip size="small" variant="outlined" label={item.form} />
          <Chip size="small" variant="outlined" label={`${(item.relations || []).length} links`} />
        </Stack>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
        {item.id}
      </Typography>
    </Paper>
  );
}

function LibraryInspector({
  item,
  data,
  openEditor,
}: {
  item: KnowledgeItem | null;
  data: ReviewState;
  openEditor: (kind: EditKind, id: string) => void;
}) {
  if (!item) return <EmptyState title="没有选中的知识" subtitle="正式库为空或筛选后无结果。" />;
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", bgcolor: "#fff" }}>
      <Box sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Typography variant="h3">{item.title}</Typography>
          <Stack direction="row" spacing={0.65} useFlexGap sx={{ flexWrap: "wrap" }}>
            <Chip size="small" variant="outlined" label={item.id} />
            <Chip size="small" variant="outlined" label={item.domain} />
            <Chip size="small" variant="outlined" label={item.form} />
            <Chip size="small" variant="outlined" label={text(item.audit_status)} />
          </Stack>
        </Stack>
      </Box>
      <Divider />
      <DetailSection title="摘要">
        <Typography className="pre-wrap">{item.abstract}</Typography>
      </DetailSection>
      <DetailSection title="Agent">
        <Typography className="pre-wrap">{text(item.agent)}</Typography>
      </DetailSection>
      <DetailSection title="Human">
        <Typography className="pre-wrap">{text(item.human)}</Typography>
      </DetailSection>
      <DetailSection title="Relations">
        <Stack spacing={1}>
          {(item.relations || []).length ? (
            (item.relations || []).map((rel, index) => <RelationCard key={`${rel.id}-${index}`} rel={rel} data={data} />)
          ) : (
            <Typography color="text.secondary">—</Typography>
          )}
        </Stack>
      </DetailSection>
      <Stack direction="row" spacing={1} sx={{ p: 1.5, bgcolor: "#fbfcfe", borderTop: "1px solid", borderColor: "divider" }}>
        <Button startIcon={<EditOutlinedIcon />} variant="outlined" onClick={() => openEditor("canonical", item.id)}>
          编辑
        </Button>
      </Stack>
    </Paper>
  );
}

function EditDrawer({
  data,
  target,
  item,
  form,
  setForm,
  onClose,
  onSave,
}: {
  data: ReviewState;
  target: { kind: EditKind; id: string } | null;
  item: KnowledgeItem | null;
  form: EditForm;
  setForm: (form: EditForm) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const readonly = item
    ? JSON.stringify(
        {
          source: item.source,
          attribution: item.attribution,
          m1_judgment: item.m1_judgment,
          m1_neighbors: item.m1_neighbors,
          m1_merge_preview: item.m1_merge_preview,
        },
        null,
        2,
      )
    : "";

  const updateField = (key: keyof EditForm, value: string) => {
    setForm({ ...form, [key]: value });
  };

  return (
    <Drawer anchor="right" open={Boolean(target && item)} onClose={onClose} slotProps={{ paper: { sx: { width: "min(760px, 100vw)" } } }}>
      <Box sx={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ p: 2.4, borderBottom: "1px solid", borderColor: "divider", alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h2">{target?.kind === "pending" ? "编辑待审候选" : "编辑正式知识"}</Typography>
            <Typography variant="body2" color="text.secondary">
              {item ? `${item.id} · ${item.domain} · ${item.form}` : ""}
            </Typography>
          </Box>
          <Tooltip title="关闭">
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Tooltip>
        </Stack>
        <Stack spacing={1.6} sx={{ p: 2.4, overflow: "auto" }}>
          <TextField label="标题" value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.4 }}>
            <TextField select label="领域" value={form.domain} onChange={(event) => updateField("domain", event.target.value)}>
              {data.domains.map((domain) => (
                <MenuItem key={domain} value={domain}>
                  {domain}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="形态" value={form.form} onChange={(event) => updateField("form", event.target.value)}>
              <MenuItem value="practice">practice</MenuItem>
              <MenuItem value="methodology">methodology</MenuItem>
              <MenuItem value="theory">theory</MenuItem>
            </TextField>
          </Box>
          <TextField
            label="摘要"
            value={form.abstract}
            onChange={(event) => updateField("abstract", event.target.value)}
            multiline
            minRows={4}
            required
          />
          <TextField label="Agent" value={form.agent} onChange={(event) => updateField("agent", event.target.value)} multiline minRows={5} />
          <TextField label="Human" value={form.human} onChange={(event) => updateField("human", event.target.value)} multiline minRows={5} />
          <TextField label="失效时间" value={form.invalid_at} onChange={(event) => updateField("invalid_at", event.target.value)} placeholder="ISO time 或留空" />
          <TextField
            label="Relations JSON"
            value={form.relations}
            onChange={(event) => updateField("relations", event.target.value)}
            multiline
            minRows={7}
            slotProps={{ htmlInput: { spellCheck: false } }}
          />
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#fbfcfe", borderRadius: 2 }}>
            <SectionHeading title="只读来源" />
            <Typography component="pre" variant="body2" className="pre-wrap" sx={{ m: 0 }}>
              {readonly}
            </Typography>
          </Paper>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ p: 1.5, borderTop: "1px solid", borderColor: "divider", bgcolor: "#fff", justifyContent: "flex-end" }}>
          <Button variant="outlined" onClick={onClose}>
            取消
          </Button>
          <Button variant="contained" onClick={onSave}>
            保存
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}

function ConfirmDialog({
  action,
  data,
  onClose,
  onConfirm,
}: {
  action: { kind: ConfirmKind; id: string } | null;
  data: ReviewState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const item = action ? byId(data.pending, action.id) : null;
  const copy =
    action?.kind === "accept"
      ? { title: "确认接受入库？", body: "这会把候选从 pending 移入 canonical，并更新剩余待审候选中的临时关系。" }
      : action?.kind === "reject"
        ? { title: "确认拒绝？", body: "这会把候选移入 rejected，并清理其他待审候选指向它的临时关系。" }
        : { title: "确认应用更新？", body: "这会用结构化融合预览覆盖旧 canonical 的 title / abstract / agent / human。" };
  return (
    <Dialog open={Boolean(action)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{copy.body}</DialogContentText>
        {item ? (
          <Typography sx={{ mt: 1.5, fontWeight: 800 }} className="truncate-two">
            {item.title}
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button onClick={onConfirm} variant="contained" color={action?.kind === "reject" ? "error" : "primary"}>
          确认
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Toast({ toast, setToast }: { toast: ToastState; setToast: (toast: ToastState) => void }) {
  return (
    <Snackbar
      open={toast.open}
      autoHideDuration={2600}
      onClose={() => setToast({ ...toast, open: false })}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity={toast.severity} variant="filled" sx={{ borderRadius: 2 }}>
        {toast.message}
      </Alert>
    </Snackbar>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 2,
        textAlign: "center",
        bgcolor: "#fff",
      }}
    >
      <Typography sx={{ fontWeight: 800, mb: 0.5 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
    </Paper>
  );
}
