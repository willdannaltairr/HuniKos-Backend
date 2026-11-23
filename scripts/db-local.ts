// Mengelola cluster PostgreSQL khusus HUNIKOS di dalam repo ini.
//
// Cluster ini terpisah dari instalasi PostgreSQL bawaan mesin (port 5432) dan dari
// cluster proyek lain (port 5433), supaya data aplikasi tidak menumpang di repo lain.
// Data disimpan di .pgdata/ (masuk .gitignore) dan auth-nya trust hanya untuk 127.0.0.1.
//
// Pemakaian: npm run db:local -- <init|start|stop|status>
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(here, '..')
const dataDir = path.join(rootDir, '.pgdata')
const logFile = path.join(dataDir, 'server.log')
const pgBin = process.env.PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin'
const port = process.env.HUNIKOS_DB_PORT ?? '5434'
const dbName = 'hunikos_test'

const exe = (name: string): string =>
  path.join(pgBin, process.platform === 'win32' ? `${name}.exe` : name)

const run = (name: string, args: string[]): void => {
  execFileSync(exe(name), args, { stdio: 'inherit' })
}

const isUp = (): boolean => {
  try {
    execFileSync(exe('pg_isready'), ['-q', '-h', '127.0.0.1', '-p', port], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const query = (sql: string): string => {
  try {
    return execFileSync(
      exe('psql'),
      ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-tAc', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// -w membuat pg_ctl menunggu sampai server siap, dan stdio 'ignore' mencegah
// pipe proses induk ikut tertutup saat perintah ini dijalankan dari skrip otomatis.
const startServer = (): void => {
  execFileSync(exe('pg_ctl'), ['-D', dataDir, '-l', logFile, '-o', `-p ${port}`, '-w', 'start'], {
    stdio: 'ignore',
  })
}

const ensureDatabase = (): void => {
  const exists = query(`SELECT 1 FROM pg_database WHERE datname='${dbName}'`)
  if (exists !== '1') {
    run('createdb', ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', dbName])
    console.log(`Database "${dbName}" dibuat.`)
  }
}

const action = process.argv[2] ?? 'status'

switch (action) {
  case 'init': {
    if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
      console.log('Membuat cluster PostgreSQL baru di', dataDir)
      run('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--locale=C'])
    }
    if (!isUp()) startServer()
    ensureDatabase()
    console.log(`Cluster siap. Server berjalan di 127.0.0.1:${port}.`)
    break
  }
  case 'start': {
    if (isUp()) {
      console.log(`Server sudah berjalan di 127.0.0.1:${port}.`)
    } else {
      startServer()
      console.log(`Server berjalan di 127.0.0.1:${port}.`)
    }
    break
  }
  case 'stop': {
    if (isUp()) {
      run('pg_ctl', ['-D', dataDir, '-m', 'fast', 'stop'])
      console.log('Server dihentikan.')
    } else {
      console.log('Server sedang tidak berjalan.')
    }
    break
  }
  case 'status': {
    console.log(isUp() ? `Server berjalan di 127.0.0.1:${port}.` : 'Server tidak berjalan.')
    break
  }
  default: {
    console.log('Pakai: npm run db:local -- <init|start|stop|status>')
    process.exit(1)
  }
}
