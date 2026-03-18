import { notifications } from "@mantine/notifications";

// 替代旧的 Toast 组件，使用 Mantine Notifications 系统
export function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const colorMap = { success: "green", error: "red", info: "blue" };
  notifications.show({
    message,
    color: colorMap[type],
    withBorder: true,
    autoClose: 3000,
    style: { background: 'var(--color-bg-secondary)' },
  });
}

// 保留旧组件签名以便渐进式迁移（但不再使用手写样式）
export function Toast(_props: { message: string; type: string; onClose: () => void }) {
  return null; // 由 Mantine Notifications 全局管理
}
