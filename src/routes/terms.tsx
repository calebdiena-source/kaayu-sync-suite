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
          "Conditions générales d'utilisation de Kaayu Workspace : règles d'usage, responsabilités et engagements.",
      },
      { property: "og:title", content: "Conditions d'utilisation — Kaayu Workspace" },
      {
        property: "og:description",
        content:
          "Lisez les conditions d'utilisation de Kaayu Workspace avant d'utiliser le service.",
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
            Retour
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

        <div className="prose prose-sm dark:prose-invert mt-10 max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-semibold">1. Acceptation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              En créant un compte ou en utilisant Kaayu Workspace (« Kaayu », « le service »),
              vous acceptez sans réserve les présentes conditions générales d'utilisation. Si
              vous n'acceptez pas ces conditions, n'utilisez pas le service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Description du service</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Kaayu Workspace est une plateforme cloud permettant la gestion documentaire, la
              prise de notes, la planification de tâches et de réunions, l'OCR, la génération
              de rapports assistée par IA, et la synchronisation avec Google Calendar et
              Google Drive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Compte utilisateur</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous êtes responsable de la confidentialité de vos identifiants et de toutes les
              activités effectuées depuis votre compte. Vous vous engagez à fournir des
              informations exactes lors de l'inscription et à les tenir à jour.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Usage acceptable</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous vous engagez à ne pas utiliser Kaayu pour :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
              <li>publier ou stocker des contenus illégaux, haineux ou portant atteinte aux droits d'autrui ;</li>
              <li>tenter d'accéder sans autorisation à d'autres comptes ou systèmes ;</li>
              <li>perturber le fonctionnement du service (attaques, scripts automatisés abusifs) ;</li>
              <li>utiliser le service à des fins de spam ou d'envoi massif non sollicité.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Contenu utilisateur</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous restez seul propriétaire des contenus que vous créez ou téléversez sur
              Kaayu (documents, notes, événements). Vous nous accordez uniquement les droits
              techniques nécessaires pour héberger, afficher et traiter ces contenus dans le
              cadre du service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Intégrations tierces</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Kaayu peut se connecter à des services tiers tels que Google Calendar et
              Google Drive. L'utilisation de ces intégrations est également soumise aux
              conditions de Google. Vous pouvez révoquer ces accès à tout moment depuis vos
              paramètres ou votre compte Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Fonctionnalités d'IA</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Les fonctionnalités d'IA (résumés, OCR, rapports mensuels) sont fournies « en
              l'état ». Les résultats générés peuvent contenir des inexactitudes ; vous devez
              les vérifier avant tout usage important. Kaayu ne saurait être tenu responsable
              de décisions prises sur la seule base de contenus générés par IA.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Disponibilité du service</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Nous mettons en œuvre tous les efforts raisonnables pour assurer la disponibilité
              du service, sans garantie d'absence d'interruption. Des opérations de maintenance
              ou des incidents techniques peuvent affecter ponctuellement l'accès.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Suspension et résiliation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Nous pouvons suspendre ou résilier votre accès en cas de violation des présentes
              conditions. Vous pouvez à tout moment supprimer votre compte depuis vos
              paramètres ; vos données seront effacées conformément à notre politique de
              confidentialité.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Limitation de responsabilité</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Dans les limites permises par la loi, Kaayu ne saurait être tenu responsable des
              dommages indirects, pertes de données ou de revenus résultant de l'utilisation
              ou de l'impossibilité d'utiliser le service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Modifications</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Ces conditions peuvent être mises à jour. Les changements significatifs seront
              notifiés par e-mail ou via l'application. La poursuite de l'utilisation du
              service après notification vaut acceptation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">12. Droit applicable</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Les présentes conditions sont régies par le droit applicable au lieu
              d'établissement de l'éditeur. Tout litige sera soumis aux tribunaux compétents.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">13. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pour toute question relative à ces conditions, contactez-nous à :{" "}
              <a
                href="mailto:support@kaayu.app"
                className="text-primary underline-offset-4 hover:underline"
              >
                support@kaayu.app
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 flex flex-wrap gap-3 border-t pt-6">
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'accueil
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
