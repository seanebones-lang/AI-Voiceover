#!/usr/bin/env node
/**
 * Sync env vars to Railway via GraphQL API.
 * Usage: set RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID,
 *        then any vars you want to upsert (e.g. NEXTAUTH_SECRET, NEXTAUTH_URL, NODE_ENV).
 * Example: RAILWAY_TOKEN=xxx RAILWAY_PROJECT_ID=xxx RAILWAY_ENVIRONMENT_ID=xxx RAILWAY_SERVICE_ID=xxx NEXTAUTH_SECRET=secret NEXTAUTH_URL=https://app.up.railway.app node scripts/railway-sync-vars.js
 */
const endpoint = 'https://backboard.railway.com/graphql/v2'
const token = process.env.RAILWAY_TOKEN
const projectId = process.env.RAILWAY_PROJECT_ID
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID
const serviceId = process.env.RAILWAY_SERVICE_ID

const varKeys = [
  'NODE_ENV',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'XAI_API_KEY',
  'XTTS_URL',
  'TTS_V2_URL',
  'RAG_API_URL',
  'ALLOWED_ORIGINS',
]

if (!token || !projectId || !environmentId || !serviceId) {
  console.error('Set RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID')
  process.exit(1)
}

const variables = {}
for (const key of varKeys) {
  const v = process.env[key]
  if (v !== undefined && v !== '') variables[key] = v
}
if (Object.keys(variables).length === 0) {
  console.error('Set at least one of:', varKeys.join(', '))
  process.exit(1)
}

const query = `
  mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
    variableCollectionUpsert(input: $input)
  }
`
const body = {
  query,
  variables: {
    input: {
      projectId,
      environmentId,
      serviceId,
      variables,
      replace: false,
    },
  },
}

fetch(endpoint, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
})
  .then((r) => r.json())
  .then((data) => {
    if (data.errors) {
      console.error('API errors:', JSON.stringify(data.errors, null, 2))
      process.exit(1)
    }
    console.log('Variables upserted:', Object.keys(variables).join(', '))
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
