"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Building,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Layers,
  MapPin,
  Maximize2,
  Navigation,
  RotateCcw,
  Sparkles,
  Truck,
  Wrench,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DispatchRoute, ScheduledJob } from "@/components/dispatch-center";

export function RouteMapCanvas({
  route,
  selectedStopId,
  onSelectStop,
}: {
  route: DispatchRoute | undefined;
  selectedStopId?: string;
  onSelectStop?: (stopId: string) => void;
}) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showGeofence, setShowGeofence] = useState(true);
  const [activeStop, setActiveStop] = useState<ScheduledJob | null>(
    route?.stops?.[0] || null,
  );

  const stops = route?.stops || [];

  // Relative coordinate mappings for Columbus / Central Ohio region
  // Westerville Hub: center-top (480, 160)
  // Stops distributed across Columbus metro
  const STOP_COORDINATES = [
    { x: 340, y: 220, label: "Dublin / Northwest" },
    { x: 520, y: 290, label: "Easton / Gahanna" },
    { x: 440, y: 360, label: "Downtown / Franklinton" },
    { x: 310, y: 440, label: "Grove City / Southwest" },
    { x: 580, y: 420, label: "Reynoldsburg / East" },
    { x: 460, y: 500, label: "Groveport / South" },
  ];

  const hubCoord = { x: 460, y: 150 };

  const handleSelect = (job: ScheduledJob) => {
    setActiveStop(job);
    if (onSelectStop && job.stopId) {
      onSelectStop(job.stopId);
    }
  };

  return (
    <div className="relative flex flex-col rounded-xl border border-slate-200 bg-slate-950 overflow-hidden shadow-inner min-h-[500px]">
      {/* Top Map Header & Controls */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 shadow-lg text-white">
          <Truck className="size-4 text-cyan-400" />
          <div>
            <span className="text-xs font-bold">{route?.technicianName || "Technician Route"}</span>
            <span className="text-[10px] text-slate-400 block">
              {stops.length} Stops · {route?.totalMiles ?? "54.2"} Miles · {route?.totalDriveMinutes ?? "94"} min
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-700/60 shadow-lg text-white">
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
            title="Zoom In"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoomLevel((z) => Math.max(0.8, z - 0.1))}
            title="Zoom Out"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 text-slate-300 hover:text-white hover:bg-slate-800"
            onClick={() => setZoomLevel(1)}
            title="Reset View"
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <div className="h-4 w-px bg-slate-700 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className={`h-7 px-2 text-[10px] ${showTraffic ? "text-emerald-400 font-semibold bg-emerald-500/10" : "text-slate-400"}`}
            onClick={() => setShowTraffic(!showTraffic)}
          >
            Traffic {showTraffic ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {/* SVG Interactive Canvas */}
      <div className="w-full h-full flex-1 flex items-center justify-center p-4 overflow-hidden">
        <svg
          viewBox="0 0 800 600"
          className="w-full h-full max-h-[560px] transition-transform duration-300 select-none"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          <defs>
            {/* Background Grid Pattern */}
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
            </pattern>
            {/* Road Glow */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Route Gradient */}
            <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>

          {/* Map Base Canvas */}
          <rect width="800" height="600" fill="#090d16" />
          <rect width="800" height="600" fill="url(#grid)" />

          {/* Columbus Territory Boundary (35-Mile Geofence) */}
          {showGeofence && (
            <g>
              <circle
                cx={hubCoord.x}
                cy={340}
                r="240"
                fill="#0284c7"
                fillOpacity="0.04"
                stroke="#0284c7"
                strokeWidth="1.2"
                strokeDasharray="6 6"
              />
              <text x="700" y="340" fill="#0284c7" fontSize="10" fontWeight="600" textAnchor="end">
                35-Mile Primary Service Geofence
              </text>
            </g>
          )}

          {/* Major Ohio Highway Arteries (I-270 Outerbelt, I-71, I-70) */}
          <g stroke="#334155" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6">
            {/* I-270 Outerbelt Ellipse */}
            <ellipse cx="450" cy="340" rx="200" ry="170" strokeWidth="2" strokeDasharray="8 4" />
            <text x="655" y="335" fill="#475569" fontSize="9" fontWeight="bold">I-270</text>
            {/* I-71 North-South */}
            <path d="M 470 40 L 460 200 L 440 380 L 370 570" />
            <text x="475" y="60" fill="#475569" fontSize="9" fontWeight="bold">I-71</text>
            {/* I-70 East-West */}
            <path d="M 100 350 L 340 360 L 480 370 L 760 380" />
            <text x="730" y="370" fill="#475569" fontSize="9" fontWeight="bold">I-70</text>
          </g>

          {/* Route Path Polyline Connecting Stops */}
          {stops.length > 0 && (
            <g>
              {/* Outer Glow Line */}
              <path
                d={`M ${hubCoord.x} ${hubCoord.y} ${stops
                  .map((_, i) => {
                    const coord = STOP_COORDINATES[i % STOP_COORDINATES.length];
                    return `L ${coord.x} ${coord.y}`;
                  })
                  .join(" ")} L ${hubCoord.x} ${hubCoord.y}`}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="6"
                strokeOpacity="0.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glow)"
              />
              {/* Core Route Line */}
              <path
                d={`M ${hubCoord.x} ${hubCoord.y} ${stops
                  .map((_, i) => {
                    const coord = STOP_COORDINATES[i % STOP_COORDINATES.length];
                    return `L ${coord.x} ${coord.y}`;
                  })
                  .join(" ")} L ${hubCoord.x} ${hubCoord.y}`}
                fill="none"
                stroke="url(#routeGradient)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}

          {/* Depot / TechFlex Westerville Main Hub Pin */}
          <g transform={`translate(${hubCoord.x}, ${hubCoord.y})`} className="cursor-pointer">
            <circle r="18" fill="#0284c7" fillOpacity="0.2" className="animate-ping" />
            <circle r="12" fill="#0369a1" stroke="#38bdf8" strokeWidth="2.5" />
            <rect x="-4" y="-4" width="8" height="8" fill="#ffffff" rx="1" />
            <text
              y="-18"
              fill="#e0f2fe"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
              className="drop-shadow"
            >
              🏢 TechFlex Hub (Westerville)
            </text>
          </g>

          {/* Sequenced Route Stops (1, 2, 3...) */}
          {stops.map((job, index) => {
            const coord = STOP_COORDINATES[index % STOP_COORDINATES.length];
            const isSelected = activeStop?.stopId === job.stopId || activeStop?.id === job.id;

            return (
              <g
                key={job.stopId || job.id}
                transform={`translate(${coord.x}, ${coord.y})`}
                onClick={() => handleSelect(job)}
                className="cursor-pointer transition-transform hover:scale-110"
              >
                {/* Pulse Ring if Selected */}
                {isSelected && (
                  <circle r="24" fill="#38bdf8" fillOpacity="0.25" className="animate-ping" />
                )}
                {/* Outer Pin */}
                <circle
                  r={isSelected ? "16" : "13"}
                  fill={isSelected ? "#2563eb" : "#0f172a"}
                  stroke={isSelected ? "#60a5fa" : "#38bdf8"}
                  strokeWidth={isSelected ? "3" : "2"}
                  className="shadow-lg"
                />
                {/* Stop Order Number */}
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#ffffff"
                  fontSize={isSelected ? "12" : "10"}
                  fontWeight="bold"
                >
                  {index + 1}
                </text>
                {/* Customer Label Chip */}
                <g transform="translate(0, 22)">
                  <rect
                    x="-60"
                    y="-8"
                    width="120"
                    height="18"
                    rx="4"
                    fill="#0f172a"
                    fillOpacity="0.9"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text
                    textAnchor="middle"
                    dy="4"
                    fill="#e2e8f0"
                    fontSize="9"
                    fontWeight="600"
                    className="truncate"
                  >
                    {job.accountName.slice(0, 16)}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Interactive Stop Detail Card */}
      {activeStop && (
        <div className="absolute bottom-3 left-3 right-3 z-10 bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-700/80 shadow-2xl text-white">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {(stops.findIndex((s) => s.id === activeStop.id) + 1) || 1}
                </span>
                <span className="font-mono text-xs font-bold text-cyan-400">{activeStop.externalId}</span>
                <Badge variant="outline" className="border-slate-600 text-slate-300 text-[10px]">
                  {activeStop.serviceType.replaceAll("_", " ")}
                </Badge>
              </div>
              <h4 className="mt-1 font-bold text-sm text-slate-100 truncate">{activeStop.accountName}</h4>
              <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                <MapPin className="size-3.5 text-slate-400 shrink-0" />
                {activeStop.address}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="text-right pr-2 hidden sm:block">
                <div className="text-xs font-bold text-slate-200 flex items-center justify-end gap-1">
                  <Clock className="size-3.5 text-cyan-400" />
                  {activeStop.scheduledStart ? new Date(activeStop.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Scheduled"}
                </div>
                <div className="text-[10px] text-emerald-400 font-semibold">
                  {activeStop.legMiles ? `${activeStop.legMiles} mi · ${activeStop.driveMinutes} min drive` : "Travel Verified"}
                </div>
              </div>

              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8"
                asChild
              >
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeStop.address)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="mr-1 size-3.5" /> Navigate <ExternalLink className="ml-1 size-3" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
