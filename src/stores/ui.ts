import { create } from "zustand";

type UiState = {
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
};

// UI state only: no accounts, transactions, balances or other database records here.
export const useUiStore = create<UiState>((set) => ({
  addDialogOpen: false,
  setAddDialogOpen: (addDialogOpen) => set({ addDialogOpen }),
}));
