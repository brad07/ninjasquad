declare global {
  interface Window {
    loadSessions?: () => void;
  }
}

export {};