import type { ServerConfig, ServerDatabaseEntry } from '../types/server'
import path from 'path'
import type { Express } from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import net from 'net'
import { errnoCode, errorMessage } from '../types/websockets'
import { getBestLocalIp, getAllIps } from './network'
import { isLanAccessEnabled, syncNetworkConfig } from './lanAccess'
import { saveConfigFile } from './configFile'
import { FIXED_PORT } from './ports'
import { getBindHostForServer } from './constants'
import packageJson from '../../package.json'

interface ServerStarterOptions {
  app: Express
  config: ServerConfig
  configPath: string
  databasesPath: string
}

function showSystemNotification(title: string, message: string) {
  const isElectron = process.versions.electron

  if (isElectron) {
    try {
      const {dialog} = require('electron')
      dialog.showErrorBox(title, message)
    } catch (err: unknown) {
      console.error('Failed to show system dialog:', err)
      console.error(`\x1b[31m${title}: ${message}\x1b[0m`)
    }
  } else {
    console.error('\n' + '='.repeat(70))
    console.error('\x1b[41m\x1b[37m%s\x1b[0m', ` ${title} `)
    console.error('\x1b[31m%s\x1b[0m', message)
    console.error('='.repeat(70) + '\n')

    console.log('\x1b[33m%s\x1b[0m', '💡 Possible solutions:')
    console.log('\x1b[33m%s\x1b[0m', `   1. Close other applications using port ${FIXED_PORT}`)
    console.log('\x1b[33m%s\x1b[0m', `   2. Find the process using the port: lsof -i :${FIXED_PORT}`)
    console.log('\x1b[33m%s\x1b[0m', `   3. Kill the process: kill -9 <PID>`)
    console.log('\x1b[33m%s\x1b[0m', '   4. Restart your computer')
  }
}

function isPortInUse(port: number, bindHost: string) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err: unknown) => {
        if (errnoCode(err) === 'EADDRINUSE') {
          resolve(true)
        } else {
          resolve(false)
        }
      })
      .once('listening', () => {
        tester.once('close', () => {
          resolve(false)
        }).close()
      })
      .listen(port, bindHost)
  })
}

function createServerStarter({app, config, configPath, databasesPath}: ServerStarterOptions) {
  let listener: Server | undefined

  const writeRuntimeConfig = (actualPort: number) => {
    syncNetworkConfig(config, isLanAccessEnabled(), {getBestLocalIp, getAllIps})
    config.port = actualPort

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    if (activeDb) {
      config.path = path.join(databasesPath, activeDb.id)
    }

    saveConfigFile(configPath, config)
    config.appVersion = packageJson.version
    process.server_config = config
  }

  const logServerStarted = (actualPort: number) => {
    const lanEnabled = isLanAccessEnabled()

    console.log('\x1b[32m%s\x1b[0m', '✅ Server started successfully!')
    console.log('='.repeat(70))

    console.log('\x1b[36m%s\x1b[0m', '📊 Server information:')
    console.log('\x1b[36m%s\x1b[0m', `   • Host:            ${config.hostname}`)
    console.log('\x1b[36m%s\x1b[0m', `   • Port:            ${actualPort}`)
    console.log('\x1b[36m%s\x1b[0m', `   • Primary IP:      ${config.ip}`)
    console.log('\x1b[36m%s\x1b[0m', `   • All IPs:         ${(config.ips ?? []).join(', ')}`)
    console.log('\x1b[36m%s\x1b[0m', `   • Version:         ${packageJson.version}`)

    const activeDb = config.databases.find((dbEntry: ServerDatabaseEntry) => dbEntry.active)
    if (activeDb) {
      console.log('\x1b[36m%s\x1b[0m', `   • Active database: ${activeDb.name} (${activeDb.id})`)
    }

    console.log('\n\x1b[36m%s\x1b[0m', '🌐 Available addresses:')
    console.log('\x1b[36m%s\x1b[0m', '   1. Local machine:')
    console.log('\x1b[36m%s\x1b[0m', `      → http://localhost:${actualPort}`)
    console.log('\x1b[36m%s\x1b[0m', `      → http://127.0.0.1:${actualPort}`)

    if (lanEnabled && config.ips && config.ips.length > 0) {
      console.log('\x1b[36m%s\x1b[0m', '   2. Local network:')
      config.ips.forEach((ip: string, index: number) => {
        const iface = getAllIps()[index]?.interface || 'interface'
        console.log('\x1b[36m%s\x1b[0m', `      → http://${ip}:${actualPort} (${iface})`)
      })
    } else {
      console.log('\x1b[36m%s\x1b[0m', '   2. Local network: disabled in app settings')
    }

    console.log('\n\x1b[36m%s\x1b[0m', '🔧 API Endpoints:')
    console.log('\x1b[36m%s\x1b[0m', `   • Health check:   http://localhost:${actualPort}/api/health`)
    console.log('\x1b[36m%s\x1b[0m', `   • Server config:  http://localhost:${actualPort}/api/config`)
    console.log('\x1b[36m%s\x1b[0m', `   • Get file:       http://localhost:${actualPort}/api/get-file`)

    console.log('\n\x1b[7m%s\x1b[0m', `✨ Open in browser: http://localhost:${actualPort}`)
    console.log('='.repeat(70))
  }

  const attachListener = (bindHost: string, portToUse: number, verbose: boolean) => {
    return new Promise<void>((resolve, reject) => {
      listener = app.listen(portToUse, bindHost, () => {
        const address = listener?.address()
        const actualPort = typeof address === 'object' && address
          ? (address as AddressInfo).port
          : portToUse

        writeRuntimeConfig(actualPort)
        if (verbose) {
          logServerStarted(actualPort)
        } else {
          console.log('\x1b[32m%s\x1b[0m', `✅ Network access updated (${bindHost}:${actualPort})`)
        }
        resolve()
      })

      listener.on('error', (err: unknown) => {
        reject(err)
      })
    })
  }

  const startServer = async () => {
    const portToUse = FIXED_PORT
    const bindHost = getBindHostForServer()
    const portBusy = await isPortInUse(portToUse, bindHost)

    if (portBusy) {
      const errorTitle = 'Application startup error'
      const errorMessage = `Port ${portToUse} is already in use by another application.\n\nPlease close other applications using this port and restart the application.`

      showSystemNotification(errorTitle, errorMessage)
      process.exit(1)
      return
    }

    console.log('\n' + '='.repeat(70))
    console.log('\x1b[33m%s\x1b[0m', `🚀 Starting server on ${bindHost}:${portToUse}...`)

    try {
      await attachListener(bindHost, portToUse, true)
    } catch (err: unknown) {
      if (errnoCode(err) === 'EADDRINUSE') {
        const errorTitle = 'Application startup error'
        const errorMessage = `Port ${portToUse} is already in use by another application.\n\nPlease close other applications using this port and restart the application.`

        console.log('\x1b[31m%s\x1b[0m', `❌ Port ${portToUse} is already in use!`)
        showSystemNotification(errorTitle, errorMessage)
        process.exit(1)
      } else {
        console.log('\x1b[31m%s\x1b[0m', '❌ Server error:', err)
        showSystemNotification('Server error', errorMessage(err))
        process.exit(1)
      }
    }
  }

  const restartNetworkListener = async () => {
    const portToUse = FIXED_PORT
    const bindHost = getBindHostForServer()

    if (listener) {
      await new Promise<void>((resolve, reject) => {
        listener!.close((err) => (err ? reject(err) : resolve()))
      })
      listener = undefined
    }

    await attachListener(bindHost, portToUse, false)
  }

  const bindShutdownHandler = () => {
    process.on('SIGINT', () => {
      console.log('\n\x1b[33m%s\x1b[0m', '🛑 Stopping server...')
      if (listener) {
        listener.close(() => {
          console.log('\x1b[32m%s\x1b[0m', '✅ Server stopped')
          process.exit(0)
        })
      } else {
        process.exit(0)
      }
    })
  }

  return {
    startServer,
    restartNetworkListener,
    bindShutdownHandler,
    getListener: () => listener,
  }
}

export { createServerStarter, showSystemNotification, isPortInUse }
