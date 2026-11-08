/**
 * Build-time feature switches (safe to import from server and client components).
 *
 * The hardware wallet (device simulator and USB connection) is off on the public site:
 * no InWIF One device exists yet, so users see "Coming soon". Local and test builds set
 * NEXT_PUBLIC_ENABLE_HARDWARE=true to use the simulator.
 */
export const HARDWARE_ENABLED = process.env.NEXT_PUBLIC_ENABLE_HARDWARE === 'true'
