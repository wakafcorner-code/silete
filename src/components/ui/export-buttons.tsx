"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Printer } from "lucide-react";
import { exportToCSV, exportToPDF, ExportColumn } from "@/lib/export";

interface ExportButtonsProps {
  rows: Record<string, unknown>[];
  columns: ExportColumn[];
  filename: string;
  title: string;
  subtitle?: string;
}

/**
 * Reusable Export to Excel (CSV) + Print/PDF buttons.
 * Drop this anywhere in a page that has tabular financial data.
 */
export function ExportButtons({
  rows,
  columns,
  filename,
  title,
  subtitle,
}: ExportButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportToCSV(rows, columns, filename)}
        title="Download sebagai file Excel/CSV"
        className="h-8 text-xs gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
        Excel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => exportToPDF(rows, columns, title, subtitle)}
        title="Cetak / Export ke PDF"
        className="h-8 text-xs gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
      >
        <Printer className="w-3.5 h-3.5" />
        PDF / Cetak
      </Button>
    </div>
  );
}
