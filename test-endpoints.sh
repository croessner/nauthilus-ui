#!/bin/bash

# Test script to verify that both frontend and proxy endpoints are working correctly

echo "Testing frontend endpoint..."
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/

echo "Testing proxy endpoint..."
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/proxy/ping?url=http://example.com

echo "Test complete."
