import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * FORBIDDEN_PRODUCTION_NAMES:
 * Explicit denylist of non-test databases that MUST NEVER experience
 * automated test deletions or fixture wipes under any circumstances.
 */
export const FORBIDDEN_PRODUCTION_NAMES = [
  'road_logistics',
  'road_logistics_space_utilization',
  'cargolytics',
  'production',
  'prod',
  'live',
  'primary',
  'master',
  'main',
  'admin',
  'local',
  'config'
];

/**
 * TEST_DB_ALLOW_PATTERN:
 * Positively identifies databases explicitly designated for test execution.
 * Acceptable patterns: ends with _test, starts with test_, contains _test_, or is test.
 */
export const TEST_DB_ALLOW_PATTERN = /(^test_|_test$|_test_|^test$|.*-test$|.*_test_)/i;

/**
 * Determines whether a given database name qualifies as a safe test database.
 * Pure, fail-closed function.
 *
 * @param {string} dbName - Target database name
 * @returns {boolean} True if and only if dbName is safe and test-designated
 */
export const isTestDatabaseName = (dbName) => {
  if (!dbName || typeof dbName !== 'string') return false;

  const normalized = dbName.trim().toLowerCase();
  if (normalized.length === 0) return false;

  // 1. Strict Denylist Check (exact match or forbidden prefix without explicit test marker)
  for (const forbidden of FORBIDDEN_PRODUCTION_NAMES) {
    if (normalized === forbidden) {
      return false;
    }
  }

  // 2. Positive Allowlist Pattern Check
  return TEST_DB_ALLOW_PATTERN.test(normalized);
};

/**
 * Extracts database name from a MongoDB connection URI string.
 *
 * @param {string} uri - MongoDB URI
 * @returns {string|null} Database name or null if unparseable
 */
export const extractDbNameFromUri = (uri) => {
  if (!uri || typeof uri !== 'string') return null;
  try {
    // Matches mongodb://host:port/dbname?options or mongodb+srv://host/dbname?options
    const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?/\s]+)(?:\?.*)?$/i);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
};

/**
 * Resolves an authoritative, isolated test MongoDB URI.
 * Fail-closed: Never returns the shared application database URI.
 *
 * @param {string} [customUri] - Optional override URI
 * @returns {string} Fully verified test MongoDB URI
 */
export const resolveTestMongoUri = (customUri) => {
  // 1. Check explicit custom URI if provided
  if (customUri) {
    const customDb = extractDbNameFromUri(customUri);
    if (!customDb || !isTestDatabaseName(customDb)) {
      throw new Error(
        `SAFETY_VIOLATION: Provided custom test URI database '${customDb}' does not qualify as a safe test database.`
      );
    }
    return customUri;
  }

  // 2. Check TEST_MONGO_URI / MONGO_TEST_URI from environment
  const envTestUri = process.env.TEST_MONGO_URI || process.env.MONGO_TEST_URI;
  if (envTestUri) {
    const envDb = extractDbNameFromUri(envTestUri);
    if (!envDb || !isTestDatabaseName(envDb)) {
      throw new Error(
        `SAFETY_VIOLATION: Environment TEST_MONGO_URI database '${envDb}' is not explicitly test-designated.`
      );
    }
    return envTestUri;
  }

  // 3. Derive from MONGO_URI safely by replacing application database with _test suffix
  const baseUri = process.env.MONGO_URI;
  if (baseUri) {
    const baseDb = extractDbNameFromUri(baseUri);
    if (baseDb) {
      // If baseDb is already a test DB, use it
      if (isTestDatabaseName(baseDb)) {
        return baseUri;
      }
      // Safely replace baseDb with ${baseDb}_test
      const testDbName = `${baseDb}_test`;
      const transformedUri = baseUri.replace(`/${baseDb}`, `/${testDbName}`);
      return transformedUri;
    }
  }

  // 4. Default safe fallback
  return 'mongodb://127.0.0.1:27017/road_logistics_test';
};

/**
 * Hard Safety Guard: Positively verifies that the active database connection
 * is strictly isolated and certified as a test database before any destructive action.
 *
 * FAILS CLOSED: Throws an immediate Error if any safety precondition is violated.
 *
 * @param {mongoose.Connection} [connection] - Active Mongoose connection
 * @param {Object} [options]
 * @param {boolean} [options.bypassNodeEnv=false] - For specialized testing of the guard itself
 * @returns {{ safe: boolean, dbName: string }}
 */
