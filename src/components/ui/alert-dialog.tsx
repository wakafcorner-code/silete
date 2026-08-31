"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogHeader, DialogFooter } from "./dialog";
import { Button } from "./button";

interface AlertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
}

export function AlertDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Hapus",
  loading = false,
}: AlertDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader title={title} onClose={onClose} />
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-red-100 p-2 shrink-0">
          <AlertTriangle className="w-4 h-4 text-red-600" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Memproses..." : confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
