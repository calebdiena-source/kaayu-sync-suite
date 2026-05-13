import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  syncEventToGoogle,
  syncTaskToGoogle,
  pullGoogleEvents,
  deleteEventFromGoogle,
  deleteTaskFromGoogle,
} from "@/lib/google.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarDays, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/planner")({
  head: () => ({ meta: [{ title: "Calendrier & Tâches — Kaayu" }] }),
  component: PlannerPage,
});

type Ev = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  reminder_minutes: number | null;
  color: string | null;
  google_event_id: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  priority: "low" | "medium" | "high";
  status: "todo" | "doing" | "done";
  assigned_to: string | null;
  google_event_id: string | null;
};

type Profile = { id: string; full_name: string | null };

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-destructive/30",
  medium: "bg-warning/10 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

const EVENT_COLORS = ["#039BE5", "#33B679", "#F6BF26", "#F4511E", "#D50000", "#8E24AA", "#616161"];

function PlannerPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Ev[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [month, setMonth] = useState<Date>(new Date());
  const [tab, setTab] = useState("calendar");
  const [evOpen, setEvOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<Ev | null>(null);
  const [pulling, setPulling] = useState(false);

  const syncEv = useServerFn(syncEventToGoogle);
  const syncTask = useServerFn(syncTaskToGoogle);
  const pullFn = useServerFn(pullGoogleEvents);
  const delEvFn = useServerFn(deleteEventFromGoogle);
  const delTaskFn = useServerFn(deleteTaskFromGoogle);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: ev }, { data: tk }, { data: pr }] = await Promise.all([
      supabase.from("calendar_events").select("*").eq("user_id", user.id).order("start_at"),
      supabase
        .from("tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setEvents((ev ?? []) as Ev[]);
    setTasks((tk ?? []) as Task[]);
    setProfiles((pr ?? []) as Profile[]);
  }, [user]);

  const pull = useCallback(async () => {
    if (!user) return;
    setPulling(true);
    try {
      const from = startOfMonth(subMonths(month, 1)).toISOString();
      const to = endOfMonth(addMonths(month, 1)).toISOString();
      const r = await pullFn({ data: { fromIso: from, toIso: to } });
      if (r.imported > 0) toast.success(`${r.imported} événement(s) importé(s) depuis Google`);
      await load();
    } catch {
      /* not connected */
    } finally {
      setPulling(false);
    }
  }, [user, month, pullFn, load]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void pull(); /* on mount + month change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Calendar grid
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const out: Date[] = [];
    let d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [month]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, { events: Ev[]; tasks: Task[] }>();
    for (const d of days) map.set(format(d, "yyyy-MM-dd"), { events: [], tasks: [] });
    for (const e of events) {
      const k = format(new Date(e.start_at), "yyyy-MM-dd");
      map.get(k)?.events.push(e);
    }
    for (const t of tasks) {
      if (!t.due_date) continue;
      map.get(t.due_date)?.tasks.push(t);
    }
    return map;
  }, [days, events, tasks]);

  const removeEvent = async (e: Ev) => {
    await supabase.from("calendar_events").delete().eq("id", e.id);
    if (e.google_event_id) {
      try {
        await delEvFn({ data: { googleEventId: e.google_event_id } });
      } catch {
        /* ignore */
      }
    }
    void load();
  };

  const removeTask = async (t: Task) => {
    await supabase.from("tasks").delete().eq("id", t.id);
    if (t.google_event_id) {
      try {
        await delTaskFn({ data: { googleEventId: t.google_event_id } });
      } catch {
        /* ignore */
      }
    }
    void load();
  };

  const updateTaskStatus = async (id: string, status: Task["status"]) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    await supabase.from("tasks").update({ status }).eq("id", id);
    try {
      await syncTask({ data: { taskId: id } });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Calendrier &amp; Tâches</h2>
          <p className="text-sm text-muted-foreground">
            {events.length} événement(s) · {tasks.filter((t) => t.status !== "done").length}{" "}
            tâche(s) en cours
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void pull()} disabled={pulling}>
            <RefreshCw className={cn("mr-1 h-4 w-4", pulling && "animate-spin")} />
            Synchroniser Google
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingEvent(null);
              setEvOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nouvel événement
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingTask(null);
              setTaskOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Nouvelle tâche
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="calendar">Calendrier</TabsTrigger>
          <TabsTrigger value="kanban">Kanban</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-base font-medium capitalize">
              {format(month, "MMMM yyyy", { locale: fr })}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setMonth(subMonths(month, 1))}>
                ‹
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMonth(new Date())}>
                Aujourd&apos;hui
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMonth(addMonths(month, 1))}>
                ›
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-xs">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div key={d} className="bg-card p-2 text-center font-medium">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const k = format(d, "yyyy-MM-dd");
              const cell = itemsByDay.get(k);
              const inMonth = isSameMonth(d, month);
              const today = isSameDay(d, new Date());
              return (
                <div
                  key={k}
                  className={cn(
                    "min-h-[92px] bg-card p-1.5",
                    !inMonth && "bg-muted/40 text-muted-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px]",
                      today && "bg-primary text-primary-foreground font-semibold",
                    )}
                  >
                    {format(d, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {cell?.events.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setEditingEvent(e);
                          setEvOpen(true);
                        }}
                        className="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] text-white"
                        style={{ background: e.color ?? "#039BE5" }}
                      >
                        {format(new Date(e.start_at), "HH:mm")} {e.title}
                      </button>
                    ))}
                    {cell?.tasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setEditingTask(t);
                          setTaskOpen(true);
                        }}
                        className={cn(
                          "block w-full truncate rounded border px-1 py-0.5 text-left text-[11px]",
                          PRIORITY_COLORS[t.priority],
                          t.status === "done" && "line-through opacity-60",
                        )}
                      >
                        ✓ {t.title}
                      </button>
                    ))}
                    {(cell?.events.length ?? 0) + (cell?.tasks.length ?? 0) > 6 && (
                      <div className="px-1 text-[10px] text-muted-foreground">+ autres…</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <h3 className="text-sm font-medium text-muted-foreground">Événements à venir</h3>
            {events
              .filter((e) => new Date(e.start_at) >= new Date())
              .slice(0, 5)
              .map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
                  <div className="h-8 w-1 rounded" style={{ background: e.color ?? "#039BE5" }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.start_at).toLocaleString("fr-FR")}
                      {e.location && ` · ${e.location}`}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => void removeEvent(e)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            {events.length === 0 && (
              <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
                <CalendarDays className="mx-auto mb-2 h-6 w-6" />
                Aucun événement
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanBoard
            tasks={tasks}
            profiles={profiles}
            onMove={updateTaskStatus}
            onEdit={(t) => {
              setEditingTask(t);
              setTaskOpen(true);
            }}
            onDelete={removeTask}
          />
        </TabsContent>
      </Tabs>

      <EventDialog
        open={evOpen}
        onOpenChange={setEvOpen}
        event={editingEvent}
        userId={user?.id}
        onSaved={async (id, deleted) => {
          await load();
          setEvOpen(false);
          if (!deleted && id) {
            try {
              await syncEv({ data: { eventId: id } });
              toast.success("Synchronisé avec Google Calendar");
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (
                msg.includes("insufficient") ||
                msg.includes("PERMISSION_DENIED") ||
                msg.includes("403")
              ) {
                toast.error(
                  "Autorisation Google Calendar manquante. Allez dans Paramètres → déconnectez puis reconnectez Google en cochant l'accès au calendrier.",
                );
              } else {
                toast.error("Échec de la synchronisation Google : " + msg);
              }
            }
          }
        }}
      />

      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        task={editingTask}
        profiles={profiles}
        userId={user?.id}
        onSaved={async (id) => {
          await load();
          setTaskOpen(false);
          if (id) {
            try {
              await syncTask({ data: { taskId: id } });
              toast.success("Synchronisé avec Google Calendar");
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (
                msg.includes("insufficient") ||
                msg.includes("PERMISSION_DENIED") ||
                msg.includes("403")
              ) {
                toast.error(
                  "Autorisation Google Calendar manquante. Allez dans Paramètres → déconnectez puis reconnectez Google.",
                );
              } else {
                toast.error("Échec sync : " + msg);
              }
            }
          }
        }}
      />
    </div>
  );
}

/* -------------------- Kanban -------------------- */

const COLUMNS: { id: Task["status"]; label: string }[] = [
  { id: "todo", label: "À faire" },
  { id: "doing", label: "En cours" },
  { id: "done", label: "Terminé" },
];

function KanbanBoard({
  tasks,
  profiles,
  onMove,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  profiles: Profile[];
  onMove: (id: string, status: Task["status"]) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const over = e.over?.id ? String(e.over.id) : null;
    if (!over) return;
    const status = over as Task["status"];
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== status) onMove(id, status);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            label={col.label}
            items={tasks.filter((t) => (t.status ?? "todo") === col.id)}
            profiles={profiles}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}

function Column({
  id,
  label,
  items,
  profiles,
  onEdit,
  onDelete,
}: {
  id: Task["status"];
  label: string;
  items: Task[];
  profiles: Profile[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("rounded-xl border bg-card p-3", isOver && "ring-2 ring-primary")}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">{label}</div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((t) => (
          <KanbanCard key={t.id} task={t} profiles={profiles} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {items.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            Aucune tâche
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  task,
  profiles,
  onEdit,
  onDelete,
}: {
  task: Task;
  profiles: Profile[];
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const assignee = profiles.find((p) => p.id === task.assigned_to)?.full_name;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn("rounded-lg border bg-background p-2.5", isDragging && "opacity-50")}
    >
      <div className="flex items-start gap-2">
        <button
          {...listeners}
          className="mt-0.5 cursor-grab text-xs text-muted-foreground active:cursor-grabbing"
          title="Glisser"
        >
          ⋮⋮
        </button>
        <button onClick={() => onEdit(task)} className="flex-1 text-left">
          <div className="text-sm font-medium">{task.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={cn("rounded-full border px-1.5 py-0.5", PRIORITY_COLORS[task.priority])}
            >
              {task.priority === "high" ? "Haute" : task.priority === "low" ? "Basse" : "Moyenne"}
            </span>
            {task.due_date && (
              <span className="text-muted-foreground">
                {new Date(task.due_date).toLocaleDateString("fr-FR")}
                {task.due_time ? ` ${task.due_time}` : ""}
              </span>
            )}
            {assignee && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                {assignee}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => onDelete(task)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* -------------------- Event dialog -------------------- */

function EventDialog({
  open,
  onOpenChange,
  event,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: Ev | null;
  userId: string | undefined;
  onSaved: (id: string | null, deleted?: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(EVENT_COLORS[0]);
  const [reminder, setReminder] = useState(30);

  useEffect(() => {
    if (!open) return;
    if (event) {
      const s = new Date(event.start_at);
      setTitle(event.title);
      setDate(format(s, "yyyy-MM-dd"));
      setStart(format(s, "HH:mm"));
      setEnd(event.end_at ? format(new Date(event.end_at), "HH:mm") : "");
      setDescription(event.description ?? "");
      setColor(event.color ?? EVENT_COLORS[0]);
      setReminder(event.reminder_minutes ?? 30);
    } else {
      setTitle("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setStart("09:00");
      setEnd("10:00");
      setDescription("");
      setColor(EVENT_COLORS[0]);
      setReminder(30);
    }
  }, [open, event]);

  const save = async () => {
    if (!userId) return;
    if (!title.trim()) {
      toast.error("Veuillez saisir un titre");
      return;
    }
    if (!date) {
      toast.error("Veuillez choisir une date");
      return;
    }
    if (!start) {
      toast.error("Veuillez choisir une heure de début");
      return;
    }
    const startDate = new Date(`${date}T${start}:00`);
    if (isNaN(startDate.getTime())) {
      toast.error("Date ou heure invalide");
      return;
    }
    // Auto-fill end = start + 1h if not provided
    const endDate = end
      ? new Date(`${date}T${end}:00`)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const payload = {
      user_id: userId,
      title: title.trim(),
      description: description || null,
      start_at: startIso,
      end_at: endIso,
      color,
      reminder_minutes: reminder,
    };
    if (event) {
      const { error } = await supabase.from("calendar_events").update(payload).eq("id", event.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      onSaved(event.id);
    } else {
      const { data, error } = await supabase
        .from("calendar_events")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      onSaved(data.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event ? "Modifier l'événement" : "Nouvel événement"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Titre</label>
            <Input
              placeholder="Ex: Réunion équipe"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Début</label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Fin <span className="opacity-60">(auto)</span>
              </label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Couleur</span>
            {EVENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full border-2",
                  color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rappel</span>
            <select
              value={reminder}
              onChange={(e) => setReminder(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              <option value={10}>10 minutes avant</option>
              <option value={30}>30 minutes avant</option>
              <option value={60}>1 heure avant</option>
              <option value={1440}>1 jour avant</option>
            </select>
          </div>
        </div>
        <DialogFooter>
          {event && (
            <Button
              variant="destructive"
              onClick={async () => {
                await supabase.from("calendar_events").delete().eq("id", event.id);
                onSaved(null, true);
              }}
            >
              Supprimer
            </Button>
          )}
          <Button onClick={save}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Task dialog -------------------- */

function TaskDialog({
  open,
  onOpenChange,
  task,
  profiles,
  userId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: Task | null;
  profiles: Profile[];
  userId: string | undefined;
  onSaved: (id: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [status, setStatus] = useState<Task["status"]>("todo");
  const [assignedTo, setAssignedTo] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setDueDate(task.due_date ?? "");
      setDueTime(task.due_time ?? "");
      setPriority(task.priority);
      setStatus(task.status ?? "todo");
      setAssignedTo(task.assigned_to ?? "");
    } else {
      setTitle("");
      setDescription("");
      setDueDate(format(new Date(), "yyyy-MM-dd"));
      setDueTime("09:00");
      setPriority("medium");
      setStatus("todo");
      setAssignedTo("");
    }
  }, [open, task]);

  const save = async () => {
    if (!userId || !title) {
      toast.error("Titre requis");
      return;
    }
    const payload = {
      user_id: userId,
      title,
      description: description || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      priority,
      status,
      assigned_to: assignedTo || null,
    };
    if (task) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      onSaved(task.id);
    } else {
      const { data, error } = await supabase.from("tasks").insert(payload).select().single();
      if (error) {
        toast.error(error.message);
        return;
      }
      onSaved(data.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Titre" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Task["priority"])}
              className="rounded-md border bg-background px-2 py-2 text-sm"
            >
              <option value="high">Haute</option>
              <option value="medium">Moyenne</option>
              <option value="low">Basse</option>
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Task["status"])}
              className="rounded-md border bg-background px-2 py-2 text-sm"
            >
              <option value="todo">À faire</option>
              <option value="doing">En cours</option>
              <option value="done">Terminé</option>
            </select>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="rounded-md border bg-background px-2 py-2 text-sm"
            >
              <option value="">Non assigné</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
