import {
  File,
  FileArchive,
  FileBraces,
  FileBox,
  FileCode,
  FileCog,
  FileDiff,
  FileDigit,
  FileImage,
  FileKey,
  FileLock,
  FileMusic,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideoCamera,
} from 'lucide-svelte'

// Exact filename matches (lowercased). Checked before extension map.
const NAME_MAP = {
  // Version control
  '.gitignore': FileCode,
  '.gitattributes': FileCode,
  '.gitmodules': FileCode,
  '.gitkeep': FileCode,

  // Shell / profile
  '.bashrc': FileTerminal,
  '.bash_profile': FileTerminal,
  '.bash_history': FileTerminal,
  '.zshrc': FileTerminal,
  '.zprofile': FileTerminal,
  '.zsh_history': FileTerminal,
  '.profile': FileTerminal,
  '.fishrc': FileTerminal,
  '.inputrc': FileTerminal,

  // Env files (prefix match handles .env.local etc. — see getFileIcon)
  '.env': FileLock,

  // Package managers / manifests
  'package.json': FileBox,
  'cargo.toml': FileBox,
  'gemfile': FileBox,
  'podfile': FileBox,
  'composer.json': FileBox,
  'go.mod': FileBox,
  'go.sum': FileLock,
  'requirements.txt': FileBox,
  'pipfile': FileBox,
  'pyproject.toml': FileBox,
  'setup.py': FileBox,
  'setup.cfg': FileBox,
  'pom.xml': FileBox,
  'build.gradle': FileBox,
  'build.gradle.kts': FileBox,

  // Lock files
  'package-lock.json': FileLock,
  'yarn.lock': FileLock,
  'pnpm-lock.yaml': FileLock,
  'bun.lockb': FileLock,
  'cargo.lock': FileLock,
  'gemfile.lock': FileLock,
  'podfile.lock': FileLock,
  'composer.lock': FileLock,
  'pipfile.lock': FileLock,

  // TypeScript / JS config
  'tsconfig.json': FileCog,
  'jsconfig.json': FileCog,
  '.nvmrc': FileCog,
  '.npmrc': FileCog,
  '.yarnrc': FileCog,
  '.yarnrc.yml': FileCog,
  '.node-version': FileCog,

  // Linting / formatting
  '.eslintrc': FileCog,
  '.eslintrc.json': FileCog,
  '.eslintrc.js': FileCog,
  '.eslintrc.cjs': FileCog,
  '.eslintignore': FileCog,
  '.prettierrc': FileCog,
  '.prettierrc.json': FileCog,
  '.prettierrc.js': FileCog,
  '.prettierignore': FileCog,
  '.editorconfig': FileCog,
  '.stylelintrc': FileCog,

  // Bundler config (prefix match handles vite.config.ts etc.)
  '.babelrc': FileCog,
  '.babelrc.js': FileCog,
  '.babelrc.json': FileCog,

  // CI/CD
  '.travis.yml': FileCog,
  'circle.yml': FileCog,

  // Other project files
  '.htaccess': FileCog,
  'procfile': FileTerminal,
  'vagrantfile': FileCog,

  // Docs
  'readme': FileText,
  'changelog': FileText,
  'license': FileText,
  'licence': FileText,
  'copying': FileText,
  'authors': FileText,
  'contributors': FileText,
  'contributing': FileText,
  'security': FileText,
  'codeowners': FileText,
}

