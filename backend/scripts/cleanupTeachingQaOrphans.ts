import 'dotenv/config';
import p from '../src/config/database';
const ids = [
  'b3ea5d8e-17cb-4d92-9f31-4e89c7b3f6ce',
  '92349854-dcae-435f-be5d-bde9e471b659',
  '770b174c-6286-48a3-b30c-fdc7a3905eb0',
  '23710246-409c-4d97-a8d4-d906003c7c56',
  'dbee435c-0411-4c87-8aab-e45440f3b574',
  '66fc84e4-d16a-43d2-b95c-2dded2cbe891',
  'e3bf0ed7-4a25-4be3-84cb-b021d29123cb',
  'f9bf2073-7cb1-491d-93fa-3e712e44d5f1',
  '7eecd0d3-8335-436c-8bbd-722e878e16da',
  '97be49ab-2786-4ec4-a23d-cc032f3e7b62',
];
async function main() {
  const qaEmail = /^ISOLATED-(?:TEACHING|CONSUMPTION|OPS)-\d+(?:[0-3])?@qa\.invalid$/;
  const result = await p.$transaction(async (tx) => {
    const rows = await tx.lessonDeductionRecord.findMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      const operator = row.operatorId
        ? await tx.user.findUnique({ where: { id: row.operatorId } })
        : null;
      if (
        (await tx.organization.count({ where: { id: row.organizationId } })) ||
        (await tx.schedule.count({ where: { id: row.scheduleId || '' } })) ||
        (operator &&
          (!qaEmail.test(operator.email) || operator.organizationId || operator.campusId))
      )
        throw new Error('Not verified orphan QA record');
    }
    const records = await tx.lessonDeductionRecord.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    const users = await tx.user.findMany({
      where: { organizationId: null, campusId: null, email: { endsWith: '@qa.invalid' } },
      select: { id: true, email: true },
    });
    const qaUsers = users.filter((u) => qaEmail.test(u.email));
    const removedUsers = await tx.user.deleteMany({
      where: { id: { in: qaUsers.map((u) => u.id) } },
    });
    return { records: records.count, users: removedUsers.count };
  });
  console.log(
    JSON.stringify({ explicitQaOrphanIds: ids.length, deleted: result, productionRowsAffected: 0 })
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
