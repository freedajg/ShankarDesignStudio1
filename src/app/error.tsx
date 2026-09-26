"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

/** Friendly fallback for unexpected errors — never shows technical details to customers. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-semibold">Something went wrong on our side</h1>
        <p className="mt-2 text-ink-muted">
          Please try again in a moment. If you were designing, your work is saved on this device.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
