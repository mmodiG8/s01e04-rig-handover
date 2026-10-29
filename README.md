# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Morning digest

- `GET /digest/YYYY-MM-DD`: the night's jobs, sorted by job, in the usual lane layout.
- `GET /api/digest/YYYY-MM-DD`: the same ordered rows as JSON, plus `badLines` and
  `counts` of valid log events by status.
- The status board links every night on disk to its digest and shows those event counts.

Each row includes its run, retry and failure counts, latest owner and status, most recent
error, and first/last timestamps with their original offsets. A recovered job retains its
previous error and failures. Missing owners and errors display as `—`. A missing night
returns 404; an empty file renders "nothing ran"; invalid records are counted and skipped.

## Review copy

With the service running, export the self-contained page outside this repository:

```powershell
curl.exe --fail --silent --show-error http://localhost:8787/digest/2026-10-28 --output ..\preview.html
```

The manual **Publish digest preview** workflow does the same export on a temporary runner
and deploys only that HTML file to GitHub Pages. Enable Pages with the GitHub Actions source
before the first run. It never commits the HTML or `.env`; its deployment artifact expires
after one day.

Obtain human approval before publication. Supply the course marker through the workflow's
`lane_marker` input, never a commit or issue. Keep the preview issue open until the reviewer
confirms they have looked; sending the link is not review completion. After the review is in, obtain separate human
approval and run the same workflow with that input empty. Verify the same public URL says
"no marker set" and no longer contains the old marker before closing the cleanup issue.
Do not upload the HTML to issues or chat attachments.
