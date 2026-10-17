<script setup>
import { ref } from "vue";

// 项目侧边栏组件
const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  sessionsLoading: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(["new-chat", "select-project", "select-session"]);

// 项目树数据
const projects = ref([
  {
    id: "qcode-v3",
    name: "QCode-v3 框架",
    expanded: true,
    selected: true,
    children: ["搭建后端", "工具沙箱", "审批流程"]
  },
  { id: "img-search", name: "以图搜图", expanded: false, children: [] },
  { id: "obj-detect", name: "目标检测", expanded: false, children: [] },
  { id: "copyright", name: "软著", expanded: false, children: [] }
]);

// 展开/折叠项目
function toggle(node) {
  node.expanded = !node.expanded;
}

// 选中项目
function selectNode(node) {
  projects.value.forEach((p) => (p.selected = false));
  node.selected = true;
  emit("select-project", node.name);
}

function selectRecent(name) {
  emit("select-project", name);
}

function selectSession(session) {
  emit("select-session", session);
}
</script>

<template>
  <nav class="sidebar">
    <div class="sidebar-header">
      <button class="brand">
        <span class="brand-name">QCode</span>
        <svg class="chevron" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div class="brand-actions">
        <button class="icon-btn" title="新建">
          <svg viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /></svg>
        </button>
        <button class="icon-btn" title="搜索">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16 16l4 4" /></svg>
        </button>
      </div>
    </div>

    <button class="new-chat-btn" @click="emit('new-chat')">
      <svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" /></svg>
      <span>新聊天</span>
    </button>

    <div class="sidebar-section">
      <div class="section-label">项目</div>
      <ul class="tree">
        <li
          v-for="node in projects"
          :key="node.id"
          class="tree-node"
          :class="{ expanded: node.expanded, collapsed: !node.expanded }"
        >
          <div
            class="tree-row folder"
            :class="{ selected: node.selected }"
            @click="toggle(node)"
          >
            <svg class="caret" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
            <svg class="folder-icon" viewBox="0 0 24 24"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" /></svg>
            <span class="tree-label">{{ node.name }}</span>
          </div>

          <ul v-show="node.expanded" class="tree-children">
            <li
              v-for="child in node.children"
              :key="child"
              class="tree-row file"
              @click.stop="selectRecent(child)"
            >
              <svg class="file-icon" viewBox="0 0 24 24"><path d="M6 2h8l4 4v16H6zM14 2v4h4" /></svg>
              <span class="tree-label">{{ child }}</span>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <div class="sidebar-divider"></div>

    <div class="sidebar-section">
      <div class="section-label">最近</div>
      <ul class="recent-list">
        <li v-if="sessionsLoading" class="recent-empty">加载会话中...</li>
        <li v-else-if="!props.sessions.length" class="recent-empty">暂无会话</li>
        <li
          v-for="session in props.sessions"
          :key="session.sessionId"
          class="recent-item"
          :title="session.sessionId"
          @click="selectSession(session)"
        >
          <span class="dot"></span>
          <span>{{ session.displayTitle || session.title || session.sessionId }}</span>
        </li>
      </ul>
    </div>
  </nav>
</template>

<style scoped>
.sidebar {
  width: 280px;
  flex-shrink: 0;
  background: var(--bg-panel);
  border-right: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s;
}

.brand:hover {
  background: var(--bg-hover);
}

.brand-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.brand-actions {
  display: flex;
  gap: 2px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-muted);
  transition: all 0.15s;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-white);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 16px;
  transition: all 0.15s;
}

.new-chat-btn svg {
  width: 16px;
  height: 16px;
  color: var(--accent);
}

.new-chat-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-medium);
}

.sidebar-section {
  margin-bottom: 8px;
}

.section-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 4px 8px;
  letter-spacing: 0.02em;
}

.tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}

.tree-row:hover {
  background: var(--bg-hover);
}

.tree-row.selected {
  background: var(--bg-selected);
  color: var(--accent);
  font-weight: 500;
}

.tree-row.file {
  padding-left: 28px;
}

.caret {
  width: 12px;
  height: 12px;
  color: var(--text-muted);
  transition: transform 0.15s;
  flex-shrink: 0;
}

.collapsed .caret {
  transform: rotate(0deg);
}

.expanded .caret {
  transform: rotate(90deg);
}

.folder-icon,
.file-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.tree-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tree-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-top: 1px;
}

.sidebar-divider {
  height: 1px;
  background: var(--border-light);
  margin: 12px 0;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.15s;
}

.recent-item:hover {
  background: var(--bg-hover);
}

.recent-empty {
  padding: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.recent-item .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  flex-shrink: 0;
}
</style>
