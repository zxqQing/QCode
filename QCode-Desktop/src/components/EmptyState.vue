<script setup>
// 空状态欢迎屏组件
defineProps({
  context: {
    type: String,
    default: ""
  }
});
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <svg viewBox="0 0 64 64">
        <path d="M16 40a10 10 0 010-20 14 14 0 0127-4 12 12 0 01-2 24H18a10 10 0 01-2-0z" />
        <path d="M24 36h16M24 42h10" />
      </svg>
    </div>
    <h2 class="empty-title">我们应该在 QCode 中做些什么?</h2>
    <p class="empty-hint">
      从左侧选择项目,或直接开始新聊天{{ context ? ` · 当前: ${context}` : "" }}
    </p>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 24px;
  margin-bottom: 120px;
}

.empty-icon {
  width: 64px;
  height: 64px;
  color: var(--border-medium);
  margin-bottom: 24px;
}

.empty-icon svg {
  width: 100%;
  height: 100%;
  stroke-width: 1.4;
}

.empty-title {
  font-size: 20px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-muted);
}
</style>
