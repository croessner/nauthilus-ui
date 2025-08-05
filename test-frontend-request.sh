#!/bin/bash

# Test script to simulate the frontend request that was failing
# This simulates the request from BruteForceConfig.tsx that was failing with CORS errors

echo "Testing the exact request that was failing with CORS errors..."
echo "Full response headers for preflight OPTIONS request:"
curl -v -X OPTIONS -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:3002/proxy/ping?url=https://login.authserv.me 2>&1 | grep -i "< "

echo ""
echo "Full response headers for actual GET request:"
curl -v -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  http://localhost:3002/proxy/ping?url=https://login.authserv.me 2>&1 | grep -i "< "

echo ""
echo "Test complete."
