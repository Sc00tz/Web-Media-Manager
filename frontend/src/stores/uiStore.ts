import { create } from "zustand";

interface UiStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
