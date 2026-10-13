"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/app-states";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Brunovia application error", { message: error.message, digest: error.digest, stack: error.stack }); }, [error]);
  return <div className="grid min-h-dvh place-items-center p-4"><div className="w-full max-w-xl"><ErrorState title="Brunovia could not open this screen" description={`Your data is safe. Check your connection and try again.${error.digest ? ` Support reference: ${error.digest}` : ""}`} retry={reset} /></div></div>;
}
