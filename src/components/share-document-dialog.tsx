import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";

type Profile = { id: string; full_name: string | null };
type Share = { id: string; shared_with_user_id: string; permission: string };

export function ShareDocumentDialog({ open, onOpenChange, documentId }: { open: boolean; onOpenChange: (v: boolean) => void; documentId: string }) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [permission, setPermission] = useState<"read" | "write">("read");
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data: p } = await supabase.from("profiles").select("id, full_name");
    setProfiles((p ?? []).filter((x) => x.id !== user?.id));
    const { data: s } = await supabase.from("document_shares").select("id, shared_with_user_id, permission").eq("document_id", documentId);
    setShares(s ?? []);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, documentId]);

  const add = async () => {
    if (!selected || !user) return;
    const { error } = await supabase.from("document_shares").insert({
      document_id: documentId, shared_with_user_id: selected, shared_by_user_id: user.id, permission,
    });
    if (error) toast.error(error.message);
    else { toast.success("Partagé"); setSelected(""); load(); }
  };

  const remove = async (id: string) => {
    await supabase.from("document_shares").delete().eq("id", id);
    load();
  };

  const filtered = profiles.filter((p) => (p.full_name ?? "").toLowerCase().includes(search.toLowerCase()) && !shares.some((s) => s.shared_with_user_id === p.id));
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Partager le document</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un utilisateur…" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
            <div className="mt-2 max-h-40 overflow-auto rounded-md border">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Aucun utilisateur</div>
              ) : filtered.map((p) => (
                <button key={p.id} onClick={() => setSelected(p.id)} className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent ${selected === p.id ? "bg-accent" : ""}`}>
                  <span>{p.full_name ?? p.id.slice(0, 8)}</span>
                  {selected === p.id && <span className="text-xs text-primary">✓</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <select value={permission} onChange={(e) => setPermission(e.target.value as any)} className="rounded-md border bg-background px-3 py-2 text-sm">
              <option value="read">Lecture</option>
              <option value="write">Écriture</option>
            </select>
            <Button onClick={add} disabled={!selected} className="ml-auto"><UserPlus className="mr-1 h-4 w-4" />Ajouter</Button>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">Personnes ayant accès ({shares.length})</div>
            <div className="space-y-1">
              {shares.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{nameOf(s.shared_with_user_id)}</span>
                  <span className="text-xs text-muted-foreground">{s.permission === "write" ? "Écriture" : "Lecture"}</span>
                  <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
