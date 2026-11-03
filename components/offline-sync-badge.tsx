"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudCheck, HardDrive, RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type OfflineSyncState = "device" | "waiting" | "server";

interface OfflineSyncBadgeProps {
  className?: string;
  forceState?: OfflineSyncState;
}

export function OfflineSyncBadge({ className = "", forceState }: OfflineSyncBadgeProps) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [hasPendingQueue, setHasPendingQueue] = useState<boolean>(false);
  const [hasDeviceDraft, setHasDeviceDraft] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<OfflineSyncState>("server");

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      window.dispatchEvent(new CustomEvent("techcommand:queue-change"));
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncState("waiting");
    };

    const handleQueueChange = () => {
      // Check offline queue and draft indicators
      try {
        const queueCount = parseInt(localStorage.getItem("techcommand:pending-sync-count") || "0", 10);
        const draftActive = Boolean(localStorage.getItem("techcommand:active-device-draft"));
        
        setHasPendingQueue(queueCount > 0);
        setHasDeviceDraft(draftActive);

        if (!navigator.onLine || queueCount > 0) {
          setSyncState("waiting");
        } else if (draftActive) {
          setSyncState("device");
        } else {
          setSyncState("server");
        }
      } catch {
        // Fallback to online status
        setSyncState(navigator.onLine ? "server" : "waiting");
      }
    };

    const handleSyncComplete = () => {
      setSyncState("server");
      setHasPendingQueue(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("techcommand:queue-change", handleQueueChange);
    window.addEventListener("techcommand:sync-complete", handleSyncComplete);

    // Initial check
    handleQueueChange();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("techcommand:queue-change", handleQueueChange);
      window.removeEventListener("techcommand:sync-complete", handleSyncComplete);
    };
  }, []);

  const activeState = forceState || syncState;

  if (activeState === "waiting" || !isOnline) {
    return (
      <Badge
        variant="outline"
        className={`flex items-center gap-1.5 border-amber-400/80 bg-amber-500/15 text-amber-200 px-2.5 py-1 text-xs font-semibold shadow-sm ${className}`}
        title="Network disconnected or waiting to sync requests with server"
      >
        <RefreshCw className="size-3 animate-spin text-amber-300" />
        <span>Waiting to sync</span>
      </Badge>
    );
  }

  if (activeState === "device") {
    return (
      <Badge
        variant="outline"
        className={`flex items-center gap-1.5 border-cyan-400/80 bg-cyan-500/15 text-cyan-200 px-2.5 py-1 text-xs font-semibold shadow-sm ${className}`}
        title="Saved securely in local device storage"
      >
        <HardDrive className="size-3 text-cyan-300" />
        <span>Saved on this device</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 border-emerald-400/60 bg-emerald-500/15 text-emerald-200 px-2.5 py-1 text-xs font-semibold shadow-sm ${className}`}
      title="Saved and acknowledged by cloud server"
    >
      <Cloud className="size-3 text-emerald-300" />
      <span>Saved to server</span>
    </Badge>
  );
}

