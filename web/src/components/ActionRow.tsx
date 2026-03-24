import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function ActionRow({ onImportClick }: { onImportClick: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="flex justify-center gap-4 mt-6">
      <Button
        variant="secondary"
        size="lg"
        className="flex-1 max-w-[240px] min-h-[56px]"
        onClick={() => navigate("/cards")}
      >
        📋 知识筛选
      </Button>
      <Button
        size="lg"
        className="flex-1 max-w-[240px] min-h-[56px]"
        onClick={() => navigate("/review")}
      >
        🧠 知识学习
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="flex-1 max-w-[240px] min-h-[56px]"
        onClick={onImportClick}
      >
        📤 知识导入
      </Button>
    </div>
  );
}
