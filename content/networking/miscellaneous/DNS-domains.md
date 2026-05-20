---
title: How do domains work? - DNS and the path from a name to an IP
tags:
  - Basics
  - WebsiteCreation
---

## 0. Introduction

That's it, you bought a domain, your personal space on the Internet... but you have no idea how it works nor how to actually use it.

Well, a domain is just a name, but to start using it you need to edit its DNS zone.

you can see the DNS zone like a public *bag of records* that you can use to implement different functionalities for your domain. 

The main functionality that DNS accomplishes is translating the domain name into IP an addresses: this way everybody can reach your domain by typing its URL into a browser. 

Now let's start seeing how everything actually works.

***
## 1. The main actors

- **Registrar**: the company that *sells* you the right to use the name. 
- **DNS provider**: the company running the **authoritative nameservers** for your zone. 
  Most registrars include free DNS hosting. you can also delegate to a third party (Cloudflare DNS is popular and free). The registrar's job here is just to publish the *NS records* pointing at your DNS provider.
- **Host (hosting provider)**: the machine that actually serves your website. 
  The IP you put in the A record. Could be a VPS, a static-site host, or a server in your basement.

You can mix-and-match: register at Namecheap, host DNS at Cloudflare, run the site on Aruba... Or all three at the same provider.

***
## 2. The DNS hierarchy

Domain names look flat (`mail.google.com`) but they're actually a tree that reads from **right-to-left**, with each dot being a branch:

```
                        .  (root, the implicit final dot)
                        |
                       com  (top-level domain — TLD)
                        |
                     google  (second-level)
                        |
                       mail  (subdomain)
```

- The **root** is the unnamed top of the tree. There's an implicit dot at the end of every domain (`google.com.` is the technically correct form, browsers hide it).
- **TLDs** (Top-Level Domains) are the rightmost label: `.com`, `.org`, `.it`, `.io`, `.dev`. 
  Some are *generic* (`.com`), some are *country-coded* (`.it`, `.uk`), some are *new gTLDs* (`.app`, `.shop`).
- The **second-level domain** is what you actually buy: `google` in `google.com`, `farnetiandrea` in `farnetiandrea.it`.
- **Subdomains** are anything you add to the left: `mail.`, `wiki.`, `staging.`. 
  You don't buy these: you create as many as you want once you own the second-level domain.

So `wiki.farnetiandrea.it` parses as: subdomain `wiki` of `farnetiandrea`, registered under TLD `it`.

> [!example]- Example: From `wiki.farnetiandrea.it` to `1.2.3.4`
> Type `wiki.farnetiandrea.it` and press Enter.
> 
> Behind the scenes, four actors talk to each other:
> 
> 1. Stub resolver (your laptop / phone) asks the question. "What's the IP of `wiki.farnetiandrea.it`?"
> 2. Recursive resolver: usually run by your ISP, by a public DNS like Google's `8.8.8.8` or Cloudflare's `1.1.1.1`, or by your router. It does the heavy lifting on your behalf, asking around until it gets the answer.
> 3. Authoritative servers at three levels of the tree:
>    * Root servers know who's authoritative for each TLD.
>    * TLD servers (the ones for `.it`, in this case) know who's authoritative for each second-level domain under them.
>    * Authoritative servers for `farnetiandrea.it` itself hold the actual records.
> 
> The conversation, simplified, is the following:
> 
> ```
> You      → Resolver:  "What's the A record for wiki.farnetiandrea.it?"
> Resolver → Root:      "Who handles .it?"
> Root     → Resolver:  "These nameservers do."
> Resolver → TLD (.it): "Who handles farnetiandrea.it?"
> TLD      → Resolver:  "These nameservers do."
> Resolver → Authoritative: "What's the A record for wiki.farnetiandrea.it?"
> Auth     → Resolver:  "1.2.3.4"
> Resolver → You:       "1.2.3.4"
> ```
> 
> Your laptop now opens a TCP connection to `1.2.3.4` on port 443. Done.
> 
> The resolver caches every answer for the duration of its TTL, so the next visitor in the same office doesn't have to re-walk the whole chain.

### The local `hosts` file

Before step 1 (stub resolver) actually goes out, the OS checks a plain-text override: `/etc/hosts` on Linux/macOS, `C:\Windows\System32\drivers\etc\hosts` on Windows. 

