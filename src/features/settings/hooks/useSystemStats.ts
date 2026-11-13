import { useEffect, useState } from 'react';
import { isDesktopApp, platform } from '../../../platform';
import { logger } from '../../../logger.js';

export interface SystemStats { cpu: number | null; ram: number | null; gpu: number | null; }
const EMPTY_STATS: SystemStats = { cpu: null, ram: null, gpu: null };

export function useSystemStats() {
  const [stats, setStats] = useState<SystemStats>(EMPTY_STATS);
  useEffect(() => {
    if (!isDesktopApp()) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failureReported = false;
    const poll = async () => {
      try { const next = await platform.getSystemStats(); if (active) setStats(next); failureReported = false; }
      catch (reason) { if (active) setStats(EMPTY_STATS); if (!failureReported) void logger.warn('system_monitor.sample_failed', reason instanceof Error ? reason.message : String(reason)); failureReported = true; }
      if (active) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, []);
  return stats;
}
