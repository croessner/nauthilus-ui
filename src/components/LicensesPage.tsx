import React from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link } from '@mui/material';

interface License {
  name: string;
  version: string;
  license: string;
  website?: string;
}

const licenses: License[] = [
  { name: '@emotion/react', version: '11.11.1', license: 'MIT', website: 'https://github.com/emotion-js/emotion' },
  { name: '@emotion/styled', version: '11.11.0', license: 'MIT', website: 'https://github.com/emotion-js/emotion' },
  { name: '@mui/icons-material', version: '5.14.19', license: 'MIT', website: 'https://mui.com/material-ui/material-icons/' },
  { name: '@mui/material', version: '5.14.19', license: 'MIT', website: 'https://mui.com/' },
  { name: '@testing-library/jest-dom', version: '5.17.0', license: 'MIT', website: 'https://github.com/testing-library/jest-dom' },
  { name: '@testing-library/react', version: '13.4.0', license: 'MIT', website: 'https://github.com/testing-library/react-testing-library' },
  { name: '@testing-library/user-event', version: '13.5.0', license: 'MIT', website: 'https://github.com/testing-library/user-event' },
  { name: '@types/jest', version: '27.5.2', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/node', version: '16.18.65', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react', version: '18.2.38', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/react-dom', version: '18.2.17', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: 'axios', version: '1.6.2', license: 'MIT', website: 'https://axios-http.com/' },
  { name: 'crypto-js', version: '4.2.0', license: 'MIT', website: 'https://github.com/brix/crypto-js' },
  { name: 'formik', version: '2.4.5', license: 'MIT', website: 'https://formik.org/' },
  { name: 'js-yaml', version: '4.1.0', license: 'MIT', website: 'https://github.com/nodeca/js-yaml' },
  { name: 'jwt-decode', version: '4.0.0', license: 'MIT', website: 'https://github.com/auth0/jwt-decode' },
  { name: 'react', version: '18.2.0', license: 'MIT', website: 'https://reactjs.org/' },
  { name: 'react-dom', version: '18.2.0', license: 'MIT', website: 'https://reactjs.org/' },
  { name: 'react-router-dom', version: '6.20.0', license: 'MIT', website: 'https://reactrouter.com/' },
  { name: 'react-scripts', version: '5.0.1', license: 'MIT', website: 'https://github.com/facebook/create-react-app' },
  { name: 'typescript', version: '4.9.5', license: 'Apache-2.0', website: 'https://www.typescriptlang.org/' },
  { name: 'web-vitals', version: '2.1.4', license: 'Apache-2.0', website: 'https://github.com/GoogleChrome/web-vitals' },
  { name: 'yup', version: '1.3.2', license: 'MIT', website: 'https://github.com/jquense/yup' },
  { name: '@types/crypto-js', version: '4.2.2', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' },
  { name: '@types/js-yaml', version: '4.0.9', license: 'MIT', website: 'https://github.com/DefinitelyTyped/DefinitelyTyped' }
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