Any `IP → hostname` line there resolves DNS entirely for that name:

```
127.0.0.1     myapp.local
192.168.1.50  staging.example.com
0.0.0.0       facebook.com   # block
```

Common uses:

- Point a hostname at a staging/dev IP without touching real DNS.
- Reproduce prod issues against a different server while keeping the URL identical.
- Block trackers or distracting domains at the OS level.

Editing it by hand is fine for one-off changes, but switching between environments gets old fast.

On Windows, [[hostprofiles|HostProfiles]] turns it into a one-click profile switcher with automatic DNS-flush; on Linux/macOS, [hostctl](https://github.com/guumaster/hostctl) is the CLI equivalent.

***
## 3. The DNS records types

As we said, a DNS zone is a *bag of records*. 

Each record has a name, a type, a TTL, and a value. 

The types worth knowing:

- **A**: name to IPv4 address. `wiki.farnetiandrea.it. A 1.2.3.4`
- **AAAA**: name to IPv6 address. Same idea, different protocol. `wiki.farnetiandrea.it. AAAA 2001:db8::1`
- **CNAME**: alias of one name to another. "When asked about `www.example.com`, treat it as `example.com`."
- **MX**:  mail exchanger. Where mail for the domain should go. `example.com. MX 10 mail.example.com.` (the `10` is a priority: lower wins).
- **TXT**:  arbitrary text. Used for ownership verification (Google Search Console asks you to add one), SPF/DKIM email auth, ACME challenges (Let's Encrypt) and so on.
- **NS**: nameserver delegation. Tells the parent zone *which* servers are authoritative for this domain. The records you set at the registrar.

A typical small zone looks like:

```
example.com.        A     1.2.3.4
www.example.com.    A     1.2.3.4
mail.example.com.   A     1.2.3.5
example.com.        MX    10 mail.example.com.
example.com.        TXT   "v=spf1 ip4:1.2.3.5 -all"
```

### TTL and DNS propagation

Every DNS record has a **TTL** (time-to-live, in seconds), which tells resolvers how long they can cache the answer.

- Short TTL (60–300s): changes appear fast, more queries hit the authoritative server.
- Long TTL (3600s–86400s): efficient and cheap, but a record change takes hours to be visible everywhere.

When people say "DNS propagation takes 24h", what's actually happening is **caches expiring**: every resolver in the world has its old copy, and won't query again until the TTL runs out. Lower the TTL *before* a planned change (do it 24h ahead), make the change, and most caches will refresh quickly.

Useful tools to inspect from the outside:

```bash
dig wiki.farnetiandrea.it           # show the A record + TTL
dig MX example.com                  # show MX records
dig +short wiki.farnetiandrea.it    # just the answer
dig @8.8.8.8 example.com            # ask Google's resolver specifically
```

`dig` shipped with most Linux/macOS systems; on Windows use `nslookup` or `Resolve-DnsName` in PowerShell.

***
## 4. Extras

### Let's use this wiki as an example

Setting up `wiki.farnetiandrea.it` to point at a VPS:

1. **Register** `farnetiandrea.it` with a registrar (one-time + yearly).
2. **Choose DNS provider**: I use the registrar's default. They give you a control panel for adding records and it's very handy.
3. **Add an A record**:
    - Name: `wiki`
    - Type: `A`
    - Value: `1.2.3.4` (your VPS public IP)
    - TTL: 3600 (1 hour)
4. **Wait** a few minutes (or up to TTL): now `dig wiki.farnetiandrea.it` from your laptop and it should answer with `1.2.3.4`.
5. On my VPS, my web server (Nginx) is configured for `server_name wiki.farnetiandrea.it`, and my firewall lets in 80 and 443.
6. When someone from the browser visits `https://wiki.farnetiandrea.it`, their OS resolves the name and opens the connection.

This is pretty much the chain at work behind [[create-a-wiki-like-this|the wiki you're reading]].

### What I highly suggest checking

- [Cloudflare's DNS learning hub](https://www.cloudflare.com/learning/dns/) : visual, well-written introduction to every DNS topic in detail.
- [How DNS works (comic)](https://howdns.works/): same concepts told as a story, for when you want the picture in your head before the spec.
- [dnschecker](https://dnschecker.org/): see live DNS changes for your domain!
