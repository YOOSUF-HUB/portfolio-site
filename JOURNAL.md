# Field Notes — publishing & build

The journal at `/journal/` is generated from Markdown files that Pages CMS
writes to this repository. Nothing else on the site is generated.

## Publishing (Pages CMS)

1. Open https://app.pagescms.org and sign in with GitHub.
2. Choose this repository and the branch Vercel deploys from.
3. Pick a collection: **Blog articles**, **Events & conferences**,
   **Hackathons** or **Experiments & dev logs**.
4. Fill in the fields, upload images (stored in `assets/images/journal/`),
   and set **Publication status**:
   - `Draft` — saved to GitHub, never built or deployed.
   - `Published` — appears on the site after the next deploy.
5. Save. Pages CMS commits the file to `content/journal/<collection>/<slug>.md`;
   Vercel builds and deploys automatically.

Participation details (event role, hackathon result) are separate fields and
never affect publication.

## Build

```bash
npm install            # once (marked + yaml)
npm run journal:check  # validate published entries, write nothing
npm run build          # assemble the deployable site in dist/
```

`npm run build` copies the hand-made site into `dist/` unchanged and adds:
`dist/journal/` (listing + one page per entry), `journal/latest.json`
(homepage "Latest field notes"), `journal/feed.xml` (RSS), `sitemap.xml`
and `robots.txt`. `content/`, `scripts/`, `node_modules/` and config files
are not copied, so drafts can't be downloaded from the live site.

Vercel runs the same command (`vercel.json` → `buildCommand`,
`outputDirectory: dist`). If a published entry is invalid (missing required
field, bad date, duplicate slug, cover image without alt text…) the build
stops with a message naming the file and field, and the previous deployment
stays live. Set the entry back to Draft or fix it in Pages CMS.

Preview locally: `npm run build`, then serve `dist/` with any static server
(e.g. `npx serve dist`), or run `vercel dev`.

Options: `node scripts/build-journal.mjs --content <dir> --out <dir>`;
`SITE_URL` overrides the canonical origin (default https://yoosufahamed.com).

## Images

- **Where they go.** Every upload (cover, gallery, inline) is stored in
  `assets/images/journal/` and saved in content as `/assets/images/journal/<file>`.
  Uploads are renamed to safe lowercase names (`My Photo.JPG` → `my-photo.jpg`).
- **Cover image + alt text.** Set *Cover image* and describe it in
  *Cover image description*. The build refuses a cover without alt text.
- **Inline images (body).** Use the image button in the editor, then click the
  image and use **ALT** to describe it — the editor pre-fills the file name,
  which the build reports as a note. For a caption, write an *italic line*
  directly under the image:

  ```markdown
  ![A server rack after the migration](/assets/images/journal/rack.jpg)
  *The rack after the migration.*
  ```

  Two or more images in the same paragraph are shown side by side.
- **Galleries (events, hackathons).** Add one gallery item per image: image,
  description (alt, required) and optional caption. Images keep their own
  proportions; pages show photographs in monochrome and the fullscreen viewer
  shows the original.
- **Size.** There is no image processing step, so the uploaded file is what
  visitors download. Export photos at most ~2400 px wide as JPEG/WebP (~80%
  quality); the build warns about files over 1.5 MB.
- **Drafts.** Images used only by drafts are not deployed.

## Manual test: Pages CMS → site (run once on a preview branch)

Use a throwaway branch (e.g. `cms-test`) so test content never reaches production.

1. **Cover image** — Blog articles → *Add entry*. Title `CMS test article`,
   slug `cms-test-article`, excerpt, publish date, category. Upload a cover
   image and fill *Cover image description*. Keep status **Draft**. Save.
2. **Inline image** — in *Body*, write a paragraph, insert an image with the
   editor's image button (upload a new file), click it → **ALT** → describe it.
   Under it type an italic caption line. Add another paragraph. Save.
3. **Event gallery** — Events & conferences → *Add entry* (slug
   `cms-test-event`). Add three gallery items, each with an image upload,
   a description, and a caption on at least one. Save as **Draft**.
4. **Inspect what was committed** (GitHub → the commit, or `git pull`):
   - `content/journal/articles/cms-test-article.md` and
     `content/journal/events/cms-test-event.md` exist;
   - `cover_image:` and each `gallery[].image:` start with `/assets/images/journal/`;
   - the body contains `![your alt text](/assets/images/journal/…)` followed by
     the `*caption*` line (note if the editor wrote raw `<img>` HTML instead —
     the build handles both);
   - the image files are in `assets/images/journal/`;
   - dates look like `2026-11-27`, status is `Draft`.
5. **Draft stays private** — run `npm run build`: the notes say both entries
   were skipped; `dist/journal/` has no `cms-test-*` folder and
   `dist/assets/images/journal/` does not contain the new uploads.
6. **Publish** — set both entries to **Published** and save. Run
   `npm run build` (no errors), then preview `dist/` or the Vercel preview URL:
   cover shown, inline image between paragraphs with its caption, three gallery
   images, each opens in the fullscreen viewer (arrows, Escape, swipe on phone).
7. **Clean up** — delete both entries and their images in Pages CMS (or drop
   the branch). If anything in step 4 differs from the expectations above,
   keep the committed `.md` file and adapt `scripts/build-journal.mjs` to it.
