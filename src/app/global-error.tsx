"use client";

/** Last-resort error screen when even the root layout fails (e.g. missing server configuration). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#faf8f5", color: "#1c1a17" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>The studio is temporarily unavailable</h1>
          <p style={{ color: "#5e5850" }}>Please try again shortly.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 16px", borderRadius: 10, border: 0, background: "#1c1a17", color: "#fff", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
