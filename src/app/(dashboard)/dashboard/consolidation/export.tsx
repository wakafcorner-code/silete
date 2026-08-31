"use client";

import React from "react";
import { ExportButtons } from "@/components/ui/export-buttons";
import { formatCurrency } from "@/lib/utils";

const fmt = (v: unknown) => formatCurrency(v as number | string | null | undefined);

const COLUMNS = [
  { header: "Kode Akun", key: "account_code", align: "left" as const },
  { header: "Nama Akun", key: "account_name", align: "left" as const },
  { header: "Tipe Akun", key: "account_type", align: "left" as const },
  { header: "Company A", key: "company_a_balance", align: "right" as const, format: fmt },
  { header: "Company B", key: "company_b_balance", align: "right" as const, format: fmt },
  { header: "Eliminasi Debit", key: "elimination_debit", align: "right" as const, format: fmt },
  { header: "Eliminasi Credit", key: "elimination_credit", align: "right" as const, format: fmt },
  { header: "Saldo Konsolidasi", key: "consolidated_balance", align: "right" as const, format: fmt },
];

export function ConsolidationExport({ rows }: { rows: any[] }) {
  const exportRows: Record<string, unknown>[] = rows.map((r) => ({
    account_code: r.account_code ?? "",
    account_name: r.account_name ?? "",
    account_type: r.account_type ?? "",
    company_a_balance: r.company_a_balance ?? r.company_1_balance ?? 0,
    company_b_balance: r.company_b_balance ?? r.company_2_balance ?? 0,
    elimination_debit: r.elimination_debit ?? 0,
    elimination_credit: r.elimination_credit ?? 0,
    consolidated_balance: r.consolidated_balance ?? 0,
  }));

  return (
    <ExportButtons
      rows={exportRows}
      columns={COLUMNS}
      filename="laporan_konsolidasi_grup"
      title="Kertas Kerja Neraca Saldo Konsolidasi"
      subtitle="Penggabungan laporan keuangan antar entitas & eliminasi — SILETE"
    />
  );
}
