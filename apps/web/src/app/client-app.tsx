"use client"

import dynamic from "next/dynamic"

/** The app boots a WebGPU scene, so it is never rendered on the server. */
const App = dynamic(() => import("@/app-shell"), {
  ssr: false,
  loading: () => <div className="h-dvh w-screen bg-background" />,
})

/** The ssr:false boundary: everything interactive renders beneath it, client-side only. */
export function ClientApp() {
  return <App />
}
