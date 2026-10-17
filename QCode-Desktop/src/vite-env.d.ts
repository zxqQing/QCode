/// <reference types="vite/client" />

interface ElectronDirectoryResult {
  canceled: boolean;
  path: string;
}

interface Window {
  electronAPI?: {
    selectDirectory: () => Promise<ElectronDirectoryResult>;
    backendStatus: () => Promise<{ running: boolean; port: number }>;
    revealSessionFile: (sessionId: string, filePath: string) => Promise<boolean>;
    openSessionFile: (sessionId: string, filePath: string) => Promise<boolean>;
  };
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_QCODE_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
