"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { uploadDocumentationAction } from "@/lib/actions/upload";
import { useToast } from "@/components/ui/toast";
import { Plus, Loader2 } from "lucide-react";

export function UploadDocumentationForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const res = await uploadDocumentationAction(formData);
      if (res.success) {
        toast("success", "Berhasil", "Dokumentasi telah diunggah.");
        setOpen(false);
      } else {
        toast("error", "Gagal", res.error || "Gagal mengunggah file.");
      }
    } catch (err) {
      toast("error", "Kesalahan", "Terjadi kesalahan saat mengunggah.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Upload Foto
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogHeader
          title="Unggah Dokumentasi Baru"
          description="Pilih foto dan berikan kategori serta catatan."
          onClose={() => setOpen(false)}
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Pilih Foto</Label>
            <Input id="file" name="file" type="file" accept="image/*" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Kategori</Label>
            <Select name="category" defaultValue="General">
              <option value="Nota">Nota / Bukti Bayar</option>
              <option value="Barang">Kondisi Barang</option>
              <option value="Proyek">Laporan Lapangan</option>
              <option value="General">Lain-lain</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Keterangan Singkat</Label>
            <Textarea id="notes" name="notes" placeholder="Contoh: Beli bensin mobil operasional" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengunggah...
                </>
              ) : (
                "Simpan Dokumentasi"
              )}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
