# Screenshots

The main `README.md` embeds two images from this folder. Add them here with these
exact names so they render automatically:

| File | What to capture |
|---|---|
| `answer.png` | Ask *"Which neighbourhood had the most break-ins in 2024?"* and screenshot the reply — the confidence badge, bar chart, crime choropleth map, and source-attribution chips all in one shot. |
| `error.png` | The red "Daily request limit reached" / error banner (or any clear error state). |

## How to capture (Windows)
1. Run the app: `docker compose up -d` then `npm run dev`, open http://localhost:3000
2. Ask a question and wait for the chart/map to render.
3. Press **Win + Shift + S**, select the area, and save the image.
4. Save it into this folder as `answer.png` (and `error.png`).

Optional extras you can add and reference in the README:
- `map.png` — a close-up of the crime choropleth map.
- `restaurants.png` — the Dinesafe map of inspected restaurants.
