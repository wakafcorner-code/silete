import React from "react";
import { getServerSession } from "@/services/session-service";
import { listDocumentationAttachments } from "@/services/attachment-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadDocumentationForm } from "./upload-form";
import { getPublicPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DocumentationPage() {
  const session = await getServerSession();
  const docs = await listDocumentationAttachments(session);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pusat Dokumentasi</h1>
          <p className="text-muted-foreground">Kelola foto nota, bukti barang, dan dokumentasi operasional lainnya.</p>
        </div>
        <UploadDocumentationForm />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Galeri Dokumentasi</CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-lg bg-slate-50/50">
              <div className="rounded-full bg-slate-100 p-4 mb-4">
                <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">Belum ada dokumentasi</p>
              <p className="text-sm text-slate-400 mt-1">Gunakan tombol "Upload Foto" untuk memulai.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {docs.map((doc) => (
                <Card key={doc.id} className="overflow-hidden group hover:shadow-md transition-shadow">
                  <div className="relative aspect-square bg-slate-100 border-b overflow-hidden">
                    <img
                      src={getPublicPath(doc.file_path)}
                      alt={doc.file_name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="bg-white/90 shadow-sm backdrop-blur-sm">
                        {doc.category}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-semibold truncate flex-1 mr-2" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                      {new Date(doc.created_at).toLocaleDateString("id-ID", {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {doc.notes && (
                      <p className="text-xs mt-3 text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-2 rounded italic border-l-2 border-slate-200">
                        "{doc.notes}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
