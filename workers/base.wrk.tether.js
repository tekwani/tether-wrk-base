'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const crypto = require('crypto')

class TetherWrkBase extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')
    const storeDir = (this.ctx.env === 'test' && this.ctx.tmpdir)
      ? `${this.ctx.tmpdir}/store/${this.storeDir || this.ctx.rack}`
      : `store/${this.storeDir || this.ctx.rack}`

    const name = this.getInstanceId()
    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', { storeDir }, 0],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => ({ fac_store: this.store_s0 }), 1],
      ['fac', 'svc-facs-logging', 'l0', 'l0', { name }, 2]
    ])
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  getRpcClientKey () {
    return this.net_r0.rpcServer.dht.defaultKeyPair.publicKey
  }

  getInstanceId () {
    if (!this.status.instanceId) {
      this.status.instanceId = `${this.prefix}-${crypto.randomUUID()}`
      this.saveStatus()
    }
    return this.status.instanceId
  }

  async addStoreForDataSync (store, discoveryKey = null, useBaseSwarm = false) {
    if (!store) throw new Error('ERR_INVALID_STORE')

    let swarm
    if (useBaseSwarm) {
      await this.net_r0.startSwarm()
      swarm = this.net_r0.swarm
    } else {
      swarm = await this.net_r0.createNewSwarm('backupSwarm')
    }

    this.swarmDiscovery = swarm.join(discoveryKey || this.getRpcKey())
    swarm.on('connection', (connection) => {
      this.logger.info('Swarm: Peer connected')
      store.replicate(connection)
    })
  }

  getDbMeta () {
    // override to return array of cores' name, key, keyEncoding
    return []
  }

  async _startRpcServer () {
    await this.net_r0.startRpcServer()
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        this.logger = this.logging_l0.logger

        await this._startRpcServer()
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('ping', x => x)
        rpcServer.respond('getInstanceId', (req) => this.net_r0.handleReply('getInstanceId', req))
        rpcServer.respond('getDbMeta', async (req) => {
          return await this.net_r0.handleReply('getDbMeta', req)
        })

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')
        this.status.rpcClientKey = this.getRpcClientKey().toString('hex')

        this.saveStatus()
      }
    ], cb)
  }

  _stop (cb) {
    async.series([
      next => { super._stop(next) },
      async () => {
        if (this.swarmDiscovery) await this.swarmDiscovery.destroy()
      }
    ], cb)
  }
}

module.exports = TetherWrkBase
