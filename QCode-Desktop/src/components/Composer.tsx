import { useEffect, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type FC, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateModel, fetchModels } from "../services/modelApi";
import { fetchSkills, type SkillSummary } from "../services/skillApi";
import PermissionModePicker from "./PermissionModePicker";
import type { PermissionState } from "../hooks/usePermissionMode";
import type { ModelConfig } from "../types/chat";
import type { Project } from "../types/chat";

interface ProjectPickerProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project | null) => void;
  onCreateProject: () => void;
}

export const ProjectPicker: FC<ProjectPickerProps> = ({ projects, activeProject, onSelectProject, onCreateProject }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleProjects = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => { if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);

  const choose = (project: Project | null) => { onSelectProject(project); setOpen(false); setQuery(""); };
  return <div className="composer-project-picker" ref={rootRef}>
    <div className="composer-project-chip-wrap">
      {activeProject && <button className="composer-project-clear" type="button" title="移出项目" aria-label="移出项目" onClick={() => onSelectProject(null)}>×</button>}
      <button className="composer-context project-context-trigger composer-project-chip" type="button" aria-label="更改此聊天的项目" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {!activeProject && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>}
        <span>{activeProject?.name || "不在项目中工作"}</span>{!activeProject && <svg className="project-context-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>}
      </button>
    </div>
    {open && <div className="composer-project-menu" role="listbox" aria-label="选择项目">
      <label className="composer-project-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目" /></label>
      <div className="composer-project-options">
        {visibleProjects.map((project) => <button key={project.projectId} className={`composer-project-option ${activeProject?.projectId === project.projectId ? "selected" : ""}`} type="button" role="option" aria-selected={activeProject?.projectId === project.projectId} onClick={() => choose(project)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg><span>{project.name}</span>{activeProject?.projectId === project.projectId && <b aria-hidden="true">✓</b>}
        </button>)}
        {!visibleProjects.length && <div className="composer-project-empty">没有找到项目</div>}
      </div>
      <div className="composer-project-menu-footer"><button type="button" onClick={() => { setOpen(false); onCreateProject(); }}><span>＋</span>新建项目</button><button type="button" className={!activeProject ? "selected" : ""} onClick={() => choose(null)}><span>×</span>不在项目中工作{!activeProject && <b>✓</b>}</button></div>
    </div>}
  </div>;
};

interface ComposerProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project | null) => void;
  onCreateProject: () => void;
  disabled: boolean;
  stopping?: boolean;
  sessionId: string;
  onSend: (text: string, files?: File[], skillName?: string) => void;
  onStop?: () => void | Promise<void>;
  workspaceOpen?: boolean;
  showContext?: boolean;
  permissionState: PermissionState;
  planMode: boolean;
  onPlanModeChange: (enabled: boolean) => void;
}

interface DraftAttachment {
  id: string;
  file: File;
  previewUrl?: string;
}

function attachmentId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `attachment-${crypto.randomUUID()}`;
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

