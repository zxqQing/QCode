import type { PermissionMode } from "../types/chat";

export const permissionModes: ReadonlyArray<{
  mode: PermissionMode;
  title: string;
  description: string;
  icon: "hand" | "shield";
}> = [
  {
    mode: "MANUAL",
    title: "手动审批",
    description: "需要审批的工具调用交由你确认。",
    icon: "hand"
  },
  {
    mode: "AUTO",
    title: "自动审批",
    description: "由 AI 判断工具调用；未通过时交由你确认。",
    icon: "shield"
  }
];

export function permissionModeTitle(mode: PermissionMode): string {
  return permissionModes.find((item) => item.mode === mode)?.title || "权限模式";
}
