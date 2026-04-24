import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"

type GitHubEditOpts = {
  repoUrl: string
  branch?: string
  contentDir?: string
  label?: string
}

export default ((opts: GitHubEditOpts) => {
  const branch = opts.branch ?? "main"
  const contentDir = opts.contentDir ?? "content"
  const label = opts.label ?? "Edit"
  const baseRepo = opts.repoUrl.replace(/\/$/, "")

  const GitHubEdit: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const relPath = fileData.relativePath
    if (!relPath) return null
    const href = `${baseRepo}/blob/${branch}/${contentDir}/${relPath}`
    return (
      <a
        class={classNames(displayClass, "github-edit")}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label} on GitHub`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.68-1.27-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.21.66.79.55 4.57-1.52 7.85-5.83 7.85-10.91C23.5 5.73 18.27.5 12 .5z" />
        </svg>
        <span class="github-edit-label">{label}</span>
      </a>
    )
  }

  GitHubEdit.css = `
.github-edit {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--lightgray);
  border-radius: 6px;
  color: var(--darkgray);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 500;
  background: var(--light);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  line-height: 1;
}

.github-edit:hover {
  background: var(--lightgray);
  border-color: var(--gray);
  color: var(--dark);
  text-decoration: none;
}

.github-edit svg {
  flex-shrink: 0;
}
`
  return GitHubEdit
}) satisfies QuartzComponentConstructor<GitHubEditOpts>
