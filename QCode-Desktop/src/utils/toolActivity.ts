import type { ToolEvent, ToolEventStatus } from "../types/chat";

export type ActivityCategory = "read" | "search" | "edit" | "command" | "plan" | "operation";
export type ActivityStatus = ToolEventStatus;

interface CategoryDefinition {
  category: ActivityCategory;
  match: RegExp;
  verb: string;
  noun: string;
}

const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { category: "read", match: /^read_file/, verb: "读取", noun: "个文件" },
  { category: "search", match: /^(glob|grep|search)/, verb: "搜索", noun: "次文件" },
  { category: "edit", match: /^(write_file|edit)/, verb: "编辑", noun: "次文件" },
  { category: "command", match: /^(shell|execute|qcode-execute|run_command)/, verb: "执行", noun: "条命令" },
  { category: "plan", match: /^plan_/, verb: "写入", noun: "次计划" }
];

const FALLBACK_CATEGORY: CategoryDefinition = {
  category: "operation",
  match: /.*/,
  verb: "执行",
  noun: "次操作"
};

export const activityStatusLabels: Record<ActivityStatus, string> = {
  queued: "等待中",
  running: "运行中",
  success: "已完成",
  failed: "执行失败",
  approval: "等待批准"
};

export function getActivityStatus(events: ToolEvent[]): ActivityStatus {
  const priority: ActivityStatus[] = ["failed", "running", "approval", "queued", "success"];
  return priority.find((status) => events.some((event) => event.status === status)) || "success";
}

export function summarizeToolActivity(events: ToolEvent[], active: boolean): { label: string; status: ActivityStatus } {
  const status = getActivityStatus(events);
  if (status === "failed") return { label: `共 ${events.length} 个操作，其中有失败`, status };
  if (status === "approval") return { label: `${events.length} 个操作等待批准`, status };
  if (status === "queued" && !active) return { label: `等待执行 ${events.length} 个操作`, status };

  const counts = new Map<ActivityCategory, { count: number; verb: string; noun: string }>();
  events.forEach((event) => {
    const normalizedName = event.name.trim().toLowerCase();
    const definition = CATEGORY_DEFINITIONS.find(({ match }) => match.test(normalizedName)) || FALLBACK_CATEGORY;
    const current = counts.get(definition.category);
    counts.set(definition.category, {
      count: (current?.count || 0) + 1,
      verb: definition.verb,
      noun: definition.noun
    });
  });

  const details = [...counts.values()].map(({ count, verb, noun }) => `${verb} ${count} ${noun}`).join("，");
  return { label: `${active ? "正在" : "已"}${details}`, status };
}
