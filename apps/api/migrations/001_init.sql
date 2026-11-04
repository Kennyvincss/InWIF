-- InWIF backend schema. Stores ONLY public, non-sensitive information.
-- There are deliberately no columns for private keys, recovery phrases,
-- passwords, vaults or signatures-as-credentials. Do not add any.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  preferences   jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Public addresses a user has proven control of (via signed login message).
CREATE TABLE IF NOT EXISTS wallet_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address       text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  name          text NOT NULL DEFAULT 'Wallet' CHECK (length(name) <= 40),
  network       text NOT NULL CHECK (network IN ('robinhood', 'robinhoodTestnet', 'local')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, address, network)
);
CREATE INDEX IF NOT EXISTS wallet_profiles_address_idx ON wallet_profiles (address);

CREATE TABLE IF NOT EXISTS hardware_devices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_identifier text NOT NULL CHECK (device_identifier ~ '^[A-Za-z0-9-]{4,64}$'),
  name              text CHECK (name IS NULL OR length(name) <= 32),
  model             text NOT NULL CHECK (length(model) <= 64),
  firmware_version  text NOT NULL CHECK (length(firmware_version) <= 32),
  simulated         boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_identifier)
);

CREATE TABLE IF NOT EXISTS device_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id         uuid NOT NULL REFERENCES hardware_devices(id) ON DELETE CASCADE,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  firmware_version  text NOT NULL,
  transport         text NOT NULL CHECK (transport IN ('simulator', 'webserial', 'webhid', 'ble', 'usb'))
);
CREATE INDEX IF NOT EXISTS device_connections_device_idx ON device_connections (device_id, connected_at DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address   text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  network          text NOT NULL,
  tx_hash          text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  tx_type          text NOT NULL CHECK (tx_type IN ('send', 'receive', 'swap', 'approve', 'revoke', 'claim', 'contract')),
  status           text NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, tx_hash, wallet_address)
);

CREATE TABLE IF NOT EXISTS rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id     bigint NOT NULL,
  reward_type     text NOT NULL CHECK (reward_type IN ('security-tutorial', 'community-campaign', 'quest', 'hackathon', 'contribution')),
  amount          numeric(78, 0) NOT NULL CHECK (amount > 0),
  claim_status    text NOT NULL DEFAULT 'unclaimed' CHECK (claim_status IN ('unclaimed', 'claimed', 'expired')),
  claim_tx_hash   text CHECK (claim_tx_hash IS NULL OR claim_tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);

-- One-time login challenges (EIP-191 message nonces).
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce        text PRIMARY KEY,
  address      text NOT NULL,
  message      text NOT NULL,
  expires_at   timestamptz NOT NULL,
  used         boolean NOT NULL DEFAULT false
);

-- Session tokens are stored only as SHA-256 hashes.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
