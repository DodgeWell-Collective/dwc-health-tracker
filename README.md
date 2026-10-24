# dwc-health-tracker

A self-hosted tracker for training, eating and body composition, built to log a day in as few taps as possible. It runs on your phone and your computer from one database, and it installs to the home screen like an app.

## What it does

- **Today**: calories and macros left for the day, the day's workout, meals, weigh-in, sleep and water.
- **Training**: builds a program from the equipment you have. Each set logs with one tap (Easy, Done, Barely), and weights progress from what you log. Includes warm-up sets, a rest timer and PR badges.
- **Food**: search USDA FoodData Central and Open Food Facts, or scan a barcode. Your usual foods come back as one-tap chips for each meal. Macros are computed from per-100 g data, not estimated.
- **Meal plan and shopping**: a weekly plan sized to your targets, with no recipe repeated within 3 days, and a shopping list grouped by aisle for each grocery trip.
- **Progress**: weight trend against your goal pace, calorie burn measured from your own intake and weight, estimated 1-rep max per lift, labs, blood pressure, VO2 max and balance.
- **Your data**: Settings has a one-click download of everything as CSV files.
- **Claude (optional)**: with an Anthropic API key you can describe a meal in words and get recipe ideas. Without a key those controls are hidden, and everything else works the same.

## Set it up

Pick one of the three options below. They all run the same app; only where it runs differs.

