import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import "./CompleteView.css";

function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (end === 0) { setValue(0); return; }
    let frameId: number;
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * end));
      if (p < 1) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [end, duration]);
  return <>{value}</>;
}

function TechPanel({ label, value, color, delay }: { label: string; value: number; color: string; delay: number }) {
  return (
    <div className="tech-panel" style={{ '--acc-color': color, '--delay': `${delay}s` } as React.CSSProperties}>
      <div className="tech-panel-corner top-left"></div>
      <div className="tech-panel-corner bottom-right"></div>
      <p className="text-sm font-semibold tech-label">{label}</p>
      <p className="text-xl font-extrabold tech-value" style={{ textShadow: `0 0 10px ${color}` }}>
        <CountUp end={value} duration={1200} />
      </p>
    </div>
  );
}

export function CompleteView({ stats }: { stats: { 会: number; 模糊: number; 不会: number } }) {
  const navigate = useNavigate();
  const total = stats.会 + stats.模糊 + stats.不会;
  const masteryRate = total > 0 ? Math.round((stats.会 / total) * 100) : 0;

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`game-dashboard ${visible ? 'visible' : ''}`}>
      <div className="cyber-grid-bg"></div>

      <div className="flex items-center justify-center min-h-[70vh] relative z-10">
        <div className="flex flex-col items-center gap-0 w-full max-w-[600px]">

          <div className="header-stats mb-10">
            <div className="header-stat-box">
              <span className="text-xs text-cyan-400">复习总数</span>
              <span className="text-lg font-bold text-cyan-200"><CountUp end={total} /></span>
            </div>
            <div className="header-divider"></div>
            <div className="header-stat-box">
              <span className="text-xs text-cyan-400">掌握率</span>
              <span className="text-lg font-bold text-cyan-200"><CountUp end={masteryRate} />%</span>
            </div>
          </div>

          <div className="mastery-ring-container">
            <div className="neon-ring outer"></div>
            <div className="neon-ring inner">
              <div className="spin-dash"></div>
            </div>

            <div className="ring-content">
              <span className="text-sm font-semibold" style={{ letterSpacing: '2px', color: '#6ee7b7' }}>掌握度</span>
              <span className="mastery-pct font-black">
                <CountUp end={masteryRate} duration={1500} />
                <span style={{ fontSize: '0.5em', opacity: 0.8 }}>%</span>
              </span>
            </div>

            {total > 0 && (
              <>
                <div className="orbit-panel-wrapper pos-left">
                  <TechPanel label="✅ 完全掌握" value={stats.会} color="#10B981" delay={0.4} />
                </div>
                <div className="orbit-panel-wrapper pos-right-top">
                  <TechPanel label="🔶 概念模糊" value={stats.模糊} color="#F59E0B" delay={0.6} />
                </div>
                <div className="orbit-panel-wrapper pos-right-bottom">
                  <TechPanel label="❌ 需要重温" value={stats.不会} color="#EF4444" delay={0.8} />
                </div>
              </>
            )}
          </div>

          <div className="flex mt-20 gap-4 w-full justify-center">
            <Button className="cyber-btn" size="lg" onClick={() => navigate("/")}>
              <span className="btn-glitch">继续探索</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
