import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { deleteSkill, fetchSkill, fetchSkills, uploadSkill, type SkillFolderFile, type SkillSummary } from "../services/skillApi";

type UploadSelection = { files: SkillFolderFile[]; label: string };

type DroppedEntry = {
  isDirectory: boolean;
  isFile: boolean;
  name: string;
  file?: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: DroppedEntry[]) => void, failure?: (error: DOMException) => void) => void };
};

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PackageIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /><path d="M12 11v10" /></svg>;
}

function UploadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v5h14v-5" /></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

function getDroppedEntry(item: DataTransferItem): DroppedEntry | null {
  const getEntry = (item as unknown as { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry;
  return getEntry ? getEntry.call(item) : null;
}

function readDroppedFile(entry: DroppedEntry, path: string): Promise<SkillFolderFile> {
  return new Promise((resolve, reject) => {
    if (!entry.file) return reject(new Error("无法读取拖入的文件"));
    entry.file((file) => resolve({ file, path }), reject);
  });
}

async function readDroppedEntry(entry: DroppedEntry, parent = ""): Promise<SkillFolderFile[]> {
  const path = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile) return [await readDroppedFile(entry, path)];
  if (!entry.isDirectory || !entry.createReader) return [];

  const reader = entry.createReader();
  const children: DroppedEntry[] = [];
  while (true) {
    const batch = await new Promise<DroppedEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map((child) => readDroppedEntry(child, path)))).flat();
}

