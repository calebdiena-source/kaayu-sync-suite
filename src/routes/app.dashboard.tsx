import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/dashboard";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Tableau de bord — Kaayu" }] }),
  component: Dashboard,
});