| | **Docker** on a home computer | **Cloudflare** (free plan) | **Node** directly |
| --- | --- | --- | --- |
| Best for | Most people | Phone access from anywhere, with no computer to leave on | Developers changing the code |
| You need | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | A free Cloudflare account and Node 22.5+ | Node 22.5+ and git |
| Runs on | Your computer, NAS or Raspberry Pi | Cloudflare's servers | Your computer |
| Computer must stay on | Yes | No | Yes |
| Phone away from home | With [Tailscale](#reach-it-from-anywhere-with-tailscale) | Yes | With [Tailscale](#reach-it-from-anywhere-with-tailscale) |
| Barcode scanner on phone | Needs HTTPS ([Tailscale](#reach-it-from-anywhere-with-tailscale)) | Yes | Needs HTTPS ([Tailscale](#reach-it-from-anywhere-with-tailscale)) |
| Your data lives in | `data/health.sqlite` | A Cloudflare D1 database | `data/health.sqlite` |
| Cost | Free | Free for one person | Free |

### Option 1: Docker

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.
2. Download this repo (the green **Code** button, then **Download ZIP**, then unzip it), or `git clone` it.
3. In the app's folder, copy `.env.example` to `.env` and set `APP_PASSWORD` in it.
4. In a terminal in that folder, run:
   ```sh
   docker compose up -d
   ```
5. Open http://localhost:3000 and sign in.

Docker starts the app again after a reboot. Your data is saved in the `data` folder next to `docker-compose.yml`, so back up that folder. To update, download the new version and run `docker compose up -d --build`.

### Option 2: Cloudflare

The app runs as a Cloudflare Worker with a D1 database, at an `https://` address that works from anywhere.

```sh
npm install
npx cf auth login
npm run deploy
npx wrangler secret put APP_PASSWORD --name dwc-health-tracker
```

The first deploy creates the database and prints your URL (`dwc-health-tracker.<your-subdomain>.workers.dev`). The app stays locked until `APP_PASSWORD` is set. To use your own domain, see the comment in `cloudflare.config.ts`.

### Option 3: Node

```sh
git clone https://github.com/DodgeWell-Collective/dwc-health-tracker
cd dwc-health-tracker
npm install
cp .env.example .env     # set APP_PASSWORD
npm run build:node
npm start                # http://localhost:3000
```

Your data lives in `data/health.sqlite`. Run `npm start` again after a reboot. To update: `git pull`, `npm install`, `npm run build:node`, then restart.

### After setup

Sign in with `APP_PASSWORD`. Then change the password and add any API keys under **Settings → Sign-in & keys**.

## Use it on your phone

**Cloudflare:** open your `workers.dev` URL on the phone.

**Docker or Node, on the same Wi-Fi:** open `http://<your computer's IP>:3000` on the phone. To find the IP on Windows, run `ipconfig` and use the IPv4 Address. On a Mac, look under System Settings → Wi-Fi → Details. The IP can change, so reserve it in your router's settings if you can. Keep the computer from sleeping while you want the app reachable.

Then sign in, and choose **Add to Home Screen** (iPhone: Share menu; Android: browser menu). It opens full screen with its own icon.

Phones only allow camera access on `https://` pages. Over a plain `http://` address, the barcode scanner won't open, but search and everything else work. Tailscale fixes this (next section).

### Reach it from anywhere with Tailscale

[Tailscale](https://tailscale.com) is free for personal use. It connects your phone to your computer privately, without opening any ports on your router, and gives the app an `https://` address, so the barcode scanner works.

1. Install Tailscale on the computer running the app and on your phone, and sign in to the same account on both.
2. In the Tailscale admin console, under **DNS**, turn on **MagicDNS** and **HTTPS Certificates**.
3. On the computer, run:
   ```sh
   tailscale serve --bg 3000
   ```
4. Tailscale prints an address like `https://my-computer.tail1234.ts.net`. Open it on your phone, at home or away.

Only devices signed in to your Tailscale account can reach that address, and the app's own sign-in still applies.

## Settings

| Name | Needed | What it does |
| --- | --- | --- |
| `APP_PASSWORD` | Yes | The first sign-in password. Once you set a new one in Settings, the Settings password is used instead. |
| `APP_AUTH` | No | Set to `off` to skip sign-in, only when something else (a VPN, Cloudflare Access) guards the app. |
| `ANTHROPIC_API_KEY` | No | Turns on the Claude features. You can enter it in Settings instead. |
| `USDA_API_KEY` | No | Free key from [api.data.gov](https://api.data.gov/signup). Without it, food search uses the rate-limited `DEMO_KEY`. You can enter it in Settings instead. |
| `DATABASE_PATH` | No (Node only; Docker sets it) | SQLite file location. Default `data/health.sqlite`. |

On Cloudflare these are Worker secrets. With Docker or Node they go in `.env`, and for `npm run dev` on Cloudflare they go in `.dev.vars` (see `.dev.vars.example`).

## Sign-in and security

- Every page needs a session except the sign-in page. A device stays signed in for a year, and changing the password signs every other device out.
- Passwords set in Settings are stored as salted PBKDF2 hashes. After 10 wrong passwords in 15 minutes, sign-in locks for 15 minutes.
- API keys entered in Settings are stored in the database's `app_secret` table, and only their last 4 characters are ever shown. That table is left out of the data download. If you copy `data/health.sqlite` somewhere, the keys go with it.
- **Forgot the Settings password?** Delete it, and `APP_PASSWORD` works again:
  - Cloudflare: `npx wrangler d1 execute dwc-health-tracker --remote --command "DELETE FROM app_secret WHERE key = 'password_hash'"`
  - Node: run the same `DELETE` against `data/health.sqlite`, with any SQLite tool.

## Make it yours

- **Stack**: [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite), React 19 and Tailwind.
- **Database**: the schema is in `lib/db.ts` and applies itself on first run. To add a column, put it in `ADDED_COLUMNS` and existing databases pick it up.
- **Sign-in**: `proxy.ts` checks every request, and the sign-in form posts to `app/auth/login/route.ts`. vinext runs server actions on any URL, so the proxy only lets through a sign-in post that carries no action. Keep it that way if you add public pages.
- **Running on Node**: `lib/node-env.ts` stands in for `cloudflare:workers` when you build with `--mode node`. It reads settings from the environment and handles the database calls with Node's built-in SQLite.
- **App logic**: training progression is in `lib/loads.ts` and `lib/program.ts`, nutrition targets in `lib/nutrition.ts`, meal planning in `lib/planner.ts`, and health markers and their ranges in `lib/markers.ts`.
- **Starter recipes**: `lib/seed-recipes.ts`, loaded when the recipe table is empty.
- **Commands**: `npm test` runs the tests. `npm run dev` runs the dev server on Cloudflare's runtime, and `npm run dev:node` runs it on Node.
- **Imports**: use relative imports (`../lib/db`), not `@/`. The `@/` alias breaks when the project sits on a mapped network drive.

## Not medical advice

Targets, ranges and training suggestions come from published guidelines and are meant for general fitness. Talk to your doctor about lab results, blood pressure or anything that worries you.

## License

[MIT](LICENSE)
