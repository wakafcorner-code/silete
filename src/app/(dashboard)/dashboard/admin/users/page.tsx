"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogHeader, DialogFooter, FormField } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Users, Plus, Loader2, Search, ShieldCheck, UserCog, Mail, Key } from "lucide-react";

interface User {
  id: number;
  username: string;
  email: string;
  name: string;
  status: string;
  role_name?: string;
  company_name?: string;
}

interface Role {
  id: number;
  name: string;
  description: string;
}

export default function UserManagementPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    username: "",
    email: "",
    name: "",
    password: "",
    role_id: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/silete/api/admin/users?search=${search}`);
      const data = await res.json();
      if (data.data) setUsers(data.data);

      // In a real app, you'd have a separate endpoint for roles
      // For now, let's assume roles are fixed or we can fetch them
      setRoles([
        { id: 1, name: "SUPER_ADMIN", description: "Full Access" },
        { id: 2, name: "ADMIN", description: "Company Admin" },
        { id: 3, name: "FINANCE_MANAGER", description: "Finance Dept" },
        { id: 4, name: "WAREHOUSE_ADMIN", description: "Gudang Dept" },
        { id: 5, name: "VIEWER", description: "Read Only" },
      ]);
    } catch {
      toast("error", "Gagal memuat data pengguna");
    } finally {
      setLoading(false);
    }
  }, [search, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!form.username || !form.role_id || !form.name) {
      toast("warning", "Mohon lengkapi data wajib");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/silete/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          role_id: Number(form.role_id),
          company_id: 0, // Root company
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast("success", "User baru berhasil dibuat");
      setDialogOpen(false);
      setForm({ username: "", email: "", name: "", password: "", role_id: "" });
      fetchData();
    } catch (err: any) {
      toast("error", "Gagal", err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <UserCog className="w-6 h-6 text-indigo-600" />
            Manajemen Pengguna
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola akses staf, posisi (role), dan kata sandi masuk sistem SILETE Enterprise.
          </p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Tambah User Baru
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cari user atau email..."
            className="pl-9 h-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow className="text-[11px] uppercase font-bold text-slate-600">
              <TableHead className="w-10">ID</TableHead>
              <TableHead>Nama Lengkap</TableHead>
              <TableHead>Username / Email</TableHead>
              <TableHead>Posisi (Role)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-400" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-slate-400 italic">
                  Belum ada data user.
                </TableCell>
              </TableRow>
            ) : users.map((u) => (
              <TableRow key={u.id} className="text-xs hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-mono text-slate-400">#{u.id}</TableCell>
                <TableCell className="font-bold text-slate-900">{u.name}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-700">{u.username}</span>
                    <span className="text-[10px] text-slate-400">{u.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px]">
                    {u.role_name || "NOT_ASSIGNED"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge className={u.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-600 font-bold">Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} className="max-w-md">
        <DialogHeader
          title="Tambah Pengguna Baru"
          description="Daftarkan akun staf baru dan tentukan hak aksesnya."
          onClose={() => setDialogOpen(false)}
        />
        <div className="space-y-4 py-2">
          <FormField label="Nama Lengkap">
            <Input
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="Mis: Budi Santoso"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Username">
              <Input
                value={form.username}
                onChange={(e) => setForm({...form, username: e.target.value.toLowerCase()})}
                placeholder="budi"
              />
            </FormField>
            <FormField label="Posisi / Hak Akses">
              <Select value={form.role_id} onChange={(e) => setForm({...form, role_id: e.target.value})}>
                <option value="">Pilih Role</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Email Aktif">
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                type="email"
                value={form.email}
                onChange={(e) => setForm({...form, email: e.target.value})}
                placeholder="budi@example.com"
              />
            </div>
          </FormField>
          <FormField label="Password Default">
            <div className="relative">
              <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                type="text"
                value={form.password}
                onChange={(e) => setForm({...form, password: e.target.value})}
                placeholder="Buat password yang mudah"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Contoh: Budi@123</p>
          </FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Batal</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-indigo-600">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Simpan Akun"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
