// React hook：订阅 SSE，实时维护 opportunities / state。
//
// 用法：
//   const { opportunities, state, error } = useArbitrageStream();
//
// 语义：
//   - opportunities：去重后的最新机会列表（按 pairId 键，新机会覆盖旧机会）
//   - state：协调器状态（连接情况、每秒扫描次数等）
//   - error：SSE 错误（通常是网络短暂断开；EventSource 会自动重连）

import { useEffect, useRef, useState } from 'react';
import {
  openArbitrageStream,
} from '@/api/arbitrageV2';
import type {
  ArbOpportunityDTO,
  CoordinatorStateDTO,
  StreamEvent,
} from '@/api/arbitrageV2';

export interface UseArbitrageStreamResult {
  readonly opportunities: readonly ArbOpportunityDTO[];
  readonly state: CoordinatorStateDTO | null;
  readonly error: string | null;
  readonly lastEventAt: number;
  readonly connected: boolean;
}

export function useArbitrageStream(): UseArbitrageStreamResult {
  const [opportunities, setOpportunities] = useState<readonly ArbOpportunityDTO[]>([]);
  const [state, setState] = useState<CoordinatorStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<number>(0);
  const [connected, setConnected] = useState(false);

  // 使用 ref 存 Map，避免每次事件都 clone 整个 list 消耗性能
  const mapRef = useRef<Map<string, ArbOpportunityDTO>>(new Map());

  useEffect(() => {
    const pushList = (): void => {
      const arr = Array.from(mapRef.current.values()).sort((a, b) => b.roiPct - a.roiPct);
      setOpportunities(arr);
    };

    const handle = (ev: StreamEvent): void => {
      setLastEventAt(Date.now());
      switch (ev.type) {
        case 'opportunity': {
          mapRef.current.set(ev.data.pairId, ev.data);
          pushList();
          break;
        }
        case 'opportunity_gone': {
          if (mapRef.current.delete(ev.data.pairId)) pushList();
          break;
        }
        case 'state': {
          setState(ev.data);
          setConnected(true);
          setError(null);
          break;
        }
        case 'ping':
          setConnected(true);
          break;
        default:
          break;
      }
    };

    const onError = (): void => {
      setConnected(false);
      setError('stream disconnected, reconnecting...');
    };

    const cleanup = openArbitrageStream(handle, onError);
    return () => {
      cleanup();
      mapRef.current.clear();
    };
  }, []);

  return { opportunities, state, error, lastEventAt, connected };
}
