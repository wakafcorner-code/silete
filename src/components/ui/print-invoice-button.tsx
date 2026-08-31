"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { exportSingleInvoiceToPDF } from "@/lib/export";

interface PrintInvoiceButtonProps {
  invoice: any;
}

export function PrintInvoiceButton({ invoice }: PrintInvoiceButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
      onClick={() => exportSingleInvoiceToPDF(invoice)}
      title="Cetak Invoice"
    >
      <Printer className="w-3.5 h-3.5" />
    </Button>
  );
}
