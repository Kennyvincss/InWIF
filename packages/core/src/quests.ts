/** Built-in, off-chain learning quests. Completing them is free and earns nothing on its own. */
export const SECURITY_QUESTS = [
  { id: 'backup', title: 'Back up your recovery phrase', body: 'Write your phrase on paper, verify it, and store it offline.' },
  { id: 'approvals', title: 'Review your token approvals', body: 'Open the Security Centre and revoke approvals you no longer need.' },
  { id: 'simulate', title: 'Read a transaction simulation', body: 'Before your next transaction, read every line of the review screen.' },
  { id: 'phishing', title: 'Spot a phishing request', body: 'InWIF will never ask for your recovery phrase. Nobody legitimate will.' },
  { id: 'hardware', title: 'Try offline signing', body: 'Sign a transaction with the hardware simulator and see the key never leave the device.' },
] as const
