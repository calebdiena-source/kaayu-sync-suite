import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — Kaayu Workspace" },
      {
        name: "description",
        content:
          "Politique de confidentialité de Kaayu Workspace : email, données Google Calendar et vos droits.",
      },
      { property: "og:title", content: "Politique de confidentialité — Kaayu Workspace" },
      {
        property: "og:description",
        content:
          "Comment Kaayu Workspace utilise votre email et vos données Google Calendar.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const lastUpdated = "15 mai 2026";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-6 py-5 lg:px-12">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="h-5 w-5" />
          </div>
          <div className="font-semibold tracking-tight">Kaayu Workspace</div>
        </Link>
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à l'application
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 lg:py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Politique de confidentialité
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dernière mise à jour : {lastUpdated}
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Données que nous collectons</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Nous collectons votre adresse e-mail et les données de votre Google Calendar
              uniquement dans le but de synchroniser vos événements avec Kaayu Workspace.
              Aucune autre information personnelle n'est collectée à votre insu.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Utilisation de vos données</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vos données Google Calendar sont utilisées exclusivement pour afficher,
              créer et synchroniser vos événements dans l'application. Votre e-mail sert
              à identifier votre compte et à vous envoyer des notifications essentielles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Partage des données</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Nous ne vendons jamais vos données.</strong>{" "}
              Elles ne sont partagées avec aucun tiers à des fins commerciales ou
              publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Déconnexion de Google Calendar</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous pouvez déconnecter Google Calendar à tout moment depuis la page
              <strong className="text-foreground"> Paramètres </strong>
              de l'application. Une fois déconnecté, nous cessons immédiatement
              d'accéder à vos données Calendar.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Sécurité</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vos données sont stockées de manière sécurisée avec chiffrement en transit
              (TLS) et au repos. L'accès est protégé par des règles de sécurité au niveau
              des lignes (RLS).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pour toute question relative à cette politique ou à vos données, contactez-nous à :{" "}
              <a
                href="mailto:calebdiena@gmail.com"
                className="text-primary underline-offset-4 hover:underline"
              >
                calebdiena@gmail.com
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-6">
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'application
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