const Composer: FC<ComposerProps> = ({ projects, activeProject, onSelectProject, onCreateProject, disabled, stopping = false, sessionId, onSend, onStop, workspaceOpen = true, showContext = true, permissionState, planMode, onPlanModeChange }) => {
  const [text, setText] = useState("");
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillError, setSkillError] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<DraftAttachment[]>([]);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const canSend = text.trim().length > 0 || attachments.length > 0;

  useEffect(() => { void fetchModels().then(setModels).catch(() => setModels([])); }, []);

  useEffect(() => {
    setText("");
    setSelectedSkill(null);
    setAttachments((current) => {
      current.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
    setAddMenuOpen(false);
    setSkillMenuOpen(false);
  }, [sessionId]);

  useEffect(() => { attachmentsRef.current = attachments; }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
  }, []);

  const openSkillMenu = async () => {
    setSkillMenuOpen(true);
    if (skillsLoaded || skillsLoading) return;
    setSkillsLoading(true);
    setSkillError("");
    try {
      setSkills(await fetchSkills());
      setSkillsLoaded(true);
    } catch (value) {
      setSkillError(value instanceof Error ? value.message : "技能列表加载失败");
    } finally {
      setSkillsLoading(false);
    }
  };
  const activeModel = models.find((model) => model.active) || models[0];
  const selectModel = async (model: ModelConfig) => {
    if (model.active || modelBusy) { setModelOpen(false); return; }
    setModelBusy(true);
    try { await activateModel(model.id); setModels((current) => current.map((item) => ({ ...item, active: item.id === model.id }))); }
    finally { setModelBusy(false); setModelOpen(false); }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [text]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !addMenuRef.current?.contains(event.target)) setAddMenuOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) setSkillMenuOpen(false);
  }, [addMenuOpen]);

  useEffect(() => {
    if (disabled) {
      setAddMenuOpen(false);
      setSkillMenuOpen(false);
    }
  }, [disabled]);

  const send = () => {
    const value = text.trim();
    if ((!value && !attachments.length) || disabled) return;
    onSend(value, attachments.map((attachment) => attachment.file), selectedSkill?.name);
    setText("");
    setAttachments((current) => {
      current.forEach((attachment) => attachment.previewUrl && URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
    setSelectedSkill(null);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const addFiles = (files: File[]) => {
    const next = files
      .filter((file) => !(file as File & { webkitRelativePath?: string }).webkitRelativePath)
      .map((file) => ({ id: attachmentId(), file, previewUrl: isImage(file) ? URL.createObjectURL(file) : undefined }));
    if (next.length) setAttachments((current) => [...current, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((attachment) => {
      if (attachment.id !== id) return true;
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return false;
    }));
  };

  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    addFiles(files);
    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className={`composer ${workspaceOpen ? "with-workspace" : ""}`}>
      {showContext && <div className="composer-context-row"><ProjectPicker projects={projects} activeProject={activeProject} onSelectProject={onSelectProject} onCreateProject={onCreateProject} /><span className="composer-computer-context"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="13" rx="1.5" /><path d="M2.5 20h19M9 17v3m6-3v3" /></svg>此计算机</span></div>}
      <div className="composer-input">
        {attachments.length > 0 && <div className="composer-attachments" aria-label="待发送附件">
          {attachments.map((attachment) => <div key={attachment.id} className={`composer-attachment ${attachment.previewUrl ? "image" : "file"}`}>
            {attachment.previewUrl
              ? <img src={attachment.previewUrl} alt={attachment.file.name} />
              : <div className="composer-file-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5h8l4 4V21.5H6Z" /><path d="M14 2.5v4h4" /></svg></div>}
            <span title={attachment.file.name}>{attachment.file.name}</span>
            <button type="button" aria-label={`移除附件 ${attachment.file.name}`} disabled={disabled} onClick={() => removeAttachment(attachment.id)}>×</button>
          </div>)}
        </div>}
        <div className="composer-entry-row">
          {selectedSkill && <span className="composer-skill-chip"><button type="button" aria-label={`移除技能 ${selectedSkill.name}`} disabled={disabled} onClick={() => setSelectedSkill(null)}>×</button><span>{selectedSkill.name}</span></span>}
          <textarea ref={textareaRef} value={text} className="composer-textarea" placeholder={attachments.length ? "添加说明…" : "描述你想完成的任务…"} rows={1} disabled={disabled} onChange={(event) => setText(event.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} />
        </div>
      </div>
      <div className="composer-toolbar">
        <div className="composer-actions">
          <div className="composer-add" ref={addMenuRef}>
            <input ref={fileInputRef} className="composer-file-input" type="file" multiple tabIndex={-1} onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
            <button className="tool-btn plus-btn" type="button" title="添加" aria-label="添加" aria-haspopup="menu" aria-expanded={addMenuOpen} disabled={disabled} onClick={() => setAddMenuOpen((open) => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
            {addMenuOpen && <div className="composer-add-menu" role="menu" aria-label="添加">
              <span className="composer-add-heading">添加</span>
              <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); fileInputRef.current?.click(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7.4 7.4a5 5 0 0 1-7.1-7.1l7.1-7.1" /></svg>
                <span><strong>文件和图片</strong><small>选择一个或多个文件</small></span>
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={planMode} className={planMode ? "selected" : ""} onClick={() => { onPlanModeChange(!planMode); setAddMenuOpen(false); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4" /><path d="M8.1 14.5A6 6 0 1 1 15.9 14.5C14.7 15.4 14 16.1 14 18h-4c0-1.9-.7-2.6-1.9-3.5Z" /></svg>
                <span><strong>计划模式</strong><small>{planMode ? "已开启，点击关闭" : "开启计划模式"}</small></span>
                {planMode && <b aria-hidden="true">✓</b>}
              </button>
              <button type="button" role="menuitem" aria-haspopup="listbox" aria-expanded={skillMenuOpen} className={skillMenuOpen ? "selected" : ""} onMouseEnter={() => { void openSkillMenu(); }} onClick={() => { void openSkillMenu(); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h7m-7 4h5" /></svg>
                <span><strong>技能</strong><small>{selectedSkill ? `已选择 ${selectedSkill.name}` : "为本次任务选择技能"}</small></span>
                <b className="composer-add-chevron" aria-hidden="true">›</b>
              </button>
              {skillMenuOpen && <div className="composer-skill-menu" role="listbox" aria-label="选择技能">
                {skillsLoading ? <div className="composer-skill-state">正在加载…</div> : skillError ? <div className="composer-skill-state error">{skillError}<button type="button" onClick={() => { setSkillsLoaded(false); void openSkillMenu(); }}>重试</button></div> : skills.length ? skills.map((skill) => <button key={skill.name} type="button" role="option" aria-selected={selectedSkill?.name === skill.name} className={selectedSkill?.name === skill.name ? "selected" : ""} onClick={() => { setSelectedSkill(skill); setSkillMenuOpen(false); setAddMenuOpen(false); window.setTimeout(() => textareaRef.current?.focus(), 0); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20M8 7h7m-7 4h5" /></svg>
                  <span><strong>{skill.name}</strong><small>{skill.description || "暂无描述"}</small></span>
                  {selectedSkill?.name === skill.name && <b aria-hidden="true">✓</b>}
                </button>) : <div className="composer-skill-state">还没有可用技能</div>}
              </div>}
            </div>}
          </div>
          {planMode && <><span className="composer-action-divider" aria-hidden="true" /><button type="button" className="tool-btn plan-mode-chip" title="关闭计划模式" disabled={disabled} onClick={() => onPlanModeChange(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg><span>计划</span></button></>}
        </div>
        <div className="toolbar-right"><PermissionModePicker permissionState={permissionState} /><div className="model-picker"><button className="tool-btn model-btn" title="选择模型" onClick={() => setModelOpen((open) => !open)}><span>{activeModel?.modelName || "选择模型"}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg></button>{modelOpen && <div className="model-picker-menu">{models.length === 0 ? <span>请先在设置中添加模型</span> : models.map((model) => <button key={model.id} className={model.active ? "selected" : ""} type="button" onClick={() => void selectModel(model)}>{model.modelName}{model.active && " ✓"}</button>)}</div>}</div>{disabled ? <button className={`send-btn stop-btn ${stopping ? "stopping" : ""}`} type="button" title={stopping ? "正在停止" : "停止生成"} aria-label={stopping ? "正在停止" : "停止生成"} disabled={stopping} onClick={() => { void onStop?.(); }}><span /></button> : <button className="send-btn" type="button" disabled={!canSend} title="发送" onClick={send}><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>}</div>
      </div>
    </div>
  );
};

export default Composer;
