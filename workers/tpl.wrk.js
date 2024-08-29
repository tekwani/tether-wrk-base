'use strict'

const WrkBase = require('bfx-wrk-base')
const async = require('async')
const debug = require('debug')('wrk:proc')
const DHT = require('hyperdht')
const b4a = require('b4a')

class TplWrk extends WrkBase {
  init () {
    super.init()

    this.loadConf('common')

    this.setInitFacs([
      ['fac', 'hp-svc-facs-store', 's0', 's0', {
        storeDir: `store/${this.ctx.rack}`
      }, -5],
      ['fac', 'hp-svc-facs-net', 'r0', 'r0', () => {
        return {
          fac_store: this.store_s0
        }
      }, 0]
    ])
  }

  debug (data) {
    debug(`[THING/${this.rackId}]`, data)
  }

  getRpcKey () {
    return this.net_r0.rpcServer.publicKey
  }

  getConfigRpcKeyPair () {
    if (this.conf.rpc_private_key) {
      try {
        const seed = b4a.from(this.conf.rpc_private_key, 'hex')
        const keyPair = DHT.keyPair(seed)

        return keyPair
      } catch (e) {
        debug(`ERR_GEN_KEY_PAIR: ${e}`)
        return null
      }
    }

    return null
  }

  _start (cb) {
    async.series([
      next => { super._start(next) },
      async () => {
        const keyPair = this.getConfigRpcKeyPair()

        await this.net_r0.startRpcServer(keyPair)
        const rpcServer = this.net_r0.rpcServer

        rpcServer.respond('echo', x => x)

        this.status.rpcPublicKey = this.getRpcKey().toString('hex')

        this.saveStatus()
      }
    ], cb)
  }
}

module.exports = TplWrk