// Extension map (last extension, lowercased). Fallback after name map.
const EXT_MAP = {
  // JavaScript / TypeScript
  js: FileCode, mjs: FileCode, cjs: FileCode,
  ts: FileCode,
  jsx: FileCode, tsx: FileCode,
  vue: FileCode, svelte: FileCode, astro: FileCode,
  liquid: FileCode, ejs: FileCode, pug: FileCode, hbs: FileCode, mustache: FileCode, njk: FileCode,

  // Web / styling
  html: FileCode, htm: FileCode, xhtml: FileCode,
  css: FileCode, scss: FileCode, sass: FileCode, less: FileCode, styl: FileCode, stylus: FileCode,

  // Systems / compiled languages
  c: FileCode, h: FileCode,
  cpp: FileCode, cc: FileCode, cxx: FileCode, hpp: FileCode, hxx: FileCode,
  rs: FileCode,
  go: FileCode,
  swift: FileCode,
  m: FileCode, mm: FileCode,
  zig: FileCode,
  v: FileCode,

  // JVM
  java: FileCode, kt: FileCode, kts: FileCode,
  scala: FileCode, groovy: FileCode, clj: FileCode, cljs: FileCode, cljc: FileCode,

  // .NET / ML
  cs: FileCode, fs: FileCode, fsx: FileCode, fsi: FileCode,
  vb: FileCode,
  ml: FileCode, mli: FileCode,

  // Scripting
  py: FileCode, pyw: FileCode, pyi: FileCode,
  rb: FileCode, erb: FileCode, rake: FileCode,
  php: FileCode, phtml: FileCode,
  lua: FileCode,
  r: FileCode,
  jl: FileCode,
  dart: FileCode,
  ex: FileCode, exs: FileCode,
  erl: FileCode, hrl: FileCode,
  hs: FileCode, lhs: FileCode,
  elm: FileCode,
  nim: FileCode,
  cr: FileCode,
  sol: FileCode,

  // Shell
  sh: FileTerminal, bash: FileTerminal, zsh: FileTerminal, fish: FileTerminal, ksh: FileTerminal, csh: FileTerminal,
  ps1: FileTerminal, psm1: FileTerminal, psd1: FileTerminal,
  bat: FileTerminal, cmd: FileTerminal,

  // Data / config
  json: FileBraces, jsonc: FileBraces, json5: FileBraces,
  yaml: FileBraces, yml: FileBraces,
  toml: FileBraces,
  xml: FileBraces, xsd: FileBraces, xsl: FileBraces, xslt: FileBraces, svg: FileImage,
  ini: FileCog, cfg: FileCog, conf: FileCog,
  lock: FileLock,
  env: FileLock,
  sql: FileBraces, sqlite: FileBraces, db: FileBraces,

  // Docs / text
  txt: FileText, log: FileText,
  md: FileText, mdx: FileText, markdown: FileText,
  rst: FileText, adoc: FileText, asciidoc: FileText,
  tex: FileText, latex: FileText, bib: FileText,
  rtf: FileText,
  doc: FileText, docx: FileText, odt: FileText, ott: FileText,
  pdf: FileText,
  ppt: FileText, pptx: FileText, odp: FileText,

  // Spreadsheets
  csv: FileSpreadsheet, tsv: FileSpreadsheet,
  xlsx: FileSpreadsheet, xls: FileSpreadsheet, xlsm: FileSpreadsheet,
  ods: FileSpreadsheet, ots: FileSpreadsheet,

  // Images (note: svg handled above under xml section)
  png: FileImage, jpg: FileImage, jpeg: FileImage, jfif: FileImage,
  gif: FileImage, webp: FileImage,
  bmp: FileImage, ico: FileImage,
  tiff: FileImage, tif: FileImage,
  avif: FileImage, heic: FileImage, heif: FileImage,
  psd: FileImage, ai: FileImage, eps: FileImage,
  xcf: FileImage, sketch: FileImage, fig: FileImage,
  raw: FileImage, cr2: FileImage, nef: FileImage, arw: FileImage, dng: FileImage,

  // Audio
  mp3: FileMusic, flac: FileMusic, wav: FileMusic,
  ogg: FileMusic, oga: FileMusic,
  aac: FileMusic, m4a: FileMusic,
  opus: FileMusic, wma: FileMusic,
  aiff: FileMusic, aif: FileMusic,
  mid: FileMusic, midi: FileMusic,

  // Video
  mp4: FileVideoCamera, m4v: FileVideoCamera,
  mkv: FileVideoCamera, avi: FileVideoCamera,
  mov: FileVideoCamera, wmv: FileVideoCamera,
  webm: FileVideoCamera, flv: FileVideoCamera,
  ogv: FileVideoCamera, '3gp': FileVideoCamera, '3g2': FileVideoCamera,
  mpeg: FileVideoCamera, mpg: FileVideoCamera,

  // Archives
  zip: FileArchive, tar: FileArchive,
  gz: FileArchive, gzip: FileArchive,
  bz2: FileArchive, bzip2: FileArchive,
  xz: FileArchive, zst: FileArchive, zstd: FileArchive,
  '7z': FileArchive, rar: FileArchive,
  deb: FileArchive, rpm: FileArchive,
  iso: FileArchive, dmg: FileArchive, img: FileArchive,
  jar: FileArchive, war: FileArchive, ear: FileArchive,
  apk: FileArchive, ipa: FileArchive,

  // Executables (stage 1: generic box — see app icons roadmap for stages 2+3)
  exe: FileBox, msi: FileBox, appimage: FileBox,

  // Keys / certs
  pem: FileKey, key: FileKey,
  crt: FileKey, cer: FileKey, cert: FileKey,
  p12: FileKey, pfx: FileKey,
  gpg: FileKey, asc: FileKey, pub: FileKey,
  ppk: FileKey,

  // Diffs
  diff: FileDiff, patch: FileDiff,

  // Fonts
  ttf: FileType, otf: FileType,
  woff: FileType, woff2: FileType, eot: FileType,

  // Binary / compiled
  wasm: FileDigit,
  bin: FileDigit, hex: FileDigit,
  o: FileDigit, so: FileDigit, dll: FileDigit, dylib: FileDigit, lib: FileDigit, a: FileDigit,
  class: FileDigit, pyc: FileDigit,

  // Source maps
  map: FileCode,
}

export function getFileIcon(name) {
  const lower = name.toLowerCase()

  const byName = NAME_MAP[lower]
  if (byName) return byName

  // Prefix patterns for families of names
  if (lower.startsWith('.env')) return FileLock
  if (lower.startsWith('dockerfile')) return FileBox
  if (lower.startsWith('docker-compose')) return FileCog
  if (lower.startsWith('babel.config')) return FileCog
  if (lower.startsWith('jest.config')) return FileCode
  if (lower.startsWith('vitest.config')) return FileCode
  if (lower.startsWith('vite.config')) return FileCog
  if (lower.startsWith('webpack.config')) return FileCog
  if (lower.startsWith('rollup.config')) return FileCog
  if (lower.startsWith('svelte.config')) return FileCog
  if (lower.startsWith('astro.config')) return FileCog
  if (lower.startsWith('next.config')) return FileCog
  if (lower.startsWith('nuxt.config')) return FileCog
  if (lower.startsWith('tailwind.config')) return FileCog
  if (lower.startsWith('postcss.config')) return FileCog
  if (lower.startsWith('eslint.config')) return FileCog

  const ext = lower.includes('.') ? lower.split('.').pop() : ''
  return EXT_MAP[ext] ?? File
}
