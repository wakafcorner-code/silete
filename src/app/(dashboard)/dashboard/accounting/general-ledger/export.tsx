"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: unknown) => formatCurrency(v as number | string | null | undefined);

const COLUMNS = [
  { header: "Tanggal", key: "entry_date", align: "left" as const },
  { header: "No. Jurnal", key: "journal_number", align: "left" as const },
  { header: "Kode Akun", key: "account_code", align: "left" as const },
  { header: "Nama Akun", key: "account_name", align: "left" as const },
  { header: "Keterangan", key: "description", align: "left" as const },
  { header: "Debit", key: "debit", align: "right" as const, format: fmt },
  { header: "Credit", key: "credit", align: "right" as const, format: fmt },
];

export function GeneralLedgerExport({ entries }: { entries: any[] }) {
  const rows: Record<string, unknown>[] = entries.map((e) => ({
    entry_date: e.entry_date ?? e.posted_at ?? e.posting_date ?? "",
    journal_number: e.journal_number ?? e.journal_no ?? "",
    account_code: e.account_code ?? "",
    account_name: e.account_name ?? "",
    description: e.description ?? "",
    debit: e.debit ?? 0,
    credit: e.credit ?? 0,
  }));

  return (
    <ExportButtons
      rows={rows}
      columns={COLUMNS}
      filename="buku_besar"
      title="Buku Besar (General Ledger)"
      subtitle="Mutasi Debit &amp; Credit seluruh akun — SILETE"
    />
  );
}
