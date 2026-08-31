"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Check, Loader2 } from "lucide-react";
import { Company } from "@/types";

export function CompanySwitcher() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompany] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [compRes, activeRes] = await Promise.all([
          fetch("api/companies"),
          fetch("api/companies/active"),
        ]);

        if (compRes.ok) {
          const compData = await compRes.json();
          if (compData.success) {
            setCompanies(compData.companies || []);
          }
        }

        if (activeRes.ok) {
          const activeData = await activeRes.json();
          if (activeData.success && activeData.company) {
            setActiveCompany(activeData.company);
          }
        }
      } catch (err) {
        console.error("Failed to load companies for switcher:", err);
      }
    }
    loadData();
  }, []);

  const handleSelectCompany = async (company: Company) => {
    if (activeCompany?.id === company.id) {
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("api/companies/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });

      if (res.ok) {
        setActiveCompany(company);
        setOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to switch company:", err);
    } finally {
      setLoading(false);
    }
  };

  if (companies.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
        <Building2 className="w-3.5 h-3.5 text-slate-500" />
        <span>{activeCompany?.name || "Memuat..."}</span>
      </div>
    );
  }

  // If user only has 1 company, show static pill
  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700">
        <Building2 className="w-3.5 h-3.5 text-blue-600" />
        <span>{companies[0].name}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex w-full max-w-[min(200px,42vw)] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 cursor-pointer sm:min-w-[200px] sm:px-3"
      >
        <div className="flex items-center gap-2 truncate">
          <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate">{activeCompany?.name || "Pilih Perusahaan"}</span>
        </div>
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 animate-in fade-in zoom-in-95">
            <div className="px-3 py-1.5 text-[10px] uppercase font-semibold text-slate-400 border-b border-slate-100">
              Ganti Cakupan Perusahaan
            </div>
            <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
              {companies.map((c) => {
                const isSelected = activeCompany?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCompany(c)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-md text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{c.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{c.code}</span>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
