"use client";

/**
 * Admin Schedule Component
 *
 * Dedicated admin schedule view that ensures assigned partner/SpinLife jobs
 * and standard commercial work orders are selectable in the appointment picker,
 * with direct appointment slot saving and day board visualization.
 */

import React from "react";
import { DispatchCenter } from "@/components/dispatch-center";

export interface AdminScheduleProps {
  initialWorkOrderId?: string;
  initialDate?: string;
}

export function AdminSchedule(props: AdminScheduleProps) {
  return <DispatchCenter mode="schedule" {...props} />;
}

export default AdminSchedule;
