import fs from 'fs';
import os from 'os';
import path from 'path';

const SKILLS_DIR = path.join(os.homedir(), '.openclaw', 'skills');

/**
 * 运行时读取指定 skill 的 SKILL.md 全文内容（去掉 YAML frontmatter）。
 * 每次调用都从磁盘读取，确保修改后立即生效。
 * 如果文件不存在则返回 null。
 */
export function readSkillContent(skillName: string): string | null {
  const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;

  const raw = fs.readFileSync(skillFile, 'utf-8');

  // 去掉 YAML frontmatter，只保留正文
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return fmMatch ? fmMatch[1]!.trim() : raw.trim();
}
