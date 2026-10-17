import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("找不到应用挂载节点 #app");

createRoot(rootElement).render(<StrictMode><App /></StrictMode>);
