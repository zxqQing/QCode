import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "../node_modules/monaco-editor/esm/vs/editor/editor.worker.js?worker";
import JsonWorker from "../node_modules/monaco-editor/esm/vs/language/json/json.worker.js?worker";
import CssWorker from "../node_modules/monaco-editor/esm/vs/language/css/css.worker.js?worker";
import HtmlWorker from "../node_modules/monaco-editor/esm/vs/language/html/html.worker.js?worker";
import TypeScriptWorker from "../node_modules/monaco-editor/esm/vs/language/typescript/ts.worker.js?worker";

const workerScope = self as typeof self & {
  MonacoEnvironment: { getWorker: (_moduleId: string, label: string) => Worker };
};

workerScope.MonacoEnvironment = {
  getWorker: (_moduleId, label) => {
    if (label === "json") return new JsonWorker();
    if (["css", "scss", "less"].includes(label)) return new CssWorker();
    if (["html", "handlebars", "razor"].includes(label)) return new HtmlWorker();
    if (["typescript", "javascript"].includes(label)) return new TypeScriptWorker();
    return new EditorWorker();
  }
};

loader.config({ monaco });
