"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

interface TrialBalanceRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: string;
  debit_total: number | string;
  credit_total: number | string;
  ending_balance: number | string;
}

interface Props {
  rows: TrialBalanceRow[];
  asOfDate: string;
  totalDebit: number;
  totalCredit: number;
}

const COLUMNS = [
  { header: "Kode Akun", key: "account_code", align: "left" as const },
  { header: "Nama Akun", key: "account_name", align: "left" as const },
  { header: "Tipe Akun", key: "account_type", align: "left" as const },
  { header: "Saldo Normal", key: "normal_balance", align: "center" as const },
  {
    header: "Mutasi Debit",
    key: "debit_total",
    align: "right" as const,
    format: (v: unknown) => formatCurrency(v as number | string | null | undefined),
  },
  {
    header: "Mutasi Credit",
    key: "credit_total",
    align: "right" as const,
    format: (v: unknown) => formatCurrency(v as number | string | null | undefined),
  },
  {
    header: "Saldo Akhir",
    key: "ending_balance",
    align: "right" as const,
    format: (v: unknown) => formatCurrency(v as number | string | null | undefined),
  },
];

export function TrialBalanceExport({ rows, asOfDate }: Props) {
  const exportRows = rows.map((r) => ({ ...r } as Record<string, unknown>));
  return (
    <ExportButtons
      rows={exportRows}
      columns={COLUMNS}
      filename="neraca_saldo"
      title="Neraca Saldo (Trial Balance)"
      subtitle={`Per tanggal ${asOfDate} — SILETE`}
    />
  );
}
