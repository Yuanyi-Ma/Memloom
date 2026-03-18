import fs from 'fs';
import os from 'os';
import path from 'path';

type Req = { method: string; url: string; query: Record<string, string | undefined>; body?: any; params: Record<string, string> };
type Res = {
  status(code: number): Res;
  json(data: unknown): void;
  send(data: string): void;
  setHeader(key: string, value: string): void;
  write(chunk: string): void;
  end(): void;
};

interface SkillSection {
  content: string;
  editable: boolean;
  label: string;
}

interface SkillResponse {
  id: string;
  name: string;
  description: string;
  sections: SkillSection[];
}

// Skills 安装目录：install.sh 将 skills 软链接到 ~/.openclaw/skills/kb-*
const SKILLS_DIR = path.join(os.homedir(), '.openclaw', 'skills');

/**
 * 每个 Skill 的可编辑区域定义。
 * startMarker: 可编辑区域开始的标题（含该行）
 * endMarker: 可编辑区域结束的标题（不含该行，该行属于只读尾部）
 */
const SKILL_EDITABLE_REGIONS: Record<string, {
  startMarker: string;
  endMarker: string;
  editableLabel: string;
  headerLabel: string;
  footerLabel: string;
}> = {
  'kb-active-capture': {
    startMarker: '## 步骤一：基础过滤',
    endMarker: '## 步骤三：生成 JSON',
    editableLabel: '知识筛选规则',
    headerLabel: '触发场景与任务目标',
    footerLabel: '归档格式与入库流程',
  },
  'kb-file-import': {
    startMarker: '## 提取规则',
    endMarker: '## 步骤一：提取并将结果转为',
    editableLabel: '提取策略与筛选规则',
    headerLabel: '触发场景与任务目标',
    footerLabel: '归档格式与入库流程',
  },
  'kb-feynman-review': {
    startMarker: '## 导师角色',
    endMarker: '## 附属功能',
    editableLabel: '导师风格与引导方式',
    headerLabel: '复习任务说明',
    footerLabel: '新知识捕获与入库',
  },
};

function parseFrontmatter(raw: string): { name: string; description: string; body: string } | null {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1]!;
  const body = fmMatch[2]!.trim();

  let name = '';
  let description = '';
  for (const line of frontmatter.split('\n')) {
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim();
    if (key?.trim() === 'name') name = val;
    if (key?.trim() === 'description') description = val;
  }

  return { name, description, body };
}

function splitIntoSections(skillId: string, body: string): SkillSection[] {
  const region = SKILL_EDITABLE_REGIONS[skillId];
  if (!region) {
    // 未定义区域 → 全部只读
    return [{ content: body, editable: false, label: '指令内容' }];
  }

  const lines = body.split('\n');
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (startIdx === -1 && lines[i]!.startsWith(region.startMarker)) {
      startIdx = i;
    }
    if (startIdx !== -1 && endIdx === -1 && i > startIdx && lines[i]!.startsWith(region.endMarker)) {
      endIdx = i;
    }
  }

  if (startIdx === -1) {
    return [{ content: body, editable: false, label: '指令内容' }];
  }
  if (endIdx === -1) endIdx = lines.length;

  const header = lines.slice(0, startIdx).join('\n').trim();
  const editable = lines.slice(startIdx, endIdx).join('\n').trim();
  const footer = lines.slice(endIdx).join('\n').trim();

  const sections: SkillSection[] = [];
  if (header) sections.push({ content: header, editable: false, label: region.headerLabel });
  sections.push({ content: editable, editable: true, label: region.editableLabel });
  if (footer) sections.push({ content: footer, editable: false, label: region.footerLabel });

  return sections;
}

function reconstructBody(skillId: string, sections: SkillSection[]): string {
  return sections.map(s => s.content).join('\n\n') + '\n';
}

export function createSkillsHandler(): (req: Req, res: Res) => Promise<boolean> | boolean {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).json({});
      return true;
    }

    const urlPath = req.url.replace(/\?.*$/, '');

    // GET /api/skills — 列出所有 skills（简要信息）
    if (req.method === 'GET' && !urlPath.match(/\/api\/skills\/.+/)) {
      try {
        if (!fs.existsSync(SKILLS_DIR)) {
          res.status(200).json({ skills: [] });
          return true;
        }
        const dirs = fs.readdirSync(SKILLS_DIR).filter(d =>
          d.startsWith('kb-') && fs.statSync(path.join(SKILLS_DIR, d)).isDirectory()
        );
        const skills: SkillResponse[] = [];
        for (const dir of dirs) {
          const skillFile = path.join(SKILLS_DIR, dir, 'SKILL.md');
          if (fs.existsSync(skillFile)) {
            const raw = fs.readFileSync(skillFile, 'utf-8');
            const parsed = parseFrontmatter(raw);
            if (parsed) {
              skills.push({
                id: dir,
                name: parsed.name,
                description: parsed.description,
                sections: splitIntoSections(dir, parsed.body),
              });
            }
          }
        }
        res.status(200).json({ skills });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
      return true;
    }

    // GET /api/skills/:id — 获取单个 skill（含分区）
    const idMatch = urlPath.match(/\/api\/skills\/([^/]+)$/);
    if (req.method === 'GET' && idMatch) {
      const id = idMatch[1]!;
      const skillFile = path.join(SKILLS_DIR, id, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        res.status(404).json({ error: 'Skill not found' });
        return true;
      }
      const raw = fs.readFileSync(skillFile, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) {
        res.status(500).json({ error: 'Failed to parse skill' });
        return true;
      }
      res.status(200).json({
        id,
        name: parsed.name,
        description: parsed.description,
        sections: splitIntoSections(id, parsed.body),
      });
      return true;
    }

    // PUT /api/skills/:id — 只更新可编辑区域
    if (req.method === 'PUT' && idMatch) {
      const id = idMatch[1]!;
      const skillFile = path.join(SKILLS_DIR, id, 'SKILL.md');
      if (!fs.existsSync(skillFile)) {
        res.status(404).json({ error: 'Skill not found' });
        return true;
      }

      const { editableContent } = req.body as { editableContent?: string };
      if (editableContent === undefined) {
        res.status(400).json({ error: 'Missing editableContent' });
        return true;
      }

      // 读取现有文件并拆分
      const raw = fs.readFileSync(skillFile, 'utf-8');
      const parsed = parseFrontmatter(raw);
      if (!parsed) {
        res.status(500).json({ error: 'Failed to parse skill' });
        return true;
      }

      const sections = splitIntoSections(id, parsed.body);
      // 替换可编辑区域
      for (const section of sections) {
        if (section.editable) {
          section.content = editableContent.trim();
        }
      }

      // 重建文件
      const newBody = reconstructBody(id, sections);
      const newFile = `---\nname: ${parsed.name}\ndescription: ${parsed.description}\n---\n\n${newBody}`;

      try {
        fs.writeFileSync(skillFile, newFile, 'utf-8');
        res.status(200).json({
          id,
          name: parsed.name,
          description: parsed.description,
          sections: splitIntoSections(id, newBody.trim()),
        });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
      return true;
    }

    return false;
  };
}
