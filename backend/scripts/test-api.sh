#!/bin/bash

# Login and get token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e-sales1@test.com","password":"test123"}' \
  | jq -r '.data.token')

echo "Token: ${TOKEN:0:30}..."

# Test leads API
echo "Testing /api/leads..."
curl -s "http://localhost:3000/api/leads?page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" | jq '.'
