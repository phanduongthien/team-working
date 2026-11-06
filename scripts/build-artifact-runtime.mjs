// Đóng gói phần chạy bên trong iframe artifact + thư viện (Chart.js, Mermaid) vào out/artifact-runtime.
// App nạp chúng từ mmc-artifact://lib/… — không bao giờ tải từ CDN.
import { build } from 'esbuild'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out', 'artifact-runtime')
mkdirSync(out, { recursive: true })

await build({
  entryPoints: [join(root, 'src', 'artifact-runtime', 'runtime.ts')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'chrome130',
  outfile: join(out, 'runtime.js'),
  alias: { '@shared': join(root, 'src', 'shared') },
  logLevel: 'warning'
})
copyFileSync(join(root, 'src', 'artifact-runtime', 'runtime.css'), join(out, 'runtime.css'))
copyFileSync(
  join(root, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'),
  join(out, 'chart.umd.js')
)
copyFileSync(
  join(root, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js'),
  join(out, 'mermaid.min.js')
)
console.log('artifact-runtime → out/artifact-runtime')
