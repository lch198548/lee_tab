import { getKV, jsonResponse } from '../_lib/kv.js'

export async function onRequestGet({ env }) {
  const kv = getKV(env)
  return jsonResponse({
    ok: true,
    kvBound: !!kv,
    time: Date.now()
  })
}
