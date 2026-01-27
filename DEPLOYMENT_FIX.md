# Vue.js Deployment Fix

## Problem
Error: `TypeError: Cannot read properties of undefined (reading '_withMods')`

This error occurred when deploying the Vue.js application to the server.

## Root Cause
The `.prevent` event modifier in the template (`@wheel.prevent`) was causing Vue's internal `withModifiers` helper to fail during initialization. This can happen due to:
- Timing issues with Vue initialization
- Production build tree-shaking removing necessary helpers
- CDN loading issues

## Changes Made

### 1. web/index.html
- **Changed**: Removed `.prevent` modifier from `@wheel.prevent="onDiagramWheel"`
- **To**: `@wheel="onDiagramWheel"`
- **Reason**: The function already calls `event.preventDefault()` internally
- **Changed**: Using development build (`vue.global.js`) instead of production build
- **Reason**: Better error messages and avoids tree-shaking issues

### 2. web/app.js
- **Changed**: Store app instance before mounting
- **Added**: DOM ready check before mounting
- **Reason**: Ensures Vue is fully initialized before mounting

### 3. server/main.py
- **Added**: CORS middleware
- **Reason**: Ensures CDN resources load properly

### 4. Downloaded Local Vue.js Files
- `web/vue.global.js` (development build)
- `web/vue.global.prod.js` (production build)
- **Reason**: Fallback if CDN is blocked

## Deployment Steps

### Option 1: Using Docker (Recommended)

```bash
# Stop current container
docker-compose down

# Rebuild with changes
docker-compose up --build -d

# Check logs
docker-compose logs -f app
```

### Option 2: Manual Deployment

```bash
# Copy files to server
scp -r web/ config/ server/ user@server:/path/to/app/

# Restart the application
systemctl restart your-app-service
```

## Testing

1. Open browser DevTools (F12)
2. Navigate to your application URL
3. Check Console tab - should see no errors
4. Test the diagram zoom functionality (scroll wheel)
5. Verify all interactive features work

## Troubleshooting

### If errors persist:

1. **Clear browser cache**: Ctrl+Shift+Delete
2. **Hard refresh**: Ctrl+F5
3. **Check Vue loaded**: Open console and type `Vue` - should show object
4. **Use local Vue only**: In `web/index.html`, replace CDN line with:
   ```html
   <script src="vue.global.js"></script>
   ```

### For production deployment:

Once confirmed working with development build, switch back to production:
```html
<script src="https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.global.prod.js"></script>
```

## Files Modified

- `web/index.html` - Removed event modifier, updated Vue CDN
- `web/app.js` - Fixed app initialization
- `server/main.py` - Added CORS middleware
- `web/vue.global.js` - Added (local fallback)
- `web/vue.global.prod.js` - Added (local fallback)

## Verification

Test page created at `web/test.html` for basic Vue functionality testing.

Access it at: `http://your-server:8000/test.html`
