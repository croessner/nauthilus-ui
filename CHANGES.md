# Brute Force Protection TTL and Attempts Display Fix

## Problem
In the Brute Force Protection Management interface, the TTL (Time-To-Live) and attempts values for blocked IP addresses were always displaying as 0, regardless of the actual configuration values.

```
77.92.153.0/24
Rule: b_1h_ipv4_24
TTL: 0 seconds | Attempts: 0
```

## Solution
We implemented a fix to correctly display the TTL and attempts values by:

1. **Added a helper function to convert time periods to seconds**: Created a `convertPeriodToSeconds` function that converts time period strings (like "1h", "30m") to seconds.

2. **Lookup rule configuration**: Modified the code to look up the matching bucket configuration in the brute force settings based on the rule name.

3. **Extract TTL and attempts values**: Used the period setting to calculate the TTL in seconds and the failed_requests setting for the attempts value.

## Changes Made
1. Added a helper function `convertPeriodToSeconds` to convert time period strings to seconds
2. Modified the code in `src/components/BruteForceConfig.tsx` to:
   - Look up the matching bucket configuration for each rule
   - Extract the TTL from the period setting
   - Extract the attempts from the failed_requests setting
   - Use these values instead of the default 0 values

## Testing
The changes were tested by:
1. Verifying that the TTL and attempts values now correctly display the values from the configuration
2. Checking that different time period formats (1h, 30m, etc.) are correctly converted to seconds

## Note
The issue was in the frontend code, not the backend. The backend was correctly storing the configuration, but the frontend wasn't properly displaying the values from the configuration.

# CORS Issue Resolution

## Problem
The application was experiencing CORS errors when making requests from the frontend (http://localhost:3000) to the proxy server (http://localhost:3002). Specifically, preflight OPTIONS requests were failing with:

```
Access to fetch at 'http://localhost:3002/proxy/ping?url=https%3A%2F%2Flogin.authserv.me' from origin 'http://localhost:3000' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

## Solution
We implemented a comprehensive fix for the CORS issue:

1. **Added CORS middleware to the proxy router**: We added a middleware that sets the appropriate CORS headers for all requests to the proxy server, including:
   - Access-Control-Allow-Origin
   - Access-Control-Allow-Methods
   - Access-Control-Allow-Headers
   - Access-Control-Allow-Credentials
   - Access-Control-Max-Age

2. **Properly handled OPTIONS preflight requests**: We ensured that OPTIONS requests are properly handled by returning a 204 No Content status with the appropriate CORS headers.

3. **Fixed route registration**: We replaced the `router.Any()` method with explicit HTTP method registrations (GET, POST) to avoid route conflicts.

## Changes Made
1. Updated the CORS middleware in `server/middleware/cors.go`
2. Modified the proxy handler in `server/proxy/proxy.go` to:
   - Add a CORS middleware specific to the proxy router
   - Properly handle OPTIONS preflight requests
   - Fix route registration to avoid conflicts

## Testing
We created test scripts to verify that:
1. The server correctly sets CORS headers for regular requests
2. The server properly handles OPTIONS preflight requests
3. The specific request that was failing now works correctly

All tests passed, confirming that our solution resolves the CORS issue.

## Note
The issue was in the backend code, not the frontend. The frontend was correctly making the requests, but the backend wasn't properly handling CORS headers, especially for preflight OPTIONS requests.
