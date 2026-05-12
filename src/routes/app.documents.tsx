import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Upload, FileText, Search, Trash2, Download, Folder, FolderPlus, StickyNote, FileDown, Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { exportRowsToCSV, exportRowsToPDF } from "@/lib/exports";
import { ShareDocumentDialog } from "@/components/share-document-dialog";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { buildRateHeaderText, fetchLatestRates } from "@/lib/rate-header";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function buildInitialDocxBlob(title: string, headerText: string): Promise<Blob> {
  const headerLines = headerText.split("\n").map(
    (line) => new Paragraph({ children: [new TextRun({ text: line, font: "Courier New", size: 18 })] })
  );
  const children: Paragraph[] = [
    ...headerLines,
    new Paragraph({ children: [] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title, bold: true })] }),
    new Paragraph({ children: [new TextRun("")] }),
  ];
  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}

export const Route = createFileRoute("/app/documents")({
  head: () => ({ meta: [{ title: "Documents — Kaayu" }] }),
  component: DocsPage,
});

type Doc = { id: string; name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; created_at: string; folder_id: string | null; user_id: string };
type Folder = { id: string; name: string };

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

  const load = async () => {
    if (!user) return;
    const [{ data: f }, { data: d }] = await Promise.all([
      supabase.from("folders").select("*").eq("user_id", user.id).order("name"),
      supabase.from("documents").select("*").order("created_at", { ascending: false }),
    ]);
    setFolders(f ?? []);
    setDocs(d ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  const upload = async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const rates = await fetchLatestRates();
      const headerText = buildRateHeaderText(rates);
      for (const file of Array.from(files)) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr) throw upErr;
        const { data: docRow, error: dbErr } = await supabase.from("documents").insert({
          user_id: user.id, name: file.name, storage_path: path,
          mime_type: file.type, size_bytes: file.size, folder_id: folderId,
        }).select().single();
        if (dbErr) throw dbErr;
        // Persist the rate-of-the-day header for AI monthly reports
        await supabase.from("document_versions").insert({
          document_id: docRow.id, version_number: 1, storage_path: path,
          size_bytes: file.size, mime_type: file.type, created_by: user.id,
          comment: headerText,
        });
      }
      toast.success("Fichier(s) téléversé(s)");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const createFolder = async () => {
    const name = prompt("Nom du dossier :");
    if (!name || !user) return;
    const { error } = await supabase.from("folders").insert({ user_id: user.id, name, parent_id: folderId });
    if (error) toast.error(error.message); else { toast.success("Dossier créé"); load(); }
  };

  const remove = async (d: Doc) => {
    if (!confirm(`Supprimer "${d.name}" ?`)) return;
    await supabase.storage.from("documents").remove([d.storage_path]);
    await supabase.from("documents").delete().eq("id", d.id);
    toast.success("Supprimé"); load();
  };

  const download = async (d: Doc) => {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(d.storage_path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  const createTextDoc = async () => {
    if (!user) return;
    const name = prompt("Nom de la note :", "Nouvelle note.docx");
    if (!name) return;
    const finalName = /\.docx$/i.test(name) ? name : `${name}.docx`;
    const path = `${user.id}/${Date.now()}-${finalName}`;
    const rates = await fetchLatestRates();
    const headerText = buildRateHeaderText(rates);
    const blob = await buildInitialDocxBlob(finalName.replace(/\.docx$/i, ""), headerText);
    const { error: upErr } = await supabase.storage.from("documents").upload(path, blob, { contentType: DOCX_MIME });
    if (upErr) return toast.error(upErr.message);
    const { data, error } = await supabase.from("documents").insert({
      user_id: user.id, name: finalName, storage_path: path, mime_type: DOCX_MIME, size_bytes: blob.size, folder_id: folderId,
    }).select().single();
    if (error) return toast.error(error.message);
    // Stamp the rate header on the initial version row so AI monthly reports can read it
    await supabase.from("document_versions").insert({
      document_id: data.id, version_number: 1, storage_path: path,
      size_bytes: blob.size, mime_type: DOCX_MIME, created_by: user.id,
      comment: headerText,
    });
    toast.success("Note créée");
    navigate({ to: "/app/documents/$id", params: { id: data.id } });
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
          <p className="text-sm text-muted-foreground">Stockage cloud sécurisé · {docs.length} fichier(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => exportList("csv")}><FileDown className="mr-1 h-4 w-4" />CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportList("pdf")}><FileDown className="mr-1 h-4 w-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={createFolder}><FolderPlus className="mr-1 h-4 w-4" />Dossier</Button>
          <Button variant="outline" size="sm" onClick={createTextDoc}><StickyNote className="mr-1 h-4 w-4" />Note</Button>
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
                  <th className="px-3 py-2 text-left font-medium">Taille</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link to="/app/documents/$id" params={{ id: d.id }} className="flex items-center gap-2 hover:underline">
                        <FileText className="h-4 w-4 text-primary" /> {d.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(1)} Ko` : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(d.created_at).toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right">
                      {d.user_id === user?.id && (
                        <Button size="icon" variant="ghost" onClick={() => setShareDocId(d.id)}><Share2 className="h-4 w-4" /></Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => download(d)}><Download className="h-4 w-4" /></Button>
                      {d.user_id === user?.id && (
                        <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {shareDocId && (
        <ShareDocumentDialog open={!!shareDocId} onOpenChange={(v) => !v && setShareDocId(null)} documentId={shareDocId} />
      )}
    </div>
  );
}
