/**
 * ERP Manajemen — Client-side Export Utilities
 *
 * Export to Excel (CSV) and PDF (print-friendly HTML window).
 * No external library required — uses native browser APIs only.
 */

export interface ExportColumn {
  header: string;
  key: string;
  align?: "left" | "right" | "center";
  format?: (value: unknown) => string;
}

// ─── CSV / Excel Export ───────────────────────────────────────────────────────

/**
 * Converts an array of row objects to a CSV string and triggers download.
 */
export function exportToCSV(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  filename: string
): void {
  const headers = columns.map((c) => `"${c.header}"`).join(",");

  const csvRows = rows.map((row) =>
    columns
      .map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw) : raw ?? "";
        const str = String(value).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(",")
  );

  const csv = [headers, ...csvRows].join("\r\n");
  const BOM = "\uFEFF"; // UTF-8 BOM so Excel reads Indonesian characters correctly
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PDF (Print) Export ───────────────────────────────────────────────────────

/**
 * Opens a print-ready HTML window with a styled table and triggers browser print dialog.
 */
export function exportToPDF(
  rows: Record<string, unknown>[],
  columns: ExportColumn[],
  title: string,
  subtitle?: string
): void {
  const now = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const theadCells = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? "left"};padding:8px 12px;background:#1e293b;color:#f8fafc;font-size:11px;font-weight:600;white-space:nowrap;border:1px solid #334155">${c.header}</th>`
    )
    .join("");

  const tbodyRows = rows
    .map((row, i) => {
      const cells = columns
        .map((col) => {
          const raw = row[col.key];
          const value = col.format ? col.format(raw) : raw ?? "";
          return `<td style="text-align:${col.align ?? "left"};padding:6px 12px;font-size:11px;border:1px solid #e2e8f0;color:#1e293b">${String(value)}</td>`;
        })
        .join("");
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `<tr style="background:${bg}">${cells}</tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #1e293b; }
    .header { margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }
    .header h1 { font-size: 18px; font-weight: 700; color: #0f172a; }
    .header p { font-size: 11px; color: #64748b; margin-top: 4px; }
    .meta { display: flex; justify-content: space-between; font-size: 10px; color: #64748b; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    thead th { position: sticky; top: 0; }
    .footer { margin-top: 16px; font-size: 10px; color: #94a3b8; text-align: right; }
    @media print {
      body { padding: 12px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    ${subtitle ? `<p>${subtitle}</p>` : ""}
    <div class="meta">
      <span>SILETE — Multi-Company System</span>
      <span>Dicetak: ${now}</span>
    </div>
  </div>
  <table>
    <thead><tr>${theadCells}</tr></thead>
    <tbody>${tbodyRows}</tbody>
  </table>
  <div class="footer">Total ${rows.length} baris data — SILETE v1.0</div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=1100,height=700");
  if (!win) {
    alert("Pop-up diblokir browser. Izinkan pop-up untuk halaman ini lalu coba lagi.");
    return;
  }
  win.document.write(html);
  win.document.close();
}

// ─── Single Invoice PDF ───────────────────────────────────────────────────────

/**
 * Triggers a print-ready window for a single invoice document.
 */
export function exportSingleInvoiceToPDF(invoice: any): void {
  const now = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${invoice.invoice_no}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; line-height: 1.5; }
    .invoice-box { max-width: 800px; margin: auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 20px; }
    .logo { font-size: 28px; font-weight: 800; color: #2563eb; }
    .company-info { text-align: right; font-size: 12px; color: #64748b; }
    .details { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .details div { width: 48%; }
    .details h3 { font-size: 14px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
    .details p { font-size: 13px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f8fafc; text-align: left; padding: 12px; font-size: 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
    .totals { display: flex; flex-direction: column; align-items: flex-end; }
    .total-row { display: flex; width: 250px; justify-content: space-between; padding: 4px 0; }
    .grand-total { border-top: 2px solid #e2e8f0; margin-top: 8px; padding-top: 8px; font-weight: 800; font-size: 16px; color: #2563eb; }
    .footer { margin-top: 50px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      .invoice-box { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="header">
      <div class="logo">SILETE ERP</div>
      <div class="company-info">
        <p><strong>Diterbitkan Oleh:</strong></p>
        <p>PT. Manajemen Solusi Terpadu</p>
        <p>Jl. Teknologi Informasi No. 404</p>
        <p>Jakarta, Indonesia</p>
      </div>
    </div>

    <div style="margin-bottom: 20px;">
      <h1 style="font-size: 24px; color: #0f172a;">FAKTUR RESMI</h1>
      <p style="font-size: 12px; color: #64748b;">Nomor: ${invoice.invoice_no}</p>
    </div>

    <div class="details">
      <div>
        <h3>Tujuan Tagihan</h3>
        <p>${invoice.customer_name || invoice.supplier_name || "-"}</p>
        <p style="font-weight: 400; color: #64748b;">${invoice.address || "Alamat tidak tersedia"}</p>
      </div>
      <div style="text-align: right;">
        <h3>Informasi Faktur</h3>
        <p>Tanggal: ${new Date(invoice.invoice_date).toLocaleDateString("id-ID")}</p>
        <p>Jatuh Tempo: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("id-ID") : "-"}</p>
        <p>Status: ${String(invoice.status).toUpperCase()}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Deskripsi Item</th>
          <th style="text-align: right; width: 100px;">Kuantitas</th>
          <th style="text-align: right; width: 150px;">Harga Satuan</th>
          <th style="text-align: right; width: 150px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${invoice.items?.map((item: any) => `
          <tr>
            <td>${item.product_name || item.description || "Produk"}</td>
            <td style="text-align: right;">${item.quantity}</td>
            <td style="text-align: right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.unit_price)}</td>
            <td style="text-align: right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.line_total || (item.quantity * item.unit_price))}</td>
          </tr>
        `).join('') || `
          <tr>
            <td>Biaya Transaksi / Tagihan Umum</td>
            <td style="text-align: right;">1</td>
            <td style="text-align: right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.total_amount)}</td>
            <td style="text-align: right;">${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.total_amount)}</td>
          </tr>
        `}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row">
        <span>Subtotal:</span>
        <span>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.subtotal || invoice.total_amount)}</span>
      </div>
      <div class="total-row">
        <span>Pajak (PPN):</span>
        <span>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.tax_amount || 0)}</span>
      </div>
      <div class="total-row grand-total">
        <span>TOTAL AKHIR:</span>
        <span>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.total_amount)}</span>
      </div>
    </div>

    <div class="footer">
      <p>Terima kasih atas kerja sama Anda.</p>
      <p>Dokumen ini diterbitkan secara elektronik oleh sistem SILETE ERP pada ${now}.</p>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) {
    alert("Pop-up diblokir browser. Izinkan pop-up untuk halaman ini lalu coba lagi.");
    return;
  }
  win.document.write(html);
  win.document.close();
}
