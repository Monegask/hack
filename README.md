# Supply Line · Линия снабжения

A browser logistics game: build mines and factories, manage trucks and fuel, and deliver **12 iron, 6 copper, and 8 asphalt** to the shared hub before the bot.

## Try the game

Open the deployed site and choose **«Пройти обучение»** for the interactive tutorial or **«Играть против бота»** for a race. The current interface is in Russian and designed primarily for desktop browsers with WebGL. No wallet or installation is needed.

The tutorial introduces building supplies, crews, production, and hauling. The race uses one shared map and hub with separate inventories for the player and bot. Race progress is not saved; reloading starts a new session.

## Run locally

Requires Node.js 24 and npm.

```sh
npm ci --prefix prototypes/logistics-race/threejs-trial --include=dev
npm run build
npm test
npm start
```

Open http://127.0.0.1:4186. Choose the tutorial, send building materials and then a crew to the iron mine, and haul its output back to the city. In the race, deliver the hub order before the bot.

The build also creates `exports/logistics-game.html`: a portable, self-contained game that can be opened without an internet connection.

## Deploy and update on Vercel

Import this GitHub repository into Vercel. Use the repository root and the **Other** framework preset. `vercel.json` defines dependency installation, the build command, and the `public` output directory. No environment variables are required for the current browser-only version.

Set `main` as the production branch. A push to `main` triggers a new production build; other branches can be used for preview deployments. Publish source changes rather than manually editing generated HTML.

## Implementation and NEAR status

- The economy and browser interface are in `prototypes/logistics-race/dist/`.
- The Three.js scene and procedural models are in `prototypes/logistics-race/game-3d/` and `threejs-trial/src/`.
- `share/build-share.cjs` combines the tutorial and race into one page.
- The published game currently runs in the browser. Wallet connection, on-chain entry fees, and human PvP are **not implemented** in this release. A separate NEAR escrow project exists in the development workspace; it is not part of this first web release.
- Adding the NEAR client interface can use the same website. Contract deployment and a future authoritative PvP server have separate deployment lifecycles.

## Dependencies and assets

Three.js 0.184.0 and esbuild 0.25.12 are pinned in the dependency lockfile. Their licenses remain with their authors. Local game assets include Mint-generated models, AI-generated illustrations and textures, and procedural geometry; the model registry is `mint-assets.json`. AI-assisted code is used throughout the prototype. The project was developed before this initial GitHub publication; the first commit is an import of the existing working prototype, not its original development date.

No private keys or account credentials are required to build or play this release. Project code and original assets are reserved to their respective owners; see `LICENSE`.
