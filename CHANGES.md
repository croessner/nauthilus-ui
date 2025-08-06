# Nauthilus UI Changelog

## [Unreleased]

### Added
- Made tab bars responsive for mobile devices by adding horizontal scrolling and navigation arrows
    - Updated BruteForceConfig, LDAPConfig, LuaConfig, MFAPage, and MFASettings components
    - Added `variant="scrollable"` and `scrollButtons="auto"` properties to all tab components
    - Note: FeaturesConfig component already had responsive tab bars implemented

### Changed
- Improved sidebar toggle UI by removing the slider switch and keeping only the burger menu and double arrow icons for a cleaner interface
- Enhanced sidebar toggle functionality to show a right-pointing double arrow when the menu is collapsed

### Fixed
- Fixed an issue where the application was trying to connect to port 3002 instead of using the configured REACT_APP_PROXY_PORT environment variable. When using HTTPS on port 443, the port is now omitted from the URL as per standard convention.
- Enhanced environment variable handling to properly use runtime environment variables by injecting them into the React application through window._env_, ensuring that Docker environment variables are correctly applied.

## [1.0.0] - 2023-07-01

### Added
1. Initial release of the Nauthilus UI
2. Support for configuring and managing Nauthilus server
3. Brute force protection management
4. LDAP configuration
5. Lua scripting configuration
6. Multi-factor authentication settings
7. Pagination for brute force protection lists
    - Implemented pagination for both blocked IP addresses and affected accounts
    - Added search functionality to filter results
    - Ensured pagination resets when switching tabs or changing search terms

### Changed
1. Improved error handling and user feedback
2. Enhanced responsive design for better mobile experience
3. Optimized API requests to reduce server load
4. Ensuring that pagination state resets appropriately when switching tabs

### Fixed
1. **Pagination State Reset**: Fixed an issue where pagination state wasn't properly reset when switching between tabs or changing search terms.
2. **Code Duplication**: The implementation of pagination for the Brute Force Protection lists contained duplicate code, violating the DRY principle.
3. **Improved Code Organization**: Restructured the code to be more maintainable:
    1. **Creating reusable components**: Extracted `LoadingIndicator` and `EmptyState` as reusable components
    2. **Implementing helper functions**: Created functions for filtering data that can be reused across tabs
    3. **Centralizing pagination logic**: Consolidated pagination state and handlers
    4. Updated both tabs to use these reusable components and functions

# CIDR to IP Conversion for Brute Force Protection

## Problem
When attempting to free an IP address with CIDR notation (e.g., 192.168.2.0/24) from the Brute Force Protection list, the operation would fail. This occurred because the real backend expects a specific IP address, not a network address with CIDR notation.

## Solution
We implemented a fix in the proxy server to convert CIDR notation to a specific IP address before forwarding the request to the real backend:

1. **Added CIDR parsing**: Created a helper function `getIPFromCIDR` that extracts a specific IP address from a CIDR notation.
2. **Modified request processing**: Updated the BruteforceFlushProxy handler to convert network addresses to specific IPs.
3. **Handled both IPv4 and IPv6**: Ensured the solution works for both IPv4 (non-/32) and IPv6 (non-/128) addresses.

## Changes Made
1. Added the `getIPFromCIDR` function to `server/proxy/proxy.go` to convert CIDR notation to a specific IP.
2. Modified the `BruteforceFlushProxy` function to process DELETE requests and convert IP addresses in the request body.
3. Added necessary imports for the net package to handle IP address manipulation.

## Testing
The changes were tested by:
1. Verifying that the CIDR conversion function correctly handles various IPv4 and IPv6 formats.
2. Confirming that network addresses (e.g., 192.168.2.0/24) are converted to specific IPs (e.g., 192.168.2.1).
3. Ensuring that single IP addresses (with or without CIDR notation) remain unchanged.

# Brute Force Protection IP Address Freeing Fix

## Problem
When attempting to free an IP address from the Brute Force Protection list by clicking the "Free" button, users were encountering a 404 Not Found error:

```
Failed to free IP 83.222.190.114/32: [404 Not Found] Not Found
```

The JavaScript console showed:
```
POST http://localhost:3002/proxy/bruteforce/flush?url=https%3A%2F%2Flogin.authserv.me&authType=basic&authValue=YXV0aHNlcnY6WTJ3S0x5ZXp0QmxyUVNMa3hTc1ZMS1JRWFRLNHkxMEc%3D 404 (Not Found)
```

The server logs indicated that the endpoint expected a DELETE request, but the frontend was sending a POST request.

## Solution
We fixed the issue by:

1. **Changed HTTP method in frontend**: Modified the frontend code to use DELETE instead of POST when making requests to free IP addresses.
2. **Added DELETE handler in proxy server**: Added a DELETE method handler for the "/proxy/bruteforce/flush" endpoint in the proxy server.

## Changes Made
1. Updated `src/components/BruteForceConfig.tsx` to use the DELETE method instead of POST in the `freeUserByIp` function.
2. Modified `server/proxy/proxy.go` to add a DELETE method handler for the "/proxy/bruteforce/flush" endpoint.

## Testing
The changes were tested by:
1. Verifying that clicking the "Free" button now successfully removes IP addresses from the Brute Force Protection list
2. Confirming that no 404 errors are encountered during the process

# Pagination for Brute Force Protection Lists

## Problem
The Brute Force Protection Management interface displays lists of blocked IPs and affected accounts. As these lists could potentially grow very large, there was a need to implement pagination to improve usability and performance.

## Solution
We implemented pagination for both the blocked IPs and affected accounts lists with the following features:
1. **Configurable page sizes**: Users can choose to display 10, 25, 50, or 100 items per page
2. **Separate pagination controls**: Each list (blocked IPs and affected accounts) has its own pagination controls
3. **Integrated with search functionality**: Pagination works correctly with the existing search functionality

## Changes Made
1. Added TablePagination component from Material-UI to both lists
2. Implemented pagination state variables (page, rowsPerPage) and handlers
3. Modified the lists to display only the current page of items using slice()
4. Added pagination controls with options for 10, 25, 50, and 100 items per page
5. Ensured pagination resets when switching tabs or changing search terms
6. Refactored code to follow DRY principles by creating reusable components and helper functions

## Testing
The changes were tested by:
1. Verifying that pagination controls appear when there are items in the lists
2. Checking that changing page size works correctly
3. Confirming that pagination works with search filtering
4. Ensuring that pagination state resets appropriately when switching tabs

# Code Refactoring for DRY Principles

## Problem
The implementation of pagination for the Brute Force Protection lists contained duplicate code, violating the DRY (Don't Repeat Yourself) principle. Similar filtering logic, loading indicators, and empty state displays were repeated in both the blocked IPs and affected accounts tabs.

## Solution
We refactored the code to eliminate duplication by:
1. **Creating reusable components**: Extracted common UI elements into reusable components
2. **Implementing helper functions**: Created functions for filtering data that can be reused across tabs
3. **Maintaining the same functionality**: Ensured that all features continue to work as before

## Changes Made
1. Created a `LoadingIndicator` component for displaying loading states
2. Created an `EmptyState` component for displaying messages when no data is available
3. Implemented `filterBlockedIps` and `filterAffectedAccounts` helper functions for search filtering
4. Updated both tabs to use these reusable components and functions
5. Removed duplicate code while maintaining the same functionality

## Testing
The refactored code was tested to ensure:
1. All functionality works exactly as before
2. The UI appears identical to the previous implementation
3. Pagination, filtering, and search features continue to work correctly

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
