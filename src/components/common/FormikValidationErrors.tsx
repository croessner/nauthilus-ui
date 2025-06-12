import React from 'react';
import ValidationErrors from './ValidationErrors';

interface FormikValidationErrorsProps {
  errors: any;
  redisSetupType: string;
  apiError: string | null;
}

/**
 * A component to display Formik validation errors in a consistent way.
 * It extracts errors from the Formik errors object based on the selected Redis setup type.
 */
const FormikValidationErrors: React.FC<FormikValidationErrorsProps> = ({ 
  errors, 
  redisSetupType,
  apiError 
}) => {
  // Function to extract validation errors from Formik errors object
  const getFormikValidationErrors = () => {
    if (!errors || Object.keys(errors).length === 0) return null;
    
    // Only check errors for the selected Redis setup type
    const redisErrors = errors.redis as any;
    if (!redisErrors) return null;
    
    const errorMessages: string[] = [];
    
    // Common errors
    if (redisErrors.database_number) errorMessages.push(`Database Number: ${redisErrors.database_number}`);
    if (redisErrors.prefix) errorMessages.push(`Key Prefix: ${redisErrors.prefix}`);
    if (redisErrors.password_nonce) errorMessages.push(`Password Nonce: ${redisErrors.password_nonce}`);
    if (redisErrors.pool_size) errorMessages.push(`Pool Size: ${redisErrors.pool_size}`);
    if (redisErrors.idle_pool_size) errorMessages.push(`Idle Pool Size: ${redisErrors.idle_pool_size}`);
    if (redisErrors.positive_cache_ttl) errorMessages.push(`Positive Cache TTL: ${redisErrors.positive_cache_ttl}`);
    if (redisErrors.negative_cache_ttl) errorMessages.push(`Negative Cache TTL: ${redisErrors.negative_cache_ttl}`);
    
    // TLS errors
    if (redisErrors.tls) {
      if (redisErrors.tls.cert) errorMessages.push(`TLS Certificate: ${redisErrors.tls.cert}`);
      if (redisErrors.tls.key) errorMessages.push(`TLS Key: ${redisErrors.tls.key}`);
    }
    
    // Setup type specific errors
    if (redisSetupType === 'master' && redisErrors.master) {
      if (redisErrors.master.address) errorMessages.push(`Master Address: ${redisErrors.master.address}`);
      if (redisErrors.master.username) errorMessages.push(`Master Username: ${redisErrors.master.username}`);
      if (redisErrors.master.password) errorMessages.push(`Master Password: ${redisErrors.master.password}`);
    }
    
    if (redisSetupType === 'replica' && redisErrors.replica) {
      if (redisErrors.replica.address) errorMessages.push(`Replica Address: ${redisErrors.replica.address}`);
      if (redisErrors.replica.addresses) {
        if (typeof redisErrors.replica.addresses === 'string') {
          errorMessages.push(`Replica Addresses: ${redisErrors.replica.addresses}`);
        } else if (Array.isArray(redisErrors.replica.addresses)) {
          redisErrors.replica.addresses.forEach((err: any, index: number) => {
            if (err) errorMessages.push(`Replica Address ${index + 1}: ${err}`);
          });
        }
      }
    }
    
    if (redisSetupType === 'sentinels' && redisErrors.sentinels) {
      if (redisErrors.sentinels.master) errorMessages.push(`Sentinel Master Name: ${redisErrors.sentinels.master}`);
      if (redisErrors.sentinels.addresses) {
        if (typeof redisErrors.sentinels.addresses === 'string') {
          errorMessages.push(`Sentinel Addresses: ${redisErrors.sentinels.addresses}`);
        } else if (Array.isArray(redisErrors.sentinels.addresses)) {
          redisErrors.sentinels.addresses.forEach((err: any, index: number) => {
            if (err) errorMessages.push(`Sentinel Address ${index + 1}: ${err}`);
          });
        }
      }
      if (redisErrors.sentinels.username) errorMessages.push(`Sentinel Username: ${redisErrors.sentinels.username}`);
      if (redisErrors.sentinels.password) errorMessages.push(`Sentinel Password: ${redisErrors.sentinels.password}`);
    }
    
    if (redisSetupType === 'cluster' && redisErrors.cluster) {
      if (redisErrors.cluster.addresses) {
        if (typeof redisErrors.cluster.addresses === 'string') {
          errorMessages.push(`Cluster Addresses: ${redisErrors.cluster.addresses}`);
        } else if (Array.isArray(redisErrors.cluster.addresses)) {
          redisErrors.cluster.addresses.forEach((err: any, index: number) => {
            if (err) errorMessages.push(`Cluster Address ${index + 1}: ${err}`);
          });
        }
      }
      if (redisErrors.cluster.username) errorMessages.push(`Cluster Username: ${redisErrors.cluster.username}`);
      if (redisErrors.cluster.password) errorMessages.push(`Cluster Password: ${redisErrors.cluster.password}`);
      if (redisErrors.cluster.max_redirects) errorMessages.push(`Max Redirects: ${redisErrors.cluster.max_redirects}`);
      if (redisErrors.cluster.read_timeout) errorMessages.push(`Read Timeout: ${redisErrors.cluster.read_timeout}`);
      if (redisErrors.cluster.write_timeout) errorMessages.push(`Write Timeout: ${redisErrors.cluster.write_timeout}`);
    }
    
    if (errorMessages.length === 0) return null;
    
    return `Validation failed: ${errorMessages.join(', ')}`;
  };
  
  // Get validation errors from Formik
  const formikError = getFormikValidationErrors();
  
  return <ValidationErrors error={formikError || apiError} />;
};

export default FormikValidationErrors;