#!/bin/bash

# Test script to verify CORS headers are correctly set

echo "Testing CORS headers for proxy endpoint..."
echo "Full response headers:"
curl -v -H "Origin: http://localhost:3000" http://localhost:3002/proxy/ping?url=http://example.com 2>&1 | grep -i "< "

echo ""
echo "Testing OPTIONS preflight request directly to our server..."
echo "Full response headers:"
curl -v -X OPTIONS -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: Content-Type" http://localhost:3002/proxy/ping 2>&1 | grep -i "< "

echo ""
echo "Testing direct access to server root to check if server is responding..."
curl -v http://localhost:3002/ 2>&1 | grep -i "< "

echo ""
echo "Test complete."
