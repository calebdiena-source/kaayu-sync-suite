import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/tasks")({
  beforeLoad: () => {
    throw redirect({ to: "/app/planner" });
  },
});
