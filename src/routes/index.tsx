import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Cloud, ArrowRight, FileText, Users2, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kaayu Workspace — Espace de travail cloud sécurisé" },
      {
        name: "description",
        content: "Documents, réunions, tâches, calendrier et IA dans une plateforme unifiée.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && user) navigate({ to: "/app/dashboard" });
  }, [user, loading, navigate]);

  const features = [
    { icon: FileText, title: "Stockage cloud", text: "Documents sécurisés, dossiers, partage." },
    { icon: Users2, title: "Réunions", text: "Notes, transcription, résumés IA." },
    { icon: Sparkles, title: "Assistant IA", text: "Résumer, traduire, rédiger." },
    { icon: Shield, title: "Sécurisé", text: "Authentification et permissions." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-6 py-5 lg:px-12">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="font-semibold tracking-tight">Kaayu Workspace</div>
        </div>
        <Link to="/login">
          <Button variant="outline">Se connecter</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-12 lg:pt-20">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Plateforme cloud d'entreprise
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Votre espace de travail
            <br />
            <span className="text-primary">unifié et sécurisé.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
            Documents, réunions, calendrier, tâches, OCR et assistant IA — tout dans une interface
            professionnelle, en français, sur tous vos appareils.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/login">
              <Button size="lg">
                Démarrer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <f.icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{f.text}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