export const assertTestDatabase = (connection = mongoose.connection, options = {}) => {
  // 1. Connection Readiness Check
  if (!connection || connection.readyState !== 1) {
    throw new Error('SAFETY_VIOLATION: Database connection is not established (readyState !== 1).');
  }

  // 2. Environment Mode Check
  const currentEnv = (process.env.NODE_ENV || '').toLowerCase().trim();
  if (currentEnv !== 'test' && !options.bypassNodeEnv) {
    throw new Error(
      `SAFETY_VIOLATION: Destructive test operation rejected. NODE_ENV must be 'test', got '${currentEnv || 'undefined'}'.`
    );
  }

  // 3. Database Name Extraction
  const dbName = connection.name || connection.db?.databaseName;
  if (!dbName || typeof dbName !== 'string') {
    throw new Error('SAFETY_VIOLATION: Unable to determine connected database name.');
  }

  // 4. Test Database Positive Certification
  if (!isTestDatabaseName(dbName)) {
    throw new Error(
      `SAFETY_VIOLATION: Refusing destructive test operation! Connected database '${dbName}' is NOT a test database.`
    );
  }

  return { safe: true, dbName };
};

/**
 * Connects Mongoose safely to an isolated test database.
 * Enforces NODE_ENV=test, asserts test database safety, and returns connection metadata.
 *
 * @param {Object} [options]
 * @param {string} [options.uri] - Optional specific test URI
 * @param {string} [options.testRunId] - Optional test run correlation ID
 * @returns {Promise<{ connection: mongoose.Connection, dbName: string, uri: string, testRunId: string }>}
 */
export const connectTestDB = async (options = {}) => {
  // Enforce test environment
  process.env.NODE_ENV = 'test';

  const testUri = resolveTestMongoUri(options.uri);
  const targetDbName = extractDbNameFromUri(testUri) || 'road_logistics_test';

  // If already connected to the exact test database, assert safety and return
  if (mongoose.connection.readyState === 1) {
    const currentDb = mongoose.connection.name || mongoose.connection.db?.databaseName;
    if (currentDb && currentDb.toLowerCase() === targetDbName.toLowerCase()) {
      assertTestDatabase(mongoose.connection);
      return {
        connection: mongoose.connection,
        dbName: currentDb,
        uri: testUri,
        testRunId: options.testRunId || createTestRunId()
      };
    }
    // Disconnect from different database before connecting to test database
    await mongoose.disconnect();
  }

  await mongoose.connect(testUri, options.mongooseOptions || {});
  assertTestDatabase(mongoose.connection);

  // Pre-initialize collections to prevent transaction catalog changes in fresh test databases
  const registeredModels = Object.keys(mongoose.models);
  for (const modelName of registeredModels) {
    try {
      await mongoose.models[modelName].createCollection();
    } catch {}
  }

  const testRunId = options.testRunId || createTestRunId();

  return {
    connection: mongoose.connection,
    dbName: mongoose.connection.name,
    uri: testUri,
    testRunId
  };
};

/**
 * Creates a unique test-run identifier to isolate fixtures across parallel test suites.
 *
 * @param {string} [prefix='TEST']
 * @returns {string} Unique test run ID
 */
export const createTestRunId = (prefix = 'TEST') => {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
};

/**
 * Safe Scoped Deletion Wrapper:
 * Prevents dangerous global deleteMany({}) against any collection.
 * Requires:
 * 1. Active connection passes assertTestDatabase().
 * 2. Unscoped {} deletions are strictly blocked unless allowFullCollectionClear is explicitly set to true.
 *
 * @param {mongoose.Model} Model - Target Mongoose model
 * @param {Object} filter - MongoDB query filter
 * @param {Object} [options]
 * @param {boolean} [options.allowFullCollectionClear=false] - Explicit flag for full collection reset in test DB
 * @returns {Promise<any>} Mongoose deleteMany result
 */
export const safeDeleteMany = async (Model, filter = {}, options = {}) => {
  // 1. Guard check active database
  assertTestDatabase(mongoose.connection);

  // 2. Reject empty filter unless explicitly authorized for test database reset
  const hasFilterKeys = filter && typeof filter === 'object' && Object.keys(filter).length > 0;
  if (!hasFilterKeys && options.allowFullCollectionClear !== true) {
    throw new Error(
      `SAFETY_VIOLATION: Unscoped deleteMany({}) on '${Model.modelName}' is prohibited. ` +
      `Provide a scoped filter (e.g. { testRunId } or { tripId }) or set allowFullCollectionClear: true.`
    );
  }

  return Model.deleteMany(filter);
};

export default {
  assertTestDatabase,
  isTestDatabaseName,
  extractDbNameFromUri,
  resolveTestMongoUri,
  connectTestDB,
  createTestRunId,
  safeDeleteMany,
  FORBIDDEN_PRODUCTION_NAMES,
  TEST_DB_ALLOW_PATTERN
};
