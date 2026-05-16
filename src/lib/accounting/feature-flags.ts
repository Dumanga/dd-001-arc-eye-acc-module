// Feature flags for the accounting module. Code that is hidden via these
// flags stays in the repo so it can be re-enabled later by flipping the
// flag (no code archeology, no re-scaffolding).
//
// POS — the POS billing surface (fast cash-counter flow). Disabled for the
// current customer (architectural firm, service-led). Re-enable when a CR
// brings it back: the routes, components, API, and posting code all still
// exist behind the flag.
export const POS_ENABLED = false;
