import { useEffect, useState } from "react";
import { toast } from "sonner";

export function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      toast.success("Connexion rétablie");
    };
    const onOffline = () => {
      setOnline(false);
      toast.warning("Hors connexion — les modifications seront synchronisées au retour");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
