import React from "react";
import { getServerSession } from "@/services/session-service";
import { listSupplierInvoices } from "@/services/supplier-invoice-service";
import SupplierInvoicesClient from "./client-page";

export const dynamic = "force-dynamic";

export default async function SupplierInvoicesPage() {
  const session = await getServerSession();
  const { data: invoices } = await listSupplierInvoices(session, { limit: 50 });

  return <SupplierInvoicesClient initialData={invoices} />;
}
