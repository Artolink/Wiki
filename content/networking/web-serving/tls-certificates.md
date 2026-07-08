---
title: "TLS certificates: inspect, verify, convert, troubleshoot"
tags:
  - Basics
  - WebsiteCreation
---

## Theory
### What is a TLS/SSL certificate

A TLS certificate (still often called "SSL certificate" out of habit: SSL has been deprecated since 2015) is a small file that proves *"I am `example.com`, and here's a public key the world can use to encrypt traffic to me"*. 

The proof comes from a digital signature by a **Certificate Authority (CA)** that the client already trusts.

Crucially, **a certificate is always half of a keypair, not a thing in itself**:

- The **public key** lives *inside* the certificate. The CA signs it. It's distributed freely: anyone connecting to your server downloads it during the TLS handshake.
- The **private key** is a separate file kept on the server, **never shared**. It's what proves the server actually owns the identity the certificate claims.

> [!HELP]
> If the keypair concept is new to you, see [[SSH-Linux#How asymmetric cryptography works|the SSH guide section on asymmetric cryptography]].

The format is **X.509**: a standardised structure with fields like `Subject`, `Issuer`, `Validity`, `Signature`. 

Every browser, server, and OS ships with a list of pre-trusted CAs (the *trust store*), and any cert signed by one of them is automatically trusted.

This guide covers everything *except* renewal: for issuing/renewing free certs from Let's Encrypt, see [[certbot-setup-guide|the Certbot setup guide]].

***

### Anatomy of an X.509 certificate

A typical cert contains:

| Field                               | What it is                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Subject**                         | Who the cert is for (`CN=example.com`, plus optional org details)                                                                  |
| **Subject Alternative Names (SAN)** | Extra hostnames the cert covers (`*.example.com`, `api.example.com`...): modern browsers ignore the CN entirely and look only here |
| **Issuer**                          | Who signed it (a CA, e.g. `Let's Encrypt`, `DigiCert`)                                                                             |
| **Validity**                        | `Not Before` / `Not After` dates                                                                                                   |
| **Public Key**                      | The half of the keypair the world sees (RSA-2048, ECDSA-P256, ...)                                                                 |
| **Signature**                       | The CA's cryptographic signature over all the fields above                                                                         |
| **Serial Number**                   | Unique ID assigned by the CA, used for revocation tracking                                                                         |
| **Fingerprint**                     | Hash of the whole cert (SHA-256). Useful for identifying / pinning                                                                 |

***

### File formats you'll see

Same X.509 data, multiple containers. 

Confusion factor: high.

| Format | Encoding | Typical extensions | Where you find it |
|---|---|---|---|
| **PEM** | Base64 + `-----BEGIN CERTIFICATE-----` headers (ASCII) | `.pem`, `.crt`, `.cer`, `.key` | Linux defaults. Concatenable: multiple PEM blocks in one file = chain |
| **DER** | Raw binary | `.der`, `.cer` | Java keystores, some Windows tools |
| **PKCS#7** | Container, no private key | `.p7b`, `.p7c` | Microsoft IIS, S/MIME |
| **PKCS#12** | Container, includes private key, password-protected | `.pfx`, `.p12` | Windows certificate store, Java keystores, mobile profile install |

> [!INFO]
> **`.crt` and `.cer` are ambiguous**: they can be either PEM or DER. 
> 
> Open the file: if it starts with `-----BEGIN`, it's PEM, if it's binary garbage, it's DER.

***

## Commands
### Inspecting a certificate

The Swiss army knife is `openssl x509`. 

Most-used invocations:

```bash
# Full human-readable dump
openssl x509 -in cert.pem -text -noout

# Just subject + issuer + validity (the 80% case)
openssl x509 -in cert.pem -noout -subject -issuer -dates

# SAN list (the real domains it covers, ignoring CN)
openssl x509 -in cert.pem -noout -ext subjectAltName

# Fingerprints (for pinning / matching)
openssl x509 -in cert.pem -noout -fingerprint -sha256
openssl x509 -in cert.pem -noout -fingerprint -sha1
```

If the file is DER instead of PEM, add `-inform DER`:

```bash
openssl x509 -in cert.der -inform DER -text -noout
```

***
### Check expiration

This is the operational question that comes up the most.

### One-shot check on a file

```bash
# Get just the expiry date
openssl x509 -in cert.pem -noout -enddate
# notAfter=Aug 15 10:30:00 2026 GMT
```

### One-shot check on a live server

Useful when you want to verify *what the server is actually serving* (which might differ from what's in `/etc/letsencrypt/...` if nginx was never reloaded):

```bash
echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

The `-servername` flag is **important** for shared-IP servers: without it the server might serve a different (default) cert via SNI fallback.

***

### Verify the keys

When you have a `cert.pem` and a `key.pem` and want to verify they're actually a pair (e.g. after a botched copy-paste), compare their public moduli:

```bash
openssl x509 -in cert.pem -noout -modulus | openssl md5
openssl rsa  -in key.pem  -noout -modulus | openssl md5
```

If the two MD5 hashes are identical, they match. If different, you've crossed wires somewhere.

For ECDSA keys (modern, smaller, faster), the modulus trick doesn't apply: use the public key hash instead:

```bash
openssl x509 -in cert.pem -noout -pubkey | openssl sha256
openssl pkey -in key.pem  -pubout         | openssl sha256
```

Same logic: identical hashes = pair.

***
### Regenerate the public key from a private key

The public key is mathematically derivable from the private key (and the reverse is the whole point of asymmetric crypto: impossible). 

If you've lost the public key, you can rebuild it from the private one in one command:

```bash
# Modern, works for RSA / ECDSA / Ed25519 / any key type OpenSSL supports
openssl pkey -in private.key -pubout -out public.key
```

> [!INFO]
> For **SSH keys** (OpenSSH format, e.g. `~/.ssh/id_ed25519`), the equivalent command is `ssh-keygen -y`:
> ```bash
> ssh-keygen -y -f ~/.ssh/id_ed25519 > ~/.ssh/id_ed25519.pub
> ```
> See [[SSH-Linux#The procedure|the SSH guide]] for the full SSH keypair workflow.

***
### Converting between formats

Frequent need: same cert, different container, for whichever tool you're feeding.

```bash
# PEM ──> DER
openssl x509 -in cert.pem -outform DER -out cert.der

# DER ──> PEM
openssl x509 -in cert.der -inform DER -out cert.pem

# PEM (cert + key) ──> PKCS#12 (.pfx, for Windows/Java/mobile)
openssl pkcs12 -export \
  -inkey key.pem -in cert.pem -certfile fullchain.pem \
  -name "example.com" -out bundle.pfx
# (prompts for an export password — required)

# PKCS#12 ──> PEM (extract cert + key separately)
openssl pkcs12 -in bundle.pfx -nocerts -nodes -out key.pem
openssl pkcs12 -in bundle.pfx -nokeys           -out cert.pem
```

> [!TIP]
> When extracting from PKCS#12, `-nodes` ("no DES") means *"don't encrypt the output key with a passphrase"*. Skip it if you want the output key still encrypted.

***
### Connect to a live server: openssl s_client

The classic "what's *actually* happening on the wire" tool:

```bash
# Basic handshake + cert dump
openssl s_client -connect example.com:443 -servername example.com

# Test a specific TLS version
openssl s_client -connect example.com:443 -servername example.com -tls1_3

# Test a specific cipher suite
openssl s_client -connect example.com:443 -servername example.com -cipher 'ECDHE-RSA-AES256-GCM-SHA384'

# StartTLS (SMTP, IMAP, POP3, FTP, LDAP, ...)
openssl s_client -connect smtp.example.com:587 -starttls smtp
openssl s_client -connect imap.example.com:143 -starttls imap
```

`s_client` stays connected: press Ctrl+D or send `Q` to close.

For HTTP-style debugging (verify TLS + actually do a GET):

```bash
echo -e "GET / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n" \
  | openssl s_client -quiet -connect example.com:443 -servername example.com
```


***

## The certificate chain

A cert is signed by an *intermediate* CA, which is signed by a *root* CA. 

The chain has to be complete for clients to verify trust.

```
your-cert  ──signed by──>  intermediate CA  ──signed by──>  root CA  (in browser trust store)
```

### Verify a chain locally

```bash
openssl verify -CAfile chain.pem cert.pem
# cert.pem: OK
```

If you get `unable to get local issuer certificate`, the chain is incomplete or the intermediate is missing.

### Build a full chain PEM

Many servers (nginx included) want a single PEM with **your cert first, then the intermediates** (root excluded: clients already have it):

```bash
cat your-cert.pem intermediate.pem > fullchain.pem
```

Let's Encrypt's `fullchain.pem` is already built like this.

### Inspect what a live server is serving as chain

```bash
echo | openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null
```

Look for the `Certificate chain` block — every `-----BEGIN CERTIFICATE-----` is one hop. 

If there's only your leaf cert, the intermediate is missing.

***

## System trust store

Where Linux keeps the CAs it trusts globally. 

Useful when you need to add a private CA (corporate, internal lab, self-signed root).

| Distro family | Trust store path | Update command |
|---|---|---|
| **Debian / Ubuntu** | `/etc/ssl/certs/` (symlinks) + `/usr/share/ca-certificates/` (sources) | `sudo update-ca-certificates` |
| **RHEL / Fedora / CentOS** | `/etc/pki/ca-trust/source/anchors/` | `sudo update-ca-trust extract` |

### Add a custom CA on Debian/Ubuntu

```bash
sudo cp my-internal-ca.crt /usr/local/share/ca-certificates/my-internal-ca.crt
sudo update-ca-certificates
# Updating certificates in /etc/ssl/certs...
# 1 added, 0 removed; done.
```

The file **must be PEM-formatted** and have a `.crt` extension. 

After this, `curl`, `git`, `wget` and most CLI tools using OpenSSL trust the CA automatically.

> [!WARNING]
> **Browsers (Firefox, Chrome) maintain their own trust stores** and ignore the system one on most distros. To trust a custom CA in the browser, import it via the browser's own settings.

***

## Common pitfalls

> [!WARNING]
> **Incomplete chain.** Browsers usually handle this gracefully because they cache intermediates.
> 
 > CLI tools (`curl`, `wget`, monitoring scripts) often don't and fail with *"certificate verify failed"*.
 > 
> Always serve `fullchain.pem`, not just `cert.pem`.

> [!WARNING]
> **Cert/key mismatch after a manual swap.** Symptom: nginx refuses to reload with *"SSL_CTX_use_PrivateKey_file failed"*. Quick check: the modulus trick from above.

> [!WARNING]
> **Wildcards vs SAN.** A `*.example.com` cert covers `foo.example.com` but **not** `bar.foo.example.com` (one level deep only) and **not** `example.com` itself (you need to add the apex to the SAN list separately).

> [!WARNING]
> **Self-signed certs in production.** Acceptable only for internal labs behind their own trust boundary. 
> 
> For anything user-facing, get a free Let's Encrypt cert via [[certbot-setup-guide|Certbot]]: there's no good reason to ship self-signed in 2025.

***

## Where to go next

- [[certbot-setup-guide|Certbot setup guide]]: for issuing and **auto-renewing** Let's Encrypt certificates (the part this guide intentionally skips).
- [[nginx-web-server-setup|Nginx setup]]: where the cert is actually plugged in to serve HTTPS.
