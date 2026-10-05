"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(224 20% 12%)",
            border: "1px solid hsl(224 16% 20%)",
            color: "hsl(210 20% 96%)",
          },
        }}
      />
    </SessionProvider>
  );
}

export default Providers;
