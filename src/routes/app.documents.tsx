import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Upload, FileText, Search, Trash2, Download, Folder, FolderPlus, StickyNote, FileDown, Share2, Users, HardDrive, FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { exportRowsToCSV, exportRowsToPDF } from "@/lib/exports";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { buildRateHeaderText, fetchLatestRates } from "@/lib/rate-header";
import { driveAvailable, uploadDocumentToDrive, downloadDocumentFromDrive, deleteDocumentFromDrive } from "@/lib/drive.functions";

export const Route = createFileRoute("/app/documents")({
  head: () => ({ meta: [{ title: "Documents — Kaayu" }] }),
  component: DocsPage,
});

type Doc = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string; folder_id: string | null; user_id: string; storage_provider?: string | null; google_file_id?: string | null };
type Folder = { id: string; name: string };

function fileToB64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf(",");
      res(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

function downloadB64(name: string, mimeType: string, b64: string) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DocsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [view, setView] = useState<"mine" | "shared">("mine");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteName, setNoteName] = useState("");
  const [creatingNote, setCreatingNote] = useState(false);
  const [useDrive, setUseDrive] = useState(false);

  const checkDrive = useServerFn(driveAvailable);
  const uploadDrive = useServerFn(uploadDocumentToDrive);
  const downloadDrive = useServerFn(downloadDocumentFromDrive);
  const deleteDrive = useServerFn(deleteDocumentFromDrive);

  const load = async () => {
    if (!user) return;
    const [{ data: f }, { data: d }, drv] = await Promise.all([
      supabase.from("folders").select("*").eq("user_id", user.id).eq("kind", "document").order("name"),
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
      checkDrive().catch(() => ({ available: false })),
    ]);
    setFolders(f ?? []);
    setDocs(d ?? []);
    setUseDrive(!!drv?.available);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const upload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const rates = await fetchLatestRates();
      const headerText = buildRateHeaderText(rates);
      for (const file of Array.from(files)) {
        if (useDrive) {
          const dataB64 = await fileToB64(file);
          await uploadDrive({ data: { name: file.name, mimeType: file.type || "application/octet-stream", dataB64, folderId } });
          continue;
        }
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { data: docRow, error: dbErr } = await supabase.from("documents").insert({
          user_id: user.id, name: file.name, storage_path: path,
          mime_type: file.type, size_bytes: file.size, folder_id: folderId,
        }).select().single();
        if (dbErr) throw dbErr;
        await supabase.from("document_versions").insert({
          document_id: docRow.id, version_number: 1, storage_path: path,
          size_bytes: file.size, mime_type: file.type, created_by: user.id,
          comment: headerText,
        });
      }
      toast.success(useDrive ? "Téléversé sur Google Drive" : "Fichier(s) téléversé(s)");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const createFolder = async () => {
    const name = prompt("Nom du dossier :");
    if (!name || !user) return;
    const { error } = await supabase.from("folders").insert({ user_id: user.id, name, parent_id: folderId, kind: "document" });
    if (error) toast.error(error.message); else { toast.success("Dossier créé"); load(); }
  };

  const moveDoc = async (d: Doc, targetFolderId: string | null) => {
    const { error } = await supabase.from("documents").update({ folder_id: targetFolderId }).eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success(targetFolderId ? "Déplacé dans le dossier" : "Retiré du dossier");
    load();
  };

  const moveToNewFolder = async (d: Doc) => {
    if (!user) return;
    const name = prompt("Nom du nouveau dossier :");
    if (!name) return;
    const { data: nf, error } = await supabase.from("folders").insert({ user_id: user.id, name, kind: "document" }).select().single();
    if (error || !nf) return toast.error(error?.message ?? "Erreur");
    await moveDoc(d, nf.id);
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Supprimer "${d.name}" ?`)) return;
    try {
      if (d.storage_provider === "drive" && d.google_file_id) {
        await deleteDrive({ data: { fileId: d.google_file_id } });
      } else {
        await supabase.storage.from("documents").remove([d.storage_path]);
      }
      await supabase.from("documents").delete().eq("id", d.id);
      toast.success("Supprimé"); load();
    } catch (e: any) { toast.error(e.message); }
  };

  const download = async (d: Doc) => {
    try {
      if (d.storage_provider === "drive") {
        const r = await downloadDrive({ data: { documentId: d.id } });
        downloadB64(r.name, r.mimeType, r.dataB64);
        return;
      }
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
      if (error) return toast.error(error.message);
      window.open(data.signedUrl, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const submitNote = () => {
    const raw = noteName.trim() || "Nouvelle note";
    const finalName = /\.docx$/i.test(raw) ? raw : `${raw}.docx`;
    setNoteOpen(false);
    setNoteName("");
    navigate({
      to: "/app/documents/editor/$id",
      params: { id: "new" },
      search: { name: finalName },
    });
  };

  const exportList = (format: "csv" | "pdf") => {
    const rows = filtered.map((d) => [d.name, d.mime_type ?? "", d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} Ko` : "—", new Date(d.created_at).toLocaleString("fr-FR")]);
    const headers = ["Nom", "Type", "Taille", "Date"];
    if (format === "csv") exportRowsToCSV(`documents-${Date.now()}.csv`, headers, rows);
    else exportRowsToPDF(`documents-${Date.now()}.pdf`, "Liste des documents", headers, rows);
  };

  const filtered = docs.filter((d) => {
    const mine = d.user_id === user?.id;
    if (view === "mine" && !mine) return false;
    if (view === "shared" && mine) return false;
    if (folderId && d.folder_id !== folderId) return false;
    return d.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Documents</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {useDrive ? (<><HardDrive className="h-3.5 w-3.5 text-primary" /> Google Drive connecté</>) : "Stockage cloud sécurisé"} · {docs.length} fichier(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportList("csv")}><FileDown className="mr-1 h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportList("pdf")}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={createFolder}><FolderPlus className="mr-1 h-4 w-4" />Dossier</Button>
          <Button variant="outline" size="sm" onClick={() => { setNoteName("Nouvelle note"); setNoteOpen(true); }}><StickyNote className="mr-1 h-4 w-4" />Note</Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1 h-4 w-4" />{uploading ? "…" : "Téléverser"}
          </Button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-1 rounded-xl border bg-card p-3">
          <button onClick={() => setView("mine")} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${view === "mine" ? "bg-accent" : "hover:bg-accent/60"}`}>
            <Folder className="h-4 w-4" /> Mes fichiers
          </button>
          <button onClick={() => setView("shared")} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${view === "shared" ? "bg-accent" : "hover:bg-accent/60"}`}>
            <Users className="h-4 w-4" /> Partagés avec moi
          </button>
          <div className="my-2 border-t" />
          <button onClick={() => setFolderId(null)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${!folderId ? "bg-accent" : "hover:bg-accent/60"}`}>
            <Folder className="h-4 w-4" /> Tous les dossiers
          </button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => setFolderId(f.id)} className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${folderId === f.id ? "bg-accent" : "hover:bg-accent/60"}`}>
              <Folder className="h-4 w-4 text-primary" /> {f.name}
            </button>
          ))}
        </aside>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          className={`rounded-xl border bg-card transition-colors ${drag ? "border-primary bg-primary/5" : ""}`}
        >
          <div className="flex items-center gap-2 border-b p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un document…" className="w-full bg-transparent text-sm outline-none" />
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-12 text-center text-sm text-muted-foreground">
              <Upload className="h-8 w-8 opacity-50" />
              {view === "shared" ? "Aucun document partagé avec vous" : "Glissez-déposez des fichiers ici ou cliquez sur Téléverser"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Nom</th>
                  <th className="px-3 py-2 text-left font-medium">Dossier</th>
                  <th className="px-3 py-2 text-left font-medium">Taille</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const currentFolder = folders.find((f) => f.id === d.folder_id);
                  const isOwner = d.user_id === user?.id;
                  return (
                  <tr
                    key={d.id}
                    className="cursor-pointer border-t hover:bg-muted/30"
                    onDoubleClick={() => navigate({ to: "/app/documents/editor/$id", params: { id: d.id } })}
                    title="Double-cliquez pour ouvrir"
                  >
                    <td className="px-3 py-2">
                      <Link to="/app/documents/editor/$id" params={{ id: d.id }} className="flex items-center gap-2 hover:underline">
                        <FileText className="h-4 w-4 text-primary" /> {d.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {currentFolder ? (
                        <span className="inline-flex items-center gap-1"><Folder className="h-3.5 w-3.5 text-primary" />{currentFolder.name}</span>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} Ko` : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(d.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right">
                      {isOwner && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" title="Déplacer vers un dossier"><FolderInput className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Déplacer vers…</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => moveDoc(d, null)} disabled={!d.folder_id}>
                              <Folder className="mr-2 h-4 w-4 opacity-50" /> Aucun dossier
                            </DropdownMenuItem>
                            {folders.length > 0 && <DropdownMenuSeparator />}
                            {folders.map((f) => (
                              <DropdownMenuItem key={f.id} onClick={() => moveDoc(d, f.id)} disabled={d.folder_id === f.id}>
                                <Folder className="mr-2 h-4 w-4 text-primary" /> {f.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => moveToNewFolder(d)}>
                              <FolderPlus className="mr-2 h-4 w-4" /> Nouveau dossier…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {isOwner && (
                        <Button size="icon" variant="ghost" onClick={() => setShareDocId(d.id)}><Share2 className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => download(d)}><Download className="h-4 w-4" /></Button>
                      {isOwner && (
                        <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {shareDocId && (
        <ShareDocumentDialog open={!!shareDocId} onOpenChange={(v) => !v && setShareDocId(null)} documentId={shareDocId} />
      )}

      <Dialog open={noteOpen} onOpenChange={(v) => { if (!creatingNote) setNoteOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle note</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Nom de la note</label>
            <Input
              autoFocus
              value={noteName}
              onChange={(e) => setNoteName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !creatingNote) { e.preventDefault(); void submitNote(); } }}
              placeholder="Ex: Réunion du 12 mai"
            />
            <p className="text-xs text-muted-foreground">L'extension .docx sera ajoutée automatiquement.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)} disabled={creatingNote}>Annuler</Button>
            <Button onClick={submitNote} disabled={creatingNote}>{creatingNote ? "Création…" : "OK"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
