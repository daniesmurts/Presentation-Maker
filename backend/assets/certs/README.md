# Vendored CA certificates

`russian_trusted_ca_bundle.pem` — the two certificates of the Ministry of
Digital Development's national CA, as T-Bank's integration note asks
(developer.tbank.ru/eacq/intro/certificates/migration-russian-trusted-ca):

| Certificate | SHA-256 fingerprint | Valid to |
|---|---|---|
| Russian Trusted **Root** CA | `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31` | 2032-02-27 |
| Russian Trusted **Sub** CA (the one gosuslugi publishes, issued 2022) | `BB:BD:E2:10:3E:79:0B:99:9E:C6:2B:D0:3C:F6:25:A5:A2:E7:C3:16:E1:0A:FE:6A:49:0E:ED:EA:D8:B3:FD:9B` | 2027-03-06 |

Why: `securepay.tinkoff.ru` presents a chain ending in the Root, and no
default trust store (Node's bundled Mozilla list included) contains it —
the very first live `Init` from the container failed with
`SELF_SIGNED_CERT_IN_CHAIN` (2026-09-15). The Dockerfile sets
`NODE_EXTRA_CA_CERTS` to this file, which ADDS these to Node's store;
nothing else changes.

Note on the Sub CA: the server currently sends a NEWER Sub CA (issued
2024-07-15, valid to 2029, a different fingerprint) in its chain, and it
verifies against the Root — so the Root is what actually carries trust and
the Sub here is belt-and-braces per T-Bank's note. Verified on vendoring:
the Root's fingerprint equals the root T-Bank's server sends, and
`openssl verify -CAfile <bundle> -untrusted <served sub> <served leaf>` → OK.

Source: https://www.gosuslugi.ru/crt (PEMs at
gu-st.ru/content/lending/russian_trusted_{root,sub}_ca_pem.crt; they come
with CRLF and no trailing newline — normalise before concatenating, or the
END/BEGIN markers glue together and OpenSSL reads no certificate at all).

For local development, export the same variable before `npm run dev`:
`NODE_EXTRA_CA_CERTS=backend/assets/certs/russian_trusted_ca_bundle.pem`
(a macOS Node may trust the chain already if the certificates were installed
in the system keychain).
