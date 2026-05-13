import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && window.location.hash.includes("access_token")) return;
    throw redirect({ to: "/app/dashboard" });
  },
});