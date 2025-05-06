'use strict'

const Worker = require('../workers/base.wrk.tether.js')
const path = require('path')
const tmp = require('test-tmp')
const { test, hook } = require('brittle')
const fsp = require('fs').promises
const RPC = require('@hyperswarm/rpc')

let wrk = null
let rpc = null

async function rpcReq (pubKey, met, data) {
  const buf = Buffer.from(JSON.stringify(data))
  const rep = await rpc.request(pubKey, met, buf)

  return JSON.parse(rep.toString())
}

async function processConfigFiles (dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      await processConfigFiles(fullPath)
    } else if (entry.isFile() && entry.name.endsWith('.example')) {
      const newFilePath = fullPath.replace('.example', '')
      await fsp.rename(fullPath, newFilePath)
      console.log(`Renamed: ${fullPath} -> ${newFilePath}`)
    }
  }
}

hook('setup hook', async function (t) {
  const dir = await tmp(t)
  rpc = new RPC()

  const sourceConfigPath = path.resolve(__dirname, '../config')
  const destinationConfigPath = path.join(dir, 'config')

  try {
    await fsp.access(sourceConfigPath)
    await fsp.cp(sourceConfigPath, destinationConfigPath, { recursive: true })
    console.log(`Copied config folder to: ${destinationConfigPath}`)
    await processConfigFiles(destinationConfigPath)
  } catch (err) {
    console.error('Config folder does not exist or cannot be accessed!')
  }

  wrk = new Worker(
    {},
    { env: 'test', root: path.resolve(dir, '.'), wtype: 'tether-wrk-base' }
  )
  wrk.init()

  await new Promise((resolve) => wrk.start(resolve))
})

test('worker test', async function (t) {
  const pubKey = wrk.getRpcKey()

  const resp = await rpcReq(pubKey, 'ping', 'hello world')
  console.log(resp)
  t.is(resp, 'hello world')

  console.log('rpc call - ping - done')
})

hook('teardown hook', async function (t) {
  await new Promise((resolve) => wrk.stop(resolve))
  await rpc.destroy()
})
