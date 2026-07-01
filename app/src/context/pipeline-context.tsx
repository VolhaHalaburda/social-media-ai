"use client";

import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import type { PipelineProgress } from "@/lib/types";

interface PipelineContextValue {
  running: boolean;
  progress: PipelineProgress | null;
  runPipeline: (params: { configName: string; maxVideos: number; topK: number; nDays: number }) => void;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_ERRORS = 6;

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  // Set to false to stop the poll loop (e.g. on unmount).
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const runPipeline = useCallback(
    async (params: { configName: string; maxVideos: number; topK: number; nDays: number }) => {
      if (running) return;
      setRunning(true);
      setProgress({
        status: "running",
        phase: "scraping",
        activeTasks: [],
        creatorsCompleted: 0,
        creatorsTotal: 0,
        creatorsScraped: 0,
        videosAnalyzed: 0,
        videosTotal: 0,
        errors: [],
        log: ["Starting pipeline…"],
      });

      try {
        const startRes = await fetch("/api/pipeline/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        if (!startRes.ok) throw new Error(`Failed to start pipeline (${startRes.status})`);
        const { jobId } = (await startRes.json()) as { jobId: string };

        // Poll the job until it finishes. Work continues server-side across
        // many invocations regardless of this page — polling just observes it.
        let pollErrors = 0;
        while (activeRef.current) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          if (!activeRef.current) break;

          let data: PipelineProgress;
          try {
            const res = await fetch(`/api/pipeline/status?jobId=${jobId}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`status ${res.status}`);
            data = (await res.json()) as PipelineProgress;
            pollErrors = 0;
          } catch {
            // Tolerate transient blips (a worker invocation briefly saturating
            // the function, a dropped request) before declaring failure.
            if (++pollErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
              throw new Error("Lost contact with the pipeline while polling for progress.");
            }
            continue;
          }

          setProgress(data);
          if (data.status === "completed" || data.status === "error") break;
        }
      } catch (err) {
        setProgress((prev) => ({
          ...(prev || {
            phase: "done" as const,
            activeTasks: [],
            creatorsCompleted: 0,
            creatorsTotal: 0,
            creatorsScraped: 0,
            videosAnalyzed: 0,
            videosTotal: 0,
            log: [],
          }),
          status: "error" as const,
          errors: [...(prev?.errors || []), err instanceof Error ? err.message : "Unknown error"],
        }));
      } finally {
        setRunning(false);
      }
    },
    [running]
  );

  return (
    <PipelineContext.Provider value={{ running, progress, runPipeline }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline() {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used within PipelineProvider");
  return ctx;
}
