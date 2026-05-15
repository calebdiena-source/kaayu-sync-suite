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
          "Politique de confidentialité de Kaayu Workspace : collecte, utilisation et protection de vos données personnelles.",
      },
      { property: "og:title", content: "Politique de confidentialité — Kaayu Workspace" },
      {
        property: "og:description",
        content:
          "Découvrez comment Kaayu Workspace protège vos données et respecte votre vie privée.",
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
            Retour
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

        <div className="prose prose-sm dark:prose-invert mt-10 max-w-none space-y-8 text-foreground">
          <section>
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Kaayu Workspace (« Kaayu », « nous », « notre ») accorde une importance fondamentale
              à la protection de vos données personnelles. La présente politique décrit comment
              nous collectons, utilisons, stockons et protégeons vos informations lorsque vous
              utilisez notre plateforme.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Données que nous collectons</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Informations de compte :</strong> adresse
                e-mail, nom, mot de passe chiffré.
              </li>
              <li>
                <strong className="text-foreground">Contenu utilisateur :</strong> documents,
                notes de réunion, tâches, événements de calendrier que vous créez.
              </li>
              <li>
                <strong className="text-foreground">Données techniques :</strong> journaux de
                connexion, type d'appareil, navigateur, adresse IP.
              </li>
              <li>
                <strong className="text-foreground">Données d'utilisation :</strong>{" "}
                interactions avec les fonctionnalités, statistiques anonymisées.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Utilisation de vos données</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vos données sont utilisées pour fournir et améliorer le service, sécuriser votre
              compte, alimenter les fonctionnalités d'IA (résumé, traduction, OCR, rapports
              mensuels), et vous envoyer des notifications essentielles liées à votre compte.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Intégration Google Calendar</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Lorsque vous connectez votre compte Google à Kaayu Workspace, nous demandons
              uniquement les autorisations nécessaires à la synchronisation de votre agenda et
              à l'enregistrement des fichiers que vous choisissez d'exporter :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">Google Calendar (lecture / écriture) :</strong>{" "}
                pour afficher vos événements dans Kaayu, créer, modifier ou supprimer les
                événements que vous gérez depuis l'application, et synchroniser les rappels.
              </li>
              <li>
                <strong className="text-foreground">Google Drive (drive.file) :</strong> accès
                limité aux seuls fichiers créés ou ouverts par Kaayu — nous n'accédons jamais à
                l'ensemble de votre Drive.
              </li>
              <li>
                <strong className="text-foreground">Profil et e-mail :</strong> pour identifier
                votre compte Google associé.
              </li>
            </ul>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Les jetons d'accès et de rafraîchissement sont stockés de manière chiffrée dans
              notre infrastructure sécurisée et ne sont utilisés que pour réaliser les actions
              que vous initiez. Les données de calendrier ne sont jamais partagées avec des
              tiers, ni utilisées à des fins publicitaires, ni pour entraîner des modèles d'IA.
              Vous pouvez révoquer l'accès à tout moment depuis vos paramètres Kaayu ou depuis
              la page{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                des autorisations Google
              </a>
              . L'usage des données issues des API Google par Kaayu respecte la{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , y compris les exigences Limited Use.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Intelligence artificielle</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Lorsque vous utilisez les fonctionnalités d'IA, le contenu pertinent est transmis
              de manière sécurisée à nos partenaires de modèles (Google, OpenAI) uniquement pour
              traiter votre requête. Aucune donnée n'est utilisée pour entraîner ces modèles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Stockage et sécurité</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vos données sont stockées sur une infrastructure cloud sécurisée avec chiffrement
              en transit (TLS) et au repos. L'accès est strictement contrôlé par des règles de
              sécurité au niveau des lignes (RLS), garantissant que seul vous pouvez consulter
              vos contenus.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Partage des données</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Nous ne vendons jamais vos données. Elles ne sont partagées qu'avec les
              prestataires techniques nécessaires au fonctionnement du service (hébergement,
              fournisseurs d'IA), ou si la loi l'exige.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Vos droits</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de
              suppression, de portabilité et d'opposition concernant vos données. Vous pouvez
              exercer ces droits depuis vos paramètres ou en nous contactant.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Conservation</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vos données sont conservées tant que votre compte est actif. À la suppression de
              votre compte, elles sont définitivement effacées sous 30 jours, sauf obligation
              légale contraire.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Cookies</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Kaayu utilise uniquement des cookies essentiels au fonctionnement du service
              (session, préférences). Aucun cookie publicitaire ou de suivi tiers n'est déposé.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Modifications</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cette politique peut évoluer. Toute modification importante vous sera notifiée par
              e-mail ou via l'application.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Contact</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pour toute question relative à cette politique ou à vos données personnelles,
              contactez-nous à :{" "}
              <a
                href="mailto:privacy@kaayu.app"
                className="text-primary underline-offset-4 hover:underline"
              >
                privacy@kaayu.app
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 border-t pt-6">
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à l'accueil
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
