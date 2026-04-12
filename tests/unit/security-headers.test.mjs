import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CspDirectiveNames,
  normalizeFrontendSecurityHeaders,
  toObjectBasedFrontendSecurityHeaders,
} from '../../src/utils/securityHeaders.ts';

test('applies secure frontend security header defaults', () => {
  const normalized = normalizeFrontendSecurityHeaders(undefined);

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.content_security_policy_report_only, false);
  assert.equal(normalized.x_content_type_options, 'nosniff');
  assert.equal(normalized.x_frame_options, 'DENY');
  assert.equal(normalized.referrer_policy, 'no-referrer');
  assert.equal(normalized.cross_origin_opener_policy, 'same-origin');
  assert.equal(normalized.cross_origin_resource_policy, 'same-origin');
  assert.equal(normalized.cross_origin_embedder_policy, 'unsafe-none');
  assert.equal(normalized.x_permitted_cross_domain_policies, 'none');
  assert.equal(normalized.x_dns_prefetch_control, 'off');

  assert.deepEqual(normalized.strict_transport_security, {
    max_age: '31536000',
    include_subdomains: true,
    preload: false,
    extra_tokens: [],
  });

  assert.deepEqual(normalized.permissions_policy.features, {
    geolocation: '()',
    microphone: '()',
    camera: '()',
    payment: '()',
    usb: '()',
  });

  CspDirectiveNames.forEach((directiveName) => {
    assert.ok(Array.isArray(normalized.content_security_policy.directives[directiveName]));
    assert.ok(normalized.content_security_policy.directives[directiveName].length > 0);
  });
});

test('converts legacy string-based security header settings to object partials', () => {
  const converted = toObjectBasedFrontendSecurityHeaders({
    content_security_policy: "default-src 'none'; connect-src 'self' https://api.example.test; form-action 'self'",
    strict_transport_security: 'max-age=86400; preload; custom-token',
    permissions_policy: 'geolocation=(), camera=(), fullscreen=(self)',
  });

  assert.equal(typeof converted.content_security_policy, 'object');
  assert.equal(typeof converted.strict_transport_security, 'object');
  assert.equal(typeof converted.permissions_policy, 'object');

  assert.deepEqual(converted.content_security_policy?.directives?.['default-src'], ["'none'"]);
  assert.deepEqual(converted.content_security_policy?.directives?.['connect-src'], ["'self'", 'https://api.example.test']);
  assert.deepEqual(converted.content_security_policy?.directives?.['form-action'], ["'self'"]);

  assert.deepEqual(converted.strict_transport_security, {
    max_age: '86400',
    include_subdomains: true,
    preload: true,
    extra_tokens: ['custom-token'],
  });

  assert.equal(converted.permissions_policy?.features?.geolocation, '()');
  assert.equal(converted.permissions_policy?.features?.camera, '()');
  assert.equal(converted.permissions_policy?.features?.fullscreen, '(self)');
  assert.equal(converted.permissions_policy?.features?.microphone, '()');
  assert.equal(converted.permissions_policy?.features?.payment, '()');
  assert.equal(converted.permissions_policy?.features?.usb, '()');
});

test('applies form_action_optional_uris to form-action in object mode', () => {
  const converted = toObjectBasedFrontendSecurityHeaders({
    content_security_policy: {
      form_action_optional_uris: ['https://idp.example.test'],
    },
  });

  assert.deepEqual(converted.content_security_policy?.form_action_optional_uris, ['https://idp.example.test']);
  assert.deepEqual(converted.content_security_policy?.directives?.['form-action'], ["'self'", 'https://idp.example.test']);
});

test('normalizes mixed object-key styles into canonical directives/features objects', () => {
  const converted = toObjectBasedFrontendSecurityHeaders({
    content_security_policy: {
      directives: {
        'script-src': ["'self'"],
      },
      'connect-src': "'self' https://api.example.test",
    },
    strict_transport_security: {
      max_age: 7200,
      include_subdomains: false,
      preload: true,
      extra_tokens: 'custom-token',
    },
    permissions_policy: {
      features: {
        camera: '()',
      },
      geolocation: '(self)',
    },
  });

  assert.deepEqual(converted.content_security_policy?.directives?.['script-src'], ["'self'"]);
  assert.deepEqual(converted.content_security_policy?.directives?.['connect-src'], ["'self'", 'https://api.example.test']);
  assert.deepEqual(converted.strict_transport_security, {
    max_age: '7200',
    include_subdomains: false,
    preload: true,
    extra_tokens: ['custom-token'],
  });
  assert.equal(converted.permissions_policy?.features?.camera, '()');
  assert.equal(converted.permissions_policy?.features?.geolocation, '(self)');
});
