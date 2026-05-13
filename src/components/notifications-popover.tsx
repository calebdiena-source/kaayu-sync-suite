import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Notif = { id: string; title: string; body: string | null; read: boolean; created_at: string };

export function NotificationsPopover() {
  const { user } = useAuth();
  const [notifs, setNotifs] = useState<Notif[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifs(data ?? []);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("notifs")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line
  }, [user?.id]);

  const unread = notifs.filter((n) => !n.read).length;

  const markOne = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    load();
  };
  const markAll = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAll}>
              <CheckCheck className="mr-1 h-3 w-3" />
              Tout lire
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-auto">
          {notifs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Aucune notification</div>
          ) : (
            notifs.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-2 border-b p-3 text-sm ${!n.read ? "bg-accent/40" : ""}`}
              >
                <div className="flex-1">
                  <div className="font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>
                {!n.read && (
                  <Button size="icon" variant="ghost" onClick={() => markOne(n.id)}>
                    <Check className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
