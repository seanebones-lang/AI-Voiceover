#!/usr/bin/env node
/**
 * Sync env vars to Railway via GraphQL API.
 * Usage: set RAILWAY_TOKEN, RAILWAY_PROJECT_ID, RAILWAY_ENVIRONMENT_ID, RAILWAY_SERVICE_ID,
 *        then any vars you want to upsert (e.g. CLERK_SECRET_KEY, DATABASE_URL, NODE_ENV).
 * Example: RAILWAY_TOKEN=xxx RAILWAY_PROJECT_ID=xxx RAILWAY_ENVIRONMENT_ID=xxx RAILWAY_SERVICE_ID=xxx CLERK_SECRET_KEY=sk_test_xxx DATABASE_URL=postgres://... REDIS_URL=redis://... node scripts/railway-sync-vars.js
 */
const endpoint = 'https://backboard.railway.com/graphql/v2'
const token = process.env.RAILWAY_TOKEN
const projectId = process.env.RAILWAY_PROJECT_ID
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID
const serviceId = process.env.RAILWAY_SERVICE_ID

const varKeys = [
  'NODE_ENV',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SIGNING_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'XTTS_URL',
  'DIAGNOSTIC_SECRET',
  'API_ROUTE_SECRET',
  'ALLOWED_EMAILS',
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
