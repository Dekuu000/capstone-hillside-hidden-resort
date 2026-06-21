"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportsOverviewResponse } from "../../../packages/shared/src/types";
import { ReportDocument } from "./ReportDocument";

/**
 * Renders the printable report as a direct child of <body> (via a portal) so the
 * print stylesheet can isolate it: in print, every other body child is hidden
 * and only #printable-report shows. This lets "Print / Save as PDF" open the
 * native dialog in the same window — no new tab — while printing the document
 * and nothing else. Hidden on screen via the .print-only class.
 */
export function PrintableReport({
  overview,
  preparedBy,
  generatedAt,
}: {
  overview: ReportsOverviewResponse;
  preparedBy: string;
  generatedAt: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div id="printable-report" className="print-only">
      <ReportDocument overview={overview} preparedBy={preparedBy} generatedAt={generatedAt} />
    </div>,
    document.body,
  );
}
