const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { execFileSync } = require('node:child_process'),
  { randomBytes, createHash } = require('node:crypto'),
  assert = require('node:assert/strict');
const { register, id, groups, at, first } = require('./register.cjs');
const copy = process.argv[2] || 'base';
const profile = process.env.GREATSTART_ANNUAL_PROFILE;
if (profile && profile !== 'single-v1') throw Error('Unknown fixture profile');
if (!/^[a-z][a-z0-9]{0,15}$/.test(copy)) throw Error('请输入副本短名');
const db = 'buzzer_annual_v1_' + copy,
  root = path.join(os.homedir(), '.local/state/greatstart-annual-v1', copy);
const url = 'postgresql://' + encodeURIComponent(os.userInfo().username) + '@127.0.0.1:5432/' + db;
const p = new PrismaClient({ datasources: { db: { url } } });
async function main() {
  const rows = register({profile}),
    hash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const access = path.join(root, 'access.json');
  const exists =
    execFileSync(
      'psql',
      [
        '-X',
        '-h',
        '127.0.0.1',
        '-d',
        'postgres',
        '-Atc',
        "SELECT count(*) FROM pg_database WHERE datname='" + db + "'",
      ],
      { encoding: 'utf8' }
    ).trim() === '1';
  if (exists && fs.existsSync(access)) {
    const a = JSON.parse(fs.readFileSync(access));
    assert.equal(a.registerHash, hash);
    assert.equal(a.profile, profile);
    assert.equal(a.databaseUrl, url);
    assert.equal(
      (await p.organization.findUniqueOrThrow({ where: { id: id('org-main') } })).code,
      'ANNUAL_V1_main'
    );
    console.log('复用已建副本', db);
    return;
  }
  if (!exists) execFileSync('createdb', ['-h', '127.0.0.1', db]);
  // Recover an interrupted migration or transaction only on an empty dedicated fixture.
  execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], {
    cwd: path.join(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url, DATABASE_DIRECT_URL: url },
    stdio: 'pipe',
  });
  assert.equal(await p.organization.count(), 0, '已有业务行，请指定新副本');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const accounts = {};
  for (const u of rows.user) {
    const pass = randomBytes(24).toString('base64url');
    u.password = await bcrypt.hash(pass, 8);
    if (u.managementLevel === 'manager')
      accounts[u.email.split('0@')[0]] = { email: u.email, password: pass };
  }
  // Stable sequence independently of Prisma createMany batching and database defaults.
  rows.lessonLog
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .forEach((l, i) => (l.ledgerSequence = i + 1));
  await p.$transaction(
    async (tx) => {
      for (const table of [
        'organization',
        'campus',
        'user',
        'class',
        'student',
        'resourceTransfer',
        'experienceLesson',
        'enrollment',
        'schedule',
        'attendance',
        'conversion',
        'refund',
        'lessonLog',
      ]) {
        const all = rows[table];
        for (let i = 0; i < all.length; i += 300)
          await tx[table].createMany({ data: all.slice(i, i + 300) });
      }
      await tx.$executeRawUnsafe(
        "SELECT setval(pg_get_serial_sequence('lesson_logs','ledgerSequence'), (SELECT max(\"ledgerSequence\") FROM lesson_logs))"
      );
      for (const k of Object.keys(groups))
        await tx.aiCreditAccount.create({
          data: {
            id: id('credits' + k),
            organizationId: id('org-' + (!profile && k === 'sister' ? 'main' : k)),
            campusId: id('campus-' + k),
            balanceMicros: 1000000,
            createdAt: at(first),
            updatedAt: at(first),
          },
        });
    },
    { timeout: 120000 }
  );
  fs.writeFileSync(
    access,
    JSON.stringify(
      {
        databaseUrl: url,
        organizationId: id('org-main'),
        campusId: id('campus-main'),
        registerHash: hash,
        ...(profile ? {profile} : {}),
        accounts,
      },
      null,
      2
    ),
    { mode: 0o600, flag: 'wx' }
  );
  console.log('建库完成', db, hash);
}
main()
  .catch((e) => {
    console.error(e.message.slice(-1400));
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
