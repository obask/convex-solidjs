import { defineConfig } from 'vite-plus/pack'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: 'esm',
  dts: true,
  clean: true,
  platform: 'neutral',
  target: 'esnext',
  deps: {
    neverBundle: ['solid-js', '@solidjs/web', '@solidjs/signals', 'convex'],
  },
  plugins: [
    solidPlugin({
      hot: false,
      solid: { generate: 'dom' },
    }),
  ],
})
