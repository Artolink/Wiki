import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

export type SocialLink = {
  label: string
  href: string
  icon: "github" | "linkedin" | "home" | "mail" | "rss"
}

type SocialLinksOpts = {
  links: SocialLink[]
}

const ICONS: Record<SocialLink["icon"], string> = {
  github: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.73 18.27.5 12 .5z"/></svg>`,
  linkedin: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.05-1.86-3.05-1.86 0-2.15 1.45-2.15 2.95v5.67H9.33V9h3.42v1.56h.05c.48-.9 1.64-1.86 3.37-1.86 3.6 0 4.27 2.37 4.27 5.46v6.29zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zm1.78 13.02H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/></svg>`,
  home: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
  mail: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
  rss: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6.18 15.64a2.18 2.18 0 1 1 0 4.36 2.18 2.18 0 0 1 0-4.36zM4 4.44v3.13c7.1 0 12.86 5.76 12.86 12.86H20C20 11.12 12.88 4 4 4.44zm0 5.82v3.13c3.79 0 6.86 3.07 6.86 6.86h3.14C14 14.6 9.51 10.26 4 10.26z"/></svg>`,
}

export default ((opts?: SocialLinksOpts) => {
  const links = opts?.links ?? []
  const SocialLinks: QuartzComponent = ({ displayClass }: QuartzComponentProps) => {
    return (
      <nav class={classNames(displayClass, "social-links")} aria-label="External links">
        {links.map((l) => (
          <a
            class="social-link"
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={l.label}
            title={l.label}
          >
            <span class="social-link-icon" dangerouslySetInnerHTML={{ __html: ICONS[l.icon] }} />
            <span class="social-link-label">{l.label}</span>
          </a>
        ))}
      </nav>
    )
  }

  SocialLinks.css = `
.social-links {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.social-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  color: var(--darkgray);
  text-decoration: none;
  font-size: 0.9rem;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.social-link:hover {
  background: var(--lightgray);
  color: var(--dark);
  text-decoration: none;
}

.social-link-icon {
  display: inline-flex;
  align-items: center;
}

@media all and (max-width: 900px) {
  .social-link-label {
    display: none;
  }
}
`
  return SocialLinks
}) satisfies QuartzComponentConstructor<SocialLinksOpts>
