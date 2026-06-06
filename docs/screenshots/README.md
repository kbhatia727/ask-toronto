# Screenshots

The main `README.md` embeds two images from this folder. Add them here with these
exact names so they render automatically:

| File | What to capture |
|---|---|
| `answer.png` | Ask *"Where are the dirtiest restaurants?"* — the reply with the map of restaurants and the source-attribution chips (dataset, rows, live/cached, CKAN id). |
| `crime.png` | Ask *"Which neighbourhood had the most break-ins in 2024?"* — the confidence badge, ranked bar chart, and the crime choropleth map. |

## How to capture (Windows)
1. Run the app: `docker compose up -d` then `npm run dev`, open http://localhost:3000
2. Ask a question and wait for the chart/map to render.
3. Press **Win + Shift + S**, select the area, and save the image.
4. Save it into this folder as `answer.png` (and `error.png`).

Optional extras you can add and reference in the README:
- `map.png` — a close-up of the crime choropleth map.
- `restaurants.png` — the Dinesafe map of inspected restaurants.
