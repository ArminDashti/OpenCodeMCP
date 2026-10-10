# Signing (digital signature)

1. Use established platform tooling (Authenticode, signtool, cosign, etc. as appropriate).
2. Never commit private keys, certs with private material, or signing passwords.
3. Verify signatures in CI/release when the project already signs builds.
4. If key paths or tooling are missing for this repo, stop and ask — do not invent them.
