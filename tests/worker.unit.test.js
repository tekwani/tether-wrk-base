'use strict'

const fs = require('fs')
const path = require('path')
const { setupHook, teardownHook } = require('./lib/hooks.js')
const { test, hook } = require('brittle')

let wrk = null
let rpc = null

hook('setup hook', async function (t) {
  ({ wrk, rpc } = await setupHook(t))
})

test('rpc public key and client key test', async function (t) {
  const pubKey = wrk.getRpcKey()
  const clientKey = wrk.getRpcClientKey()

  if (pubKey) {
    t.pass()
  } else {
    t.fail()
  }

  if (clientKey) {
    t.pass()
  } else {
    t.fail()
  }
})

test('instance id test', async function (t) {
  const statusPath = path.join(wrk.ctx.root, 'status', `${wrk.prefix}.json`)

  // getInstanceId is called during init, so it is already set
  const firstCallId = wrk.getInstanceId()
  t.ok(/^tether-wrk-base-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(firstCallId))

  const secondCallId = wrk.getInstanceId()
  t.is(secondCallId, firstCallId)

  const fileInstanceId = JSON.parse(fs.readFileSync(statusPath, 'utf-8')).instanceId
  t.is(fileInstanceId, firstCallId)
})

hook('teardown hook', async function (t) {
  await teardownHook(wrk, rpc)
})

test('addStoreForDataSync: starts swarm, joins discovery and replicates on connection', async function (t) {
  let startSwarmCalled = 0
  const joinCalls = []
  let onConnectionHandler = null

  wrk.logger = { info: () => {} }
  wrk.net_r0 = {
    async startSwarm () {
      startSwarmCalled++
      if (!this.swarm) {
        this.swarm = {
          join: (key) => { joinCalls.push(key); return { async destroy () {} } },
          on: (event, handler) => { if (event === 'connection') onConnectionHandler = handler }
        }
      }
    },
    swarm: null
  }

  const store = { replicateCalls: [], replicate (conn) { this.replicateCalls.push(conn) } }
  const discoveryKey = Buffer.from('discovery-key')

  await wrk.addStoreForDataSync(store, discoveryKey)

  t.is(startSwarmCalled, 1)
  t.is(joinCalls.length, 1)
  t.is(joinCalls[0], discoveryKey)
  t.ok(typeof onConnectionHandler === 'function')

  const fakeConn = { id: 1 }
  onConnectionHandler(fakeConn)
  t.is(store.replicateCalls.length, 1)
  t.is(store.replicateCalls[0], fakeConn)
})
