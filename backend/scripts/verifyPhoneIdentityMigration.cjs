// Exercise migration preflight/rollback against a dedicated disposable PostgreSQL database.
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { userInfo } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const database = 'buzzer_phone_migration_' + randomBytes(6).toString('hex');
const url = 'postgresql://' + encodeURIComponent(userInfo().username) + '@127.0.0.1:5432/' + database;
const migration = path.resolve(__dirname, '../prisma/migrations/20261106180000_phone_identity/migration.sql');
const sql = text => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', url, '-c', text], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const reset = () => sql('DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE TABLE users (id text PRIMARY KEY, email text NOT NULL UNIQUE, phone text); CREATE TABLE campus_applications (email text NOT NULL, status text NOT NULL);');
const apply = () => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', url, '-f', migration], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
let created = false;
try {
  execFileSync('createdb', ['-h', '127.0.0.1', database]); created = true;
  reset();
  sql("INSERT INTO users VALUES ('duplicate-a','a@test.invalid','+86 138 0000 0001'), ('duplicate-b','b@test.invalid','13800000001')");
  assert.throws(apply, error => /Duplicate normalized phone identities/.test(error.stderr) && /duplicate-a/.test(error.stderr) && /duplicate-b/.test(error.stderr));
  assert.equal(sql("SELECT is_nullable FROM information_schema.columns WHERE table_name='users' AND column_name='email'").trim(), 'NO');
  assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='campus_applications' AND column_name='phone'").trim(), '0');
  console.log('PASS duplicate normalized phone preflight names conflicting user IDs and rolls entire migration back');
  reset();
  sql("INSERT INTO users VALUES ('prefix','a@test.invalid','+86 138 0000 0001'), ('empty','b@test.invalid','  '), ('null','c@test.invalid',NULL)");
  apply();
  assert.equal(sql("SELECT phone FROM users WHERE id='prefix'").trim(), '13800000001');
  assert.equal(sql("SELECT count(*) FROM users WHERE phone IS NULL").trim(), '2');
  sql("INSERT INTO users VALUES ('phone-only',NULL,'13900000001')");
  assert.throws(() => sql("INSERT INTO users VALUES ('duplicate',NULL,'13900000001')"));
  assert.throws(() => sql("INSERT INTO users VALUES ('missing',NULL,NULL)"));
  console.log('PASS +86/whitespace normalization, null/blank phone to null, real nullable email, unique phone and login-identity CHECK');
  reset();
  sql("INSERT INTO users VALUES ('invalid','a@test.invalid','not-a-phone')");
  assert.throws(apply, error => /users_phone_format/.test(error.stderr));
  console.log('PASS invalid legacy phone fails transaction rather than inventing identity');
} finally {
  if (created) { execFileSync('dropdb', ['-h', '127.0.0.1', database]); console.log('CLEANED ' + database); }
}
