import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        game: resolve(__dirname, "game.html"),
        leaderboard: resolve(__dirname, "leaderboard.html"),
      },
    },
  },
});