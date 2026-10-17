<script setup>
import { ref, nextTick } from "vue";

// 底部悬浮输入栏组件
const props = defineProps({
  context: {
    type: String,
    default: "QCode-v3 框架"
  },
  disabled: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(["send"]);

const text = ref("");
const textareaRef = ref(null);
const canSend = ref(false);

// 模型列表
const models = ["Qwen-Max", "Qwen-Plus", "Qwen-Turbo", "GPT-4o", "GLM-5"];
const modelIndex = ref(0);

// 输入自适应高度
function onInput(e) {
  const el = e.target;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
  canSend.value = text.value.trim().length > 0;
}

// 回车发送,Shift+回车换行
function onKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function send() {
  const value = text.value.trim();
  if (!value || props.disabled) return;
  emit("send", value);
  text.value = "";
  canSend.value = false;
  nextTick(() => {
    if (textareaRef.value) textareaRef.value.style.height = "auto";
    textareaRef.value?.focus();
  });
}

// 切换模型
function cycleModel() {
  modelIndex.value = (modelIndex.value + 1) % models.length;
}

// 帮我批准
function approve() {
  emit("send", "帮我批准");
}
</script>

<template>
  <div class="composer">
    <div class="composer-context">
      <svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" /></svg>
      <span>{{ context }}</span>
    </div>

    <div class="composer-input">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer-textarea"
        placeholder="随心输入"
        rows="1"
        :disabled="disabled"
        @input="onInput"
        @keydown="onKeydown"
      ></textarea>
    </div>

    <div class="composer-toolbar">
      <button class="tool-btn plus-btn" title="附件">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      </button>

      <div class="toolbar-right">
        <button class="tool-btn sparkle-btn" title="帮我批准" @click="approve">
          <svg viewBox="0 0 24 24"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" /></svg>
          <span>帮我批准</span>
        </button>

        <button class="tool-btn model-btn" title="选择模型" @click="cycleModel">
          <span>{{ models[modelIndex] }}</span>
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
        </button>

        <button
          class="send-btn"
          :disabled="!canSend || disabled"
          title="发送"
          @click="send"
        >
          <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 720px;
  background: var(--bg-white);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shadow-floating);
  z-index: 10;
}

.composer-context {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-hover);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.composer-context svg {
  width: 13px;
  height: 13px;
}

.composer-input {
  margin-bottom: 8px;
}

.composer-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-primary);
  background: transparent;
  min-height: 24px;
  max-height: 200px;
}

.composer-textarea::placeholder {
  color: var(--text-muted);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.tool-btn svg {
  width: 15px;
  height: 15px;
}

.plus-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-light);
  justify-content: center;
}

.plus-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-medium);
}

.sparkle-btn svg {
  color: var(--accent);
}

.sparkle-btn:hover {
  background: var(--bg-selected);
}

.model-btn {
  border: 1px solid var(--border-light);
}

.model-btn:hover {
  background: var(--bg-hover);
}

.model-btn svg {
  width: 12px;
  height: 12px;
}

.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.send-btn svg {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

.send-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.send-btn:disabled {
  background: var(--border-medium);
  cursor: not-allowed;
}
</style>
