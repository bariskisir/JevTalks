import { Buffer } from 'node:buffer'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import jevApi from './api/jev.ts'

function localApi(): Plugin {
  return {
    name: 'local-jev-api',
    configureServer(server) {
      server.middlewares.use('/api/jev', async (request, response) => {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of request) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }

          const method = request.method ?? 'GET'
          const headers = new Headers()
          if (request.headers['content-type']) {
            headers.set('content-type', request.headers['content-type'])
          }

          const result = await jevApi.fetch(
            new Request('http://localhost/api/jev', {
              method,
              headers,
              body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
            }),
          )

          response.statusCode = result.status
          result.headers.forEach((value, name) => response.setHeader(name, value))
          response.end(Buffer.from(await result.arrayBuffer()))
        } catch {
          response.statusCode = 500
          response.end('Local API request failed.')
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (!process.env.TYPESAFE_AI_KEY && env.TYPESAFE_AI_KEY) {
    process.env.TYPESAFE_AI_KEY = env.TYPESAFE_AI_KEY
  }

  return {
    plugins: [react(), localApi()],
  }
})
