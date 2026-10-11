# Prompt: build "JobTrackr" (job application tracker + PWA)

Copy everything below the line into another AI model (ChatGPT, Gemini, Cursor, etc.). It is self-contained.

---

You are a senior full-stack engineer. Build a complete, production-ready web app called **JobTrackr**: a job application tracker that also installs as a PWA on phone and desktop. Deliver working code, not pseudo-code.

## 1. Tech stack (fixed)

- **Backend:** NestJS 10 (TypeScript), REST API under `/api`
- **Frontend:** Vue 3 (Composition API, `<script setup>`), Vue Router, Vite, `vite-plugin-pwa`
- **Database:** PostgreSQL on **Neon** (serverless). Use **Prisma** with `DATABASE_URL` (pooled) and `DIRECT_URL` (direct, for migrations)
- **Email:** Gmail SMTP through **Nodemailer** (`smtp.gmail.com`, port 465, App Password)
- **Auth:** email + password, bcrypt, JWT bearer tokens, password reset by email
- **CV PDF:** PDFKit on the server
- **No paid third-party APIs** required for the core features

## 2. What the app does

The user is a job seeker who wants to track applications and know where they are likely to succeed.

1. **Add a job by URL.** The user pastes a job link. The backend fetches the page and extracts: title, company, location, salary text, employment type and full description. Extraction order: schema.org `JobPosting` JSON-LD first, then Open Graph / page text fallback. If the site blocks scraping, the UI lets the user paste the job description text instead, and everything else still works.
2. **Confidence score.** Compare the job with the user's profile **and** their uploaded CV text. Return a 0-100 score with: matched skills, missing skills, three sub-scores (skills 60%, job title 20%, experience 20%), required vs actual years of experience, and short human-readable reasons. Labels: High >= 70, Medium 45-69, Low < 45. Use a skills dictionary with aliases (e.g. "nodejs" = "Node.js", "k8s" = "Kubernetes") and word-boundary matching. Re-score all jobs when the profile or CV changes.
3. **Pipeline tracking.** Each job has one status: `SAVED`, `WAITING`, `IN_PROGRESS`, `INTERVIEW`, `OFFER`, `CLOSED`. Kanban board with drag and drop, plus a status dropdown on each card for touch devices. Per job: notes, applied date, follow-up date, interview date and time.
4. **Profile data.** Personal details, summary, education, work experience (including previous salary), skills (with categories), projects (with up to several PNG/JPEG images), certifications/achievements, publications, references. Every list supports add, edit, delete and manual reordering.
5. **CV upload.** User uploads a PDF CV. Extract the text (`pdf-parse`), store it for matching, auto-fill empty contact fields (email, phone, LinkedIn, GitHub) and add detected skills that are not saved yet.
6. **CV generator.** Generate a PDF from the profile in this exact style: A4, Times font, name centered at the top with a contact line, section headings in **bold capitals with a thin rule underneath**, institution/company in bold on the left with location on the right, qualification/title on the left with dates right-aligned, bullet points for details. Sections in order: Profile, Education, Experience, Projects (with images), Skills (grouped by category), Certification/Achievements, Publications, References. The user can choose which sections and whether images are included, preview in the browser and download.
7. **Career planning.** Save previous jobs (reuse work experience with salary). A "next job plan" with target role, industries, locations, target start date and notes.
8. **Income goal.** User enters current income (monthly or yearly, currency). The target range is current income + 20% to + 30% (both percentages editable). Show the resulting range on the dashboard and career page.
9. **Dashboard.** Counts per stage, response rate (applied vs replies), average match, income goal, upcoming interviews and due follow-ups, best saved matches.
10. **Email (Gmail SMTP).** Welcome email, password reset email (1 hour token, store only a SHA-256 hash), and a daily 08:00 digest (user's time zone) listing interviews in the next 48 hours and follow-ups due. The user can switch the digest off.

## 3. Data model (Prisma)

`User`, `Profile` (1:1, includes `currentSalary`, `salaryCurrency`, `salaryPeriod`, `targetIncreaseMin` default 20, `targetIncreaseMax` default 30, `cvText`, `cvFileId`, `remindersEnabled`), `CareerPlan` (1:1), `Education`, `Experience` (with `salary`, `current`, `bullets String[]`), `Skill`, `Project` (`tech String[]`, `imageIds String[]`), `Certification`, `Publication`, `Reference`, `Job` (`status` enum, `matchScore`, `matchDetails Json`, `appliedAt`, `interviewAt`, `followUpAt`), `FileAsset` (images and the uploaded CV stored as `Bytes`, so no disk is needed on free hosts). All user-owned tables carry `userId` with `onDelete: Cascade`, and every query must be scoped to the authenticated user.

## 4. API (all JSON, JWT required except where noted)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/forgot`, `POST /auth/reset` (public, rate limited), `GET /auth/me`
- `GET /profile`, `PUT /profile`, `GET /profile/goal`, `GET/PUT /profile/career`
- Generic sections: `GET|POST /profile/section/:section`, `PATCH|DELETE /profile/section/:section/:id`, `PUT /profile/section/:section/order` for `education|experience|skills|projects|certifications|publications|references`. Whitelist and coerce fields per section on the server
- `POST /jobs/preview` (body `{url}` or `{rawText}`), `POST /jobs`, `GET /jobs`, `GET /jobs/stats`, `GET|PATCH|DELETE /jobs/:id`, `POST /jobs/:id/rescore`, `POST /jobs/rescore-all`
- `POST /cv/upload`, `GET /cv/original`, `GET /cv/pdf?sections=a,b&images=0|1&download=1`
- `POST /files` (PNG/JPEG, max 3 MB), `GET /files/:id` (public image by unguessable id), `DELETE /files/:id`
- `GET /health`

## 5. Frontend screens

Login / register / forgot password, reset password, Dashboard, Applications (kanban), Add job (URL to analysis to editable details to save), Job detail (stage stepper, score panel, dates, notes, description), Profile (tabs per section), Career and income, CV builder (upload, section toggles, live PDF preview, download).

Design: clean, modern, indigo accent, card layout. Desktop uses a left sidebar; mobile (<= 860px) uses a bottom tab bar, large touch targets and horizontally snapping kanban columns. Loading, empty and error states everywhere.

## 6. PWA requirements

- Web manifest (name, short name, theme colour, `display: standalone`, 192/512 and maskable icons) via `vite-plugin-pwa`
- Service worker with `autoUpdate`; precache the app shell; `NetworkFirst` for GET `/api` calls (not the CV PDF); `CacheFirst` for `/api/files/*`; SPA navigation fallback that excludes `/api`
- Clear API caches on logout
- Installable on Android, iOS (Add to Home Screen) and desktop Chrome/Edge

## 7. Security and quality requirements

- Validate input (`class-validator` for auth DTOs, manual whitelisting elsewhere), `helmet`, CORS restricted to `CORS_ORIGIN`, rate limiting (`@nestjs/throttler`), stricter limits on auth and scraping endpoints
- **SSRF protection** on the URL fetcher: http/https only, resolve DNS, block private/loopback/link-local ranges, follow redirects manually (max 4) and re-check each hop, 15 s timeout, 3 MB cap
- Never log or return password hashes or reset tokens. Forgot-password always returns the same response
- Escape user text in HTML emails
- Secrets only from environment variables. Provide `.env.example` files
- TypeScript compiles with no errors, `vite build` succeeds

## 8. Environment variables

Backend: `DATABASE_URL`, `DIRECT_URL`, `PORT`, `JWT_SECRET`, `CORS_ORIGIN`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `TZ_NAME`.
Frontend: `VITE_API_URL` (empty in dev; Vite proxies `/api` to `localhost:3000`).

## 9. How to deliver

1. Print the final folder tree first.
2. Then output **every file in full**, one fenced code block per file, with the path as a heading. No "rest of the file here" placeholders.
3. Build in this order and say when each stage is done: (a) Prisma schema and Nest bootstrap, (b) auth + mail, (c) profile sections + files, (d) jobs: extractor, matcher, CRUD, stats, (e) CV upload + PDF, (f) reminders cron, (g) Vue app shell, router and API client, (h) each view, (i) PWA config and icons.
4. End with exact commands: install, `npx prisma migrate dev --name init`, run backend, run frontend, build for production, plus Neon and Gmail App Password setup steps.
5. List any assumptions you made and any feature you could not fully implement.

## 10. Nice-to-have (only after everything above works)

- Optional LLM extraction when an API key is set (fall back to the rule-based extractor)
- Drag-and-drop ordering inside kanban columns
- CSV export of all applications
- Cover-letter draft generated from the job and profile
- Dark mode
