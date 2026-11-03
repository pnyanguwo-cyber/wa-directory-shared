// Dev-only payment simulation controls.
//
// The "⚙ Simulate payment" buttons render — and /api/pay/simulate accepts
// requests — when either:
//   • the app runs locally (NODE_ENV !== 'production'), or
//   • the deployment sets NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION=1
//     (inlined into the client bundle at build time; also readable by the
//     server at runtime). The API additionally honors the server-only
//     ENABLE_PAYMENT_SIMULATION=1 so the gate can be opened without shipping
//     the buttons.
//
// WARNING: enabling this on a publicly reachable deployment lets anyone
// activate listings, bids, or premium without paying. Prefer preview/staging
// deployments, or flip the variable off in production.

export function paymentSimulationEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION === '1'
  )
}

export function paymentSimulationApiEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION === '1' ||
    process.env.ENABLE_PAYMENT_SIMULATION === '1'
  )
}
