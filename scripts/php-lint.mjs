// Lint nhanh index.php + config.php bằng php-parser (NPM) — checks syntax errors.
import Engine from 'php-parser'
import fs from 'fs'

const engine = new Engine({ parser: { extractDoc: false, suppressErrors: false }, ast: { withPositions: false } })
const files = process.argv.slice(2)
for (const f of files) {
  try {
    engine.parseCode(fs.readFileSync(f, 'utf8'), f)
    console.log(f, 'OK')
  } catch (e) {
    console.log(f, 'SYNTAX ERROR:', e.message?.slice(0, 200))
  }
}
