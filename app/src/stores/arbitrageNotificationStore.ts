import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FrozenArbitrageStep {
  qty: number;
  leg1: string;
  leg2: string;
  price1: number;
  price2: number;
}

export interface FrozenArbitrageCard {
  pairId: string;
  capturedAt: number;
  opportunityCount?: number;
  lastCheckAt?: number;
  minProfitAlert?: number;
  predictFeeRate?: number;
  polymarketFeeRate?: number;
  predictTitle: string;
  predictParentTitle?: string;
  predictUrl?: string;
  polymarketTitle: string;
  polymarketParentTitle?: string;
  polymarketUrl?: string;
  profitRate: number;
  netProfit: number;
  qty: number;
  strategy: string;
  reason: string;
  steps: FrozenArbitrageStep[];
}

interface ArbitrageNotificationStore {
  cards: FrozenArbitrageCard[];
  mappedPairIds: string[];
  addFrozenCard: (card: FrozenArbitrageCard) => void;
  removeCard: (pairId: string) => void;
  clearAll: () => void;
}

const MAX_NOTIFICATION_CARDS = 100;

export const useArbitrageNotificationStore = create<ArbitrageNotificationStore>()(
  persist(
    (set) => ({
      cards: [],
      mappedPairIds: [],
      addFrozenCard: (card) =>
        set((state) => {
          if (state.mappedPairIds.includes(card.pairId)) {
            return state;
          }

          const nextCards = [card, ...state.cards];
          const nextMappedIds = [card.pairId, ...state.mappedPairIds];

          if (nextCards.length > MAX_NOTIFICATION_CARDS) {
            const trimmedCards = nextCards.slice(0, MAX_NOTIFICATION_CARDS);
            const trimmedMappedIds = trimmedCards.map((x) => x.pairId);
            return { cards: trimmedCards, mappedPairIds: trimmedMappedIds };
          }

          return { cards: nextCards, mappedPairIds: nextMappedIds };
        }),
      removeCard: (pairId) =>
        set((state) => ({
          cards: state.cards.filter((x) => x.pairId !== pairId),
          mappedPairIds: state.mappedPairIds.filter((id) => id !== pairId),
        })),
      clearAll: () => set({ cards: [], mappedPairIds: [] }),
    }),
    {
      name: 'arbitrage-notification-cards',
      partialize: (state) => ({
        cards: state.cards,
        mappedPairIds: state.mappedPairIds,
      }),
    }
  )
);
