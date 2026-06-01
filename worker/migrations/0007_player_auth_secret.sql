-- P-SEC-1: device-local identity auth. Closes the impersonation exploit where
-- anyone presenting a known persistent_id was issued a session token for that
-- player. From here a player row is bound to a secret known only to the device
-- that created it.
--
-- auth_secret_hash: hex(SHA-256(authSecret)). The plaintext authSecret never
--   touches D1 - only its hash is stored, and the client holds the plaintext in
--   localStorage. NULL means "not yet bound": every row that existed before this
--   migration is grandfather-eligible and gets a fresh secret minted on its next
--   register (trust-on-first-use). Once non-NULL, re-register must present a
--   matching secret or it is rejected.
-- auth_bound_at: ms-epoch the row's secret was first set, for audit. NULL until
--   bound. Nullable so the column add does not require backfilling old rows.
--
-- Append-only: migrations 0001-0006 are immutable. This is the next sequence
-- number. No account-recovery surface ships here - that is a separate future
-- cycle. Do not apply to remote D1 as part of this change.

ALTER TABLE players ADD COLUMN auth_secret_hash TEXT;
ALTER TABLE players ADD COLUMN auth_bound_at INTEGER;
