import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/calendar")({
  beforeLoad: () => { throw redirect({ to: "/app/planner" }); },
});
