import React, { useMemo } from 'react';
import { Box, Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link, Alert } from '@mui/material';
// Import package metadata from lockfile and package.json to build an up-to-date licenses table
// Vite with resolveJsonModule allows importing JSON files
import packageJson from '../../package.json';
import packageLock from '../../package-lock.json';

interface LicenseEntry {
  name: string;
  version: string;
  license?: string;
  website: string;
  dev: boolean;
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLockV3 = {
  packages?: Record<string, { version?: string; license?: string }>;
};

const LicensesPage = (): React.JSX.Element => {
  const entries = useMemo<LicenseEntry[]>(() => {
    const pj = packageJson as unknown as PackageJson;
    const pl = packageLock as unknown as PackageLockV3;
    const pkgs: Record<string, { dev: boolean }> = {};

    // Collect top-level deps and devDeps
    for (const [name] of Object.entries(pj.dependencies || {})) {
      pkgs[name] = { dev: false };
    }
    for (const [name] of Object.entries(pj.devDependencies || {})) {
      // If already present as dep, keep it as non-dev; otherwise mark as dev
      if (!pkgs[name]) pkgs[name] = { dev: true };
    }

    const rows: LicenseEntry[] = Object.keys(pkgs).map((name) => {
      const nodePath = `node_modules/${name}`;
      const meta = pl.packages?.[nodePath] || {};
      const version = meta.version || (pj.dependencies?.[name] || pj.devDependencies?.[name] || '').replace(/^[^0-9]*/, '') || 'unknown';
      const license = meta.license;
      const website = `https://www.npmjs.com/package/${encodeURIComponent(name)}${version && version !== 'unknown' ? `/v/${version}` : ''}`;
      return { name, version, license, website, dev: pkgs[name].dev };
    });

    // Sort: non-dev first, then by name
    rows.sort((a, b) => (a.dev === b.dev ? a.name.localeCompare(b.name) : a.dev ? 1 : -1));
    return rows;
  }, []);

  return (
    <Box sx={{ width: '100%', mt: 2 }}>
      <Typography variant="h5" gutterBottom>
        Open Source Licenses
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        This list is generated from the current package-lock.json and package.json to reflect the exact versions in use. Click a package to view its license details on npm.
      </Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Entries marked as Dev are development-only dependencies and are not included in the production bundle.
      </Alert>
      <TableContainer component={Paper} sx={{ mt: 2, width: '100%', overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Software</strong></TableCell>
              <TableCell><strong>Version</strong></TableCell>
              <TableCell><strong>License</strong></TableCell>
              <TableCell><strong>Dev</strong></TableCell>
              <TableCell><strong>Website</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((item) => (
              <TableRow key={item.name}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.version}</TableCell>
                <TableCell>{item.license || 'Unknown'}</TableCell>
                <TableCell>{item.dev ? 'Yes' : 'No'}</TableCell>
                <TableCell>
                  <Link href={item.website} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all' }}>
                    {item.website}
                  </Link>
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
