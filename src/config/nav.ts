import { NavSection } from "@/types";

/**
 * Navigation sections with required permissions per item.
 * `requiredPermission` is an array — user needs ANY ONE of the listed permissions.
 * Leave empty → visible to all authenticated users.
 */
export const NAVIGATION_SECTIONS: NavSection[] = [
  {
    title: "Utama",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: "LayoutDashboard",
        requiredPermission: ["dashboard.view"],
      },
      {
        title: "Pusat Persetujuan",
        href: "/dashboard/approvals",
        icon: "CheckSquare",
        badge: "0",
        requiredPermission: [
          "purchasing.manage",
          "sales.manage",
          "finance.manage",
          "inventory.manage",
        ],
      },
      {
        title: "Dokumentasi Foto",
        href: "/documentation",
        icon: "Camera",
        requiredPermission: ["dashboard.view"],
      },
    ],
  },
  {
    title: "Operasional",
    items: [
      {
        title: "Master Data",
        href: "/dashboard/master",
        icon: "Database",
        requiredPermission: ["inventory.view", "purchasing.view", "sales.view"],
        children: [
          {
            title: "Produk & Kategori",
            href: "/dashboard/master/products",
            requiredPermission: ["inventory.view"],
          },
          {
            title: "Pelanggan",
            href: "/dashboard/master/customers",
            requiredPermission: ["sales.view"],
          },
          {
            title: "Pemasok / Supplier",
            href: "/dashboard/master/suppliers",
            requiredPermission: ["purchasing.view"],
          },
          {
            title: "Karyawan",
            href: "/dashboard/master/employees",
            requiredPermission: ["company.view"],
          },
          {
            title: "Gudang & Cabang",
            href: "/dashboard/master/warehouses",
            requiredPermission: ["inventory.view"],
          },
        ],
      },
      {
        title: "Gudang & Inventori",
        href: "/dashboard/inventory",
        icon: "Boxes",
        requiredPermission: ["inventory.view"],
        children: [
          {
            title: "Stok Barang",
            href: "/dashboard/inventory/stock",
            requiredPermission: ["inventory.view"],
          },
          {
            title: "Penerimaan Barang",
            href: "/dashboard/inventory/receiving",
            requiredPermission: ["inventory.manage"],
          },
          {
            title: "Transfer Gudang",
            href: "/dashboard/inventory/transfers",
            requiredPermission: ["inventory.manage"],
          },
          {
            title: "Penyesuaian Stok",
            href: "/dashboard/inventory/adjustments",
            requiredPermission: ["inventory.manage"],
          },
          {
            title: "Buku Mutasi",
            href: "/dashboard/inventory/movements",
            requiredPermission: ["inventory.view"],
          },
        ],
      },
      {
        title: "Pembelian (Purchasing)",
        href: "/dashboard/purchasing",
        icon: "ShoppingCart",
        requiredPermission: ["purchasing.view"],
        children: [
          {
            title: "Permintaan Beli (PR)",
            href: "/dashboard/purchasing/requests",
            requiredPermission: ["purchasing.view"],
          },
          {
            title: "Pesanan Beli (PO)",
            href: "/dashboard/purchasing/orders",
            requiredPermission: ["purchasing.view"],
          },
          {
            title: "Penerimaan Barang (GR)",
            href: "/dashboard/purchasing/receipts",
            requiredPermission: ["purchasing.view"],
          },
          {
            title: "Faktur Pemasok",
            href: "/dashboard/purchasing/invoices",
            requiredPermission: ["purchasing.view"],
          },
        ],
      },
      {
        title: "Penjualan (Sales)",
        href: "/dashboard/sales",
        icon: "TrendingUp",
        requiredPermission: ["sales.view"],
        children: [
          {
            title: "Pesanan Jual (SO)",
            href: "/dashboard/sales/orders",
            requiredPermission: ["sales.view"],
          },
          {
            title: "Pengiriman Barang (DO)",
            href: "/dashboard/sales/deliveries",
            requiredPermission: ["sales.view"],
          },
          {
            title: "Faktur Penjualan",
            href: "/dashboard/sales/invoices",
            requiredPermission: ["sales.view"],
          },
        ],
      },
    ],
  },
  {
    title: "Keuangan & Akuntansi",
    items: [
      {
        title: "Kas & Bank",
        href: "/dashboard/finance",
        icon: "Wallet",
        requiredPermission: ["finance.view"],
        children: [
          {
            title: "Manajemen Kas",
            href: "/dashboard/finance/cash",
            requiredPermission: ["finance.view"],
          },
          {
            title: "Rekening Bank",
            href: "/dashboard/finance/bank",
            requiredPermission: ["finance.view"],
          },
          {
            title: "Pengeluaran Biaya",
            href: "/dashboard/finance/expenses",
            requiredPermission: ["finance.view"],
          },
        ],
      },
      {
        title: "Hutang & Piutang",
        href: "/dashboard/ar-ap",
        icon: "CreditCard",
        requiredPermission: ["finance.view"],
        children: [
          {
            title: "Piutang Usaha (AR)",
            href: "/dashboard/ar-ap/receivables",
            requiredPermission: ["finance.view"],
          },
          {
            title: "Hutang Usaha (AP)",
            href: "/dashboard/ar-ap/payables",
            requiredPermission: ["finance.view"],
          },
          {
            title: "Pembayaran & Alokasi",
            href: "/dashboard/ar-ap/payments",
            requiredPermission: ["finance.manage"],
          },
        ],
      },
      {
        title: "Buku Besar & Jurnal",
        href: "/dashboard/accounting",
        icon: "BookOpen",
        requiredPermission: ["accounting.view"],
        children: [
          {
            title: "Bagan Akun (COA)",
            href: "/dashboard/accounting/accounts",
            requiredPermission: ["accounting.view"],
          },
          {
            title: "Entri Jurnal",
            href: "/dashboard/accounting/journals",
            requiredPermission: ["accounting.view"],
          },
          {
            title: "Buku Besar (GL)",
            href: "/dashboard/accounting/general-ledger",
            requiredPermission: ["accounting.view"],
          },
          {
            title: "Neraca Saldo",
            href: "/dashboard/accounting/trial-balance",
            requiredPermission: ["accounting.view"],
          },
          {
            title: "Periode Keuangan",
            href: "/dashboard/accounting/periods",
            requiredPermission: ["accounting.manage"],
          },
        ],
      },
      {
        title: "Aset Tetap & Depresiasi",
        href: "/dashboard/assets",
        icon: "Building2",
        requiredPermission: ["asset.view"],
      },
      {
        title: "Antar Perusahaan",
        href: "/dashboard/intercompany",
        icon: "ArrowLeftRight",
        requiredPermission: ["intercompany.view"],
      },
      {
        title: "Laporan & Konsolidasi",
        href: "/dashboard/consolidation",
        icon: "FileText",
        requiredPermission: ["reports.view"],
        children: [
          {
            title: "Konsolidasi Entitas",
            href: "/dashboard/consolidation",
            requiredPermission: ["reports.view"],
          },
          {
            title: "Analisa Usaha Timah",
            href: "/dashboard/analysis",
            requiredPermission: ["reports.view"],
          },
        ],
      },
    ],
  },
  {
    title: "Pengaturan & Sistem",
    items: [
      {
        title: "Manajemen Perusahaan",
        href: "/dashboard/admin/companies",
        icon: "Briefcase",
        requiredPermission: ["company.manage"],
      },
      {
        title: "Jejak Audit (Audit Log)",
        href: "/dashboard/audit",
        icon: "ShieldAlert",
        requiredPermission: ["audit.view"],
      },
    ],
  },
];
