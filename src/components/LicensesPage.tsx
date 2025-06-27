import React from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link } from '@mui/material';

interface License {
  name: string;
  version: string;
  license: string;
  website?: string;
}

const licenses: License[] = [
  { name: '@babel/plugin-transform-class-properties', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/docs/babel-plugin-transform-class-properties' },
  { name: '@babel/plugin-transform-nullish-coalescing-operator', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/' },
  { name: '@babel/plugin-transform-numeric-separator', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/' },
  { name: '@babel/plugin-transform-optional-chaining', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/' },
  { name: '@babel/plugin-transform-private-methods', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/' },
  { name: '@babel/plugin-transform-private-property-in-object', version: '7.27.1', license: 'MIT', website: 'https://babel.dev/' },
  { name: '@emotion/react', version: '11.11.1', license: 'MIT', website: 'https://github.com/emotion-js/emotion' },
  { name: '@emotion/styled', version: '11.11.0', license: 'MIT', website: 'https://github.com/emotion-js/emotion' },
  { name: '@eslint/config-array', version: '0.21.0', license: 'MIT', website: 'https://github.com/eslint/eslint' },
  { name: '@eslint/object-schema', version: '2.1.6', license: 'MIT', website: 'https://github.com/eslint/eslint' },
  { name: '@jridgewell/sourcemap-codec', version: '1.5.0', license: 'MIT', website: 'https://github.com/jridgewell/sourcemap-codec' },
  { name: '@mui/icons-material', version: '5.14.19', license: 'MIT', website: 'https://mui.com/material-ui/material-icons/' },
  { name: '@mui/material', version: '5.14.19', license: 'MIT', website: 'https://mui.com/' },
  { name: '@rollup/plugin-terser', version: '0.4.4', license: 'MIT', website: 'https://github.com/rollup/plugins' },
  { name: '@testing-library/jest-dom', version: '5.17.0', license: 'MIT', website: 'https://github.com/testing-library/jest-dom' },
  { name: '@testing-library/react', version: '13.4.0', license: 'MIT', website: 'https://github.com/testing-library/react-testing-library' },
  { name: '@testing-library/user-event', version: '13.5.0', license: 'MIT', website: 'https://github.com/testing-library/user-event' },
  { name: '@types/bcryptjs', version: '2.4.6', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/crypto-js', version: '4.2.2', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/jest', version: '27.5.2', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/js-cookie', version: '3.0.6', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/js-yaml', version: '4.0.9', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/node', version: '16.18.65', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react', version: '18.2.38', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react-dom', version: '18.2.17', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: 'axios', version: '1.6.2', license: 'MIT', website: 'https://axios-http.com/' },
  { name: 'bcryptjs', version: '3.0.2', license: 'MIT', website: 'https://github.com/dcodeIO/bcrypt.js' },
  { name: 'body-parser', version: '1.20.2', license: 'MIT', website: 'https://github.com/expressjs/body-parser' },
  { name: 'concurrently', version: '8.2.2', license: 'MIT', website: 'https://github.com/open-cli-tools/concurrently' },
  { name: 'crypto-js', version: '4.2.0', license: 'MIT', website: 'https://github.com/brix/crypto-js' },
  { name: 'dotenv', version: '16.3.1', license: 'BSD-2-Clause', website: 'https://github.com/motdotla/dotenv' },
  { name: 'eslint-formatter-codeframe', version: '7.32.1', license: 'MIT', website: 'https://github.com/eslint/eslint' },
  { name: 'express', version: '4.18.2', license: 'MIT', website: 'https://expressjs.com/' },
  { name: 'formik', version: '2.4.5', license: 'MIT', website: 'https://formik.org/' },
  { name: 'glob', version: '11.0.3', license: 'ISC', website: 'https://github.com/isaacs/node-glob' },
  { name: 'http-proxy-middleware', version: '2.0.6', license: 'MIT', website: 'https://github.com/chimurai/http-proxy-middleware' },
  { name: 'js-cookie', version: '3.0.5', license: 'MIT', website: 'https://github.com/js-cookie/js-cookie' },
  { name: 'js-yaml', version: '4.1.0', license: 'MIT', website: 'https://github.com/nodeca/js-yaml' },
  { name: 'jwt-decode', version: '4.0.0', license: 'MIT', website: 'https://github.com/auth0/jwt-decode' },
  { name: 'mongoose', version: '8.0.3', license: 'MIT', website: 'https://mongoosejs.com/' },
  { name: 'react', version: '18.2.0', license: 'MIT', website: 'https://reactjs.org/' },
  { name: 'react-dom', version: '18.2.0', license: 'MIT', website: 'https://reactjs.org/' },
  { name: 'react-router-dom', version: '6.20.0', license: 'MIT', website: 'https://reactrouter.com/' },
  { name: 'react-scripts', version: '5.0.1', license: 'MIT', website: 'https://github.com/facebook/create-react-app' },
  { name: 'rimraf', version: '6.0.1', license: 'ISC', website: 'https://github.com/isaacs/rimraf' },
  { name: 'svgo', version: '4.0.0', license: 'MIT', website: 'https://github.com/svg/svgo' },
  { name: 'typescript', version: '4.9.5', license: 'Apache-2.0', website: 'https://www.typescriptlang.org/' },
  { name: 'web-vitals', version: '2.1.4', license: 'Apache-2.0', website: 'https://github.com/GoogleChrome/web-vitals' },
  { name: 'yup', version: '1.3.2', license: 'MIT', website: 'https://github.com/jquense/yup' }
];

const LicensesPage: React.FC = () => {
  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Open Source Licenses
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        This page lists all the open source software used in this application along with their licenses.
      </Typography>
      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Software</strong></TableCell>
              <TableCell><strong>Version</strong></TableCell>
              <TableCell><strong>License</strong></TableCell>
              <TableCell><strong>Website</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {licenses.map((item) => (
              <TableRow key={item.name}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.version}</TableCell>
                <TableCell>{item.license}</TableCell>
                <TableCell>
                  {item.website && (
                    <Link href={item.website} target="_blank" rel="noopener noreferrer">
                      {item.website}
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default LicensesPage;
