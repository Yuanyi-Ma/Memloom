import { useState, useRef, DragEvent } from "react";
import { Modal, Text, Button, Group, Progress, Paper, Stack } from "@mantine/core";
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
    <Modal
      opened
      onClose={onClose}
      title={<Text fw={600} fz="lg">知识导入</Text>}
      size="md"
      radius="lg"
      centered
      overlayProps={{ backgroundOpacity: 0.6, blur: 4 }}
      styles={{
        content: { background: 'var(--color-bg-secondary)' },
        header: { background: 'var(--color-bg-secondary)' },
      }}
    >
      {loading ? (
        <Stack gap="md" py="xl">
          <Progress value={100} animated color="brand" radius="xl" />
          <Text ta="center" c="dimmed" fz="sm">正在提取知识...</Text>
        </Stack>
      ) : (
        <Stack gap="md">
          <Paper
            p="xl"
            radius="md"
            style={{
              border: `2px dashed ${dragOver ? 'var(--mantine-color-brand-5)' : 'var(--color-border)'}`,
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'border-color 200ms ease, background 200ms ease',
              background: dragOver ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <Text fz="lg" mb="xs">📂</Text>
            <Text fz="sm" c="dimmed">
              拖拽 .md 文件至此处，或 <Text span c="brand" fw={500}>点击选择文件</Text>
            </Text>
            {files.length > 0 && (
              <Text fz="xs" c="brand" mt="sm" fw={500}>
                {files.map(f => f.name).join(", ")}
              </Text>
            )}
            <input ref={inputRef} type="file" accept=".md" multiple hidden onChange={e => handleFiles(e.target.files)} />
          </Paper>
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" color="gray" onClick={onClose}>取消</Button>
            <Button color="brand" disabled={files.length === 0} onClick={handleImport}>
              开始导入
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
