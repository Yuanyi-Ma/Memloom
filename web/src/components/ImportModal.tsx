import { useState, useRef, DragEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "../services/api";

interface Props { onClose: () => void; onSuccess: (count: number) => void; }

export function ImportModal({ onClose, onSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (fileList) setFiles(Array.from(fileList).filter(f => f.name.endsWith(".md")));
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const contents = await Promise.all(files.map(f =>
        f.text().then(content => ({ filename: f.name, content }))
      ));
      const result = await api.importMarkdown(contents);
      onSuccess(result.imported);
      onClose();
    } catch { /* error handled by caller via toast */ }
    setLoading(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>知识导入</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col gap-4 py-8 items-center">
            <Progress value={100} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">正在提取知识...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 cursor-pointer text-center transition-all duration-200
                ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <span className="text-lg mb-2 block">📂</span>
              <p className="text-sm text-muted-foreground">
                拖拽 .md 文件至此处，或 <span className="text-primary font-medium">点击选择文件</span>
              </p>
              {files.length > 0 && (
                <p className="text-xs text-primary mt-3 font-medium">
                  {files.map(f => f.name).join(", ")}
                </p>
              )}
              <input ref={inputRef} type="file" accept=".md" multiple hidden onChange={e => handleFiles(e.target.files)} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button disabled={files.length === 0} onClick={handleImport}>
                开始导入
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
