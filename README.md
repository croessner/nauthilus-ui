# Nauthilus Configuration UI

A standalone web-based configuration builder for the Nauthilus authentication server.

## Overview

This UI provides a user-friendly way to create and edit Nauthilus configuration files without having to edit YAML files manually. It's built with React, TypeScript, and Material-UI, and works completely independently from the Nauthilus service.

## Features

- **Standalone Operation**: Works independently without requiring the Nauthilus service
- **User Authentication**: Secure login system with user management capabilities
- **File Upload/Download**: Upload existing nauthilus.yml files for editing and download the resulting configuration
- **Dark Mode Support**: Toggle between light and dark themes for comfortable viewing in any environment
- **Responsive Design**: Works on desktop and mobile devices
- **Form Validation**: Validates configuration values before submission
- **Real-time Feedback**: Shows loading states and error messages
- **Modular Architecture**: Easy to extend with new configuration sections
- **Branded Interface**: Includes the Nauthilus logo in the header and sidebar

## Project Structure

```
ui/
├── public/              # Static files
├── src/                 # Source code
│   ├── api/             # API integration
│   ├── components/      # React components
│   │   ├── common/      # Shared components
│   │   └── ...          # Configuration section components
│   ├── contexts/        # React contexts
│   ├── types/           # TypeScript interfaces
│   ├── App.tsx          # Main application component
│   └── index.tsx        # Entry point
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/croessner/nauthilus.git
   cd nauthilus/ui
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. The UI now uses the Nauthilus logo from the `/img` directory. If you want to use custom logo files, you can:
   - Create or copy a favicon.ico file to `public/favicon.ico`
   - Add logo192.png (192x192 pixels) to `public/logo192.png`
   - Add logo512.png (512x512 pixels) to `public/logo512.png`

   These files are referenced in the manifest.json and index.html files.

4. Start the development server:
   ```
   npm start
   ```

5. Build for production:
   ```
   npm run build
   ```

## Configuration

The UI works completely independently from the Nauthilus service. All configuration is stored in the browser's localStorage, and you can upload and download configuration files as needed.

### User Authentication

The UI includes a user authentication system that is completely independent from the Nauthilus service:

- **Login Required**: Users must log in to access the application
- **Default Admin**: A default admin user is created on first run
- **User Management**: Admins can add, edit, and delete users
- **Role-Based Access**: Users can have different roles (admin, user)
- **JWT Authentication**: Secure token-based authentication

#### Default Admin Credentials

The application uses a default admin user with the following credentials:
- Username: `admin`
- Password: `admin`

After logging in for the first time, it's recommended to change the password using the User Management section.

#### JWT Configuration

You can configure JWT settings using environment variables:

```
REACT_APP_JWT_SECRET=your_secure_jwt_secret_key_here
REACT_APP_TOKEN_EXPIRY=3600
REACT_APP_REFRESH_TOKEN_EXPIRY=86400
```

For production deployments, make sure to set a secure JWT secret.

#### User Management

The User Management section in the application allows administrators to:

- View all users
- Add new users
- Change user passwords
- Delete users
- Assign roles to users

This user management system is completely separate from the Nauthilus authentication service and is only used for accessing the UI itself.

### File Upload/Download

The UI provides buttons in the top bar for:

- **Upload**: Upload an existing nauthilus.yml or JSON configuration file
- **Download**: Download the current configuration as a nauthilus.yml file
- **Reset**: Reset the configuration to default values

### Persistent Storage

- Configuration is stored in the browser's localStorage
- No server-side storage or API is required
- Configuration persists between browser sessions

### Backend Health Check

- The UI includes a proxy middleware to handle backend health checks
- Health checks are performed server-side through Node.js to avoid CORS issues
- The proxy is implemented in `src/setupProxy.js` using http-proxy-middleware
- This allows the UI to check connectivity to the Nauthilus backend without CORS restrictions

### Node.js Server Requirement

- The UI now requires a Node.js server to handle proxy requests to the backend
- In development mode, this is handled by the Create React App development server
- In production, a custom Express server (`server.js`) is used to:
  - Serve the static files from the build directory
  - Handle proxy requests for backend health checks and JWT token requests
- The Docker setup has been updated to:
  - Use node:18-alpine instead of nginx:alpine
  - Run the Express server on port 3000
  - Map container port 3000 to host port 80

### Supported File Formats

The UI supports uploading configuration files in the following formats:
- YAML (.yml, .yaml)
- JSON (.json)

When downloading, the configuration is always saved as a YAML file (nauthilus.yml).

### Dark Mode

The UI supports both light and dark themes:

- A theme toggle button is available in the top bar (moon/sun icon)
- Your theme preference is automatically saved in the browser's localStorage
- The theme setting persists between browser sessions
- Dark mode reduces eye strain in low-light environments

### Address Format Requirements

When configuring server addresses in the UI:

- All address fields must be specified as a valid IPv4 or IPv6 address with a port number
- IPv4 format: `127.0.0.1:8080` (IP address followed by colon and port number)
- IPv6 format: `[::1]:8080` (IPv6 address in square brackets followed by colon and port number)
- Hostname format like `localhost:8080` is not supported - use the IP address instead
- This applies to the server address in the Server Configuration section and other address fields

## Extending the UI

### Adding a New Configuration Section

1. Create a new component in the `src/components` directory:
   ```tsx
   // src/components/NewConfig.tsx
   import React from 'react';
   import { Formik, Form, Field } from 'formik';
   import * as Yup from 'yup';
   import { TextField, Grid, Button, Box } from '@mui/material';
   import { useConfig } from '../contexts/ConfigContext';
   import FormSection from './common/FormSection';

   const NewConfigSchema = Yup.object().shape({
     // Define validation schema
   });

   const NewConfig: React.FC = () => {
     const { config, updateConfigSection } = useConfig();

     if (!config) {
       return null;
     }

     const initialValues = {
       // Initialize from config
     };

     const handleSubmit = async (values: any) => {
       try {
         await updateConfigSection('new_section', values);
       } catch (error) {
         console.error('Error updating configuration:', error);
       }
     };

     return (
       <Formik
         initialValues={initialValues}
         validationSchema={NewConfigSchema}
         onSubmit={handleSubmit}
         enableReinitialize
       >
         {({ errors, touched }) => (
           <Form>
             <FormSection
               title="New Configuration"
               description="Configure new settings."
             >
               <Grid container spacing={3}>
                 {/* Add form fields */}
               </Grid>
             </FormSection>

             <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
               <Button type="submit" variant="contained" color="primary">
                 Save Changes
               </Button>
             </Box>
           </Form>
         )}
       </Formik>
     );
   };

   export default NewConfig;
   ```

2. Add the component to the routes in `App.tsx`:
   ```tsx
   import NewConfig from './components/NewConfig';

   // ...

   <Routes>
     {/* ... */}
     <Route path="/new" element={<NewConfig />} />
   </Routes>
   ```

3. Add a menu item for the new section:
   ```tsx
   const menuItems: MenuItem[] = [
     // ...
     { text: 'New Section', icon: <NewIcon />, path: '/new' },
   ];
   ```

## License

This project is proprietary software.
