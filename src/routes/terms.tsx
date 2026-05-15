import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — Kaayu Workspace" },
      {
        name: "description",
        content:
          "Conditions générales d'utilisation de Kaayu Workspace : service tel quel, responsabilités et abonnement.",
      },
      { property: "og:title", content: "Conditions d'utilisation — Kaayu Workspace" },
      {
        property: "og:description",
        content:
          "Lisez les conditions d'utilisation de Kaayu Workspace.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          Conditions d'utilisation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dernière mise à jour : {lastUpdated}
        </p>

        <div className="mt-10 space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Service fourni « tel quel »</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Kaayu Workspace est fournie « telle quelle », sans garantie d'aucune sorte,
              expresse ou implicite. Nous mettons en œuvre tous les efforts raisonnables
              pour assurer la disponibilité et la fiabilité du service, mais ne pouvons
              garantir une absence totale d'interruption ou d'erreur.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Responsabilité de l'utilisateur</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              L'utilisateur est seul responsable de ses données, de leur exactitude, de leur
              sauvegarde et de leur usage. Vous êtes également responsable de la confidentialité
              de vos identifiants et de toutes les activités effectuées depuis votre compte.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Abonnement</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              L'accès à Kaayu Workspace fonctionne sous la forme d'un{" "}
              <strong className="text-foreground">abonnement mensuel annulable à tout moment</strong>{" "}
              depuis la page Paramètres de votre compte. Aucun engagement de durée n'est requis.
              L'annulation prend effet à la fin de la période en cours.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pour toute question relative à ces conditions, contactez-nous à :{" "}
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

        <div className="mt-12 flex flex-wrap gap-3 border-t pt-6">
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'application
            </Button>
          </Link>
          <Link to="/privacy">
            <Button variant="ghost">Politique de confidentialité</Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