export default function SkillSettingsPage() {
  const [items, setItems] = useState<SkillSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadSelection, setUploadSelection] = useState<UploadSelection | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<SkillSummary | null>(null);
  const [content, setContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const folderInput = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setError("");
    try { setItems(await fetchSkills()); }
    catch (value) { setError(value instanceof Error ? value.message : "列表加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return items;
    return items.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(keyword));
  }, [items, query]);

  const openDetail = async (item: SkillSummary) => {
    setSelected(item);
    setContent("");
    setDetailLoading(true);
    setError("");
    try { setContent(await fetchSkill(item.name)); }
    catch (value) { setError(value instanceof Error ? value.message : "内容加载失败"); setSelected(null); }
    finally { setDetailLoading(false); }
  };

  const selectFolder = (files: SkillFolderFile[]) => {
    setUploadError("");
    const normalized = files.map(({ file, path }) => ({ file, path: path.replace(/\\/g, "/").replace(/^\/+/, "") })).filter(({ path }) => path);
    const roots = new Set(normalized.map(({ path }) => path.split("/")[0]));
    if (normalized.length === 0 || roots.size !== 1) {
      setUploadSelection(null);
      setUploadError("一次只能上传一个文件夹");
      return;
    }
    const root = normalized[0].path.split("/")[0];
    if (!normalized.some(({ path }) => path === `${root}/SKILL.md`)) {
      setUploadSelection(null);
      setUploadError("所选文件夹的根目录中未找到 SKILL.md");
      return;
    }
    if (normalized.length > 1000) {
      setUploadSelection(null);
      setUploadError("文件夹内文件数量不能超过 1000 个");
      return;
    }
    const contents = normalized.map(({ file, path }) => ({ file, path: path.slice(root.length + 1) }));
    setUploadSelection({ files: contents, label: `${root}（${contents.length} 个文件）` });
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    setUploadError("");
    try {
      const droppedItems = Array.from(event.dataTransfer.items);
      const entries = droppedItems.map(getDroppedEntry).filter((entry): entry is DroppedEntry => entry !== null);
      if (entries.length) {
        if (entries.length !== 1 || !entries[0].isDirectory) {
          setUploadSelection(null);
          setUploadError("一次只能上传一个文件夹");
          return;
        }
        selectFolder(await readDroppedEntry(entries[0]));
        return;
      }

      const files = Array.from(event.dataTransfer.files);
      if (!files.length || files.some((file) => !file.webkitRelativePath)) {
        setUploadSelection(null);
        setUploadError("请拖入一个文件夹");
        return;
      }
      selectFolder(files.map((file) => ({ file, path: file.webkitRelativePath })));
    } catch (value) {
      setUploadSelection(null);
      setUploadError(value instanceof Error ? value.message : "无法读取拖入的内容");
    }
  };

  const openUpload = () => {
    setUploadOpen(true);
    setUploadSelection(null);
    setUploadError("");
  };

  const closeUpload = () => {
    if (uploading) return;
    setUploadOpen(false);
    setUploadSelection(null);
    setUploadError("");
    if (folderInput.current) folderInput.current.value = "";
  };

  const confirmUpload = async () => {
    if (!uploadSelection) return;
    setUploading(true);
    setUploadError("");
    setError("");
    setNotice("");
    try {
      const created = await uploadSkill(uploadSelection.files);
      setUploadOpen(false);
      setUploadSelection(null);
      setNotice(`“${created.name}”已添加`);
      await load();
    } catch (value) { setUploadError(value instanceof Error ? value.message : "上传失败"); }
    finally { setUploading(false); }
  };

  const handleDropZoneKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      folderInput.current?.click();
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await deleteSkill(pendingDelete.name);
      setItems((current) => current.filter((item) => item.name !== pendingDelete.name));
      setNotice(`“${pendingDelete.name}”已删除`);
      setPendingDelete(null);
    } catch (value) { setError(value instanceof Error ? value.message : "删除失败"); }
    finally { setDeleting(false); }
  };

  return <main className="model-settings-content skill-settings-content">
    <div className="skill-page-header">
      <div><h1>技能</h1><p className="settings-description">管理用于扩展 QCode 工作方式的自定义能力。</p></div>
      <button className="skill-upload-button" type="button" onClick={openUpload}><span aria-hidden="true">＋</span>上传</button>
    </div>

    <div className="skill-toolbar">
      <label className="skill-search"><SearchIcon /><span className="sr-only">搜索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或描述" /></label>
      <span className="skill-count">共 {items.length} 项</span>
    </div>

    {error && <div className="settings-error" role="alert">{error}</div>}
    {notice && <div className="settings-notice" role="status">{notice}</div>}

    <section className="skill-list" aria-label="技能列表">
      {loading ? <div className="skill-empty">正在加载…</div> : filtered.length === 0 ? <div className="skill-empty">
        <span className="skill-empty-icon"><PackageIcon /></span>
        <strong>{items.length ? "没有匹配的结果" : "还没有添加任何内容"}</strong>
        <span>{items.length ? "请尝试其他搜索词" : "上传文件夹即可开始使用"}</span>
      </div> : filtered.map((item) => <article className="skill-row" key={item.name}>
        <span className="skill-item-icon"><PackageIcon /></span>
        <button className="skill-row-copy" type="button" onClick={() => void openDetail(item)}><strong>{item.name}</strong><span>{item.description || "暂无描述"}</span></button>
        <div className="skill-row-actions"><button type="button" onClick={() => void openDetail(item)}>查看</button><button className="danger" type="button" onClick={() => setPendingDelete(item)}>删除</button></div>
      </article>)}
    </section>

    {uploadOpen && <div className="skill-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}>
      <section className="skill-upload-modal" role="dialog" aria-modal="true" aria-labelledby="skill-upload-title">
        <header><h2 id="skill-upload-title">上传技能</h2><button className="skill-modal-close" type="button" aria-label="关闭" disabled={uploading} onClick={closeUpload}><CloseIcon /></button></header>
        <input ref={(node) => { folderInput.current = node; node?.setAttribute("webkitdirectory", ""); }} type="file" multiple hidden onChange={(event) => selectFolder(Array.from(event.target.files || []).map((file) => ({ file, path: file.webkitRelativePath || file.name })))} />
        <div className={`skill-drop-zone ${dragging ? "dragging" : ""} ${uploadSelection ? "selected" : ""}`} role="button" tabIndex={0}
          onClick={() => folderInput.current?.click()} onKeyDown={handleDropZoneKey}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => void handleDrop(event)}>
          <span className="skill-drop-icon"><UploadIcon /></span>
          {uploadSelection ? <><strong>{uploadSelection.label}</strong><span>已选择，确认后开始上传</span></> : <><strong>拖放或点击选择文件夹</strong><span>一次上传一个包含 SKILL.md 的文件夹</span></>}
        </div>
        {uploadError && <div className="skill-upload-error" role="alert">{uploadError}</div>}
        <ul className="skill-upload-rules"><li>文件夹根目录必须包含 SKILL.md</li><li>SKILL.md 需包含以 YAML 格式编写的名称和描述</li></ul>
        <footer><button type="button" disabled={uploading} onClick={closeUpload}>取消</button><button className="primary" type="button" disabled={!uploadSelection || uploading} onClick={() => void confirmUpload()}>{uploading ? "上传中…" : "确认"}</button></footer>
      </section>
    </div>}

    {selected && <div className="skill-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="skill-detail-modal" role="dialog" aria-modal="true" aria-labelledby="skill-detail-title">
        <header><div><span>详情</span><h2 id="skill-detail-title">{selected.name}</h2></div><button className="skill-modal-close" type="button" aria-label="关闭" onClick={() => setSelected(null)}><CloseIcon /></button></header>
        <p>{selected.description || "暂无描述"}</p>
        <div className="skill-detail-content">{detailLoading ? <span>正在加载…</span> : <pre>{content}</pre>}</div>
      </section>
    </div>}

    {pendingDelete && <div className="skill-modal-backdrop" role="presentation">
      <section className="skill-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="skill-delete-title">
        <h2 id="skill-delete-title">确认删除“{pendingDelete.name}”？</h2><p>删除后将无法恢复。</p>
        <div><button type="button" disabled={deleting} onClick={() => setPendingDelete(null)}>取消</button><button className="danger" type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? "正在删除…" : "删除"}</button></div>
      </section>
    </div>}
  </main>;
}
