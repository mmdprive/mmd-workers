# Webflow export drop folder

Place your latest Webflow code export ZIP at:

- `exports/latest.zip`

Then commit and push that ZIP. GitHub Actions (`.github/workflows/webflow-sync.yml`) will unpack and sync it into `site/`.
