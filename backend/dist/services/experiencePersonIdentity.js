"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.duplicateExperienceMessage = void 0;
exports.experiencePerson = experiencePerson;
exports.experiencePersonKey = experiencePersonKey;
exports.existingPersonKeys = existingPersonKeys;
exports.assertExperiencePersonAvailable = assertExperiencePersonAvailable;
const client_1 = require("@prisma/client");
const errorHandler_1 = require("../middleware/errorHandler");
exports.duplicateExperienceMessage = '该学员已有体验登记，请在原记录中继续跟进。如无权查看，请联系校区负责人。';
const normalizeText = (value) => typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
function experiencePerson(fields) {
    const name = normalizeText(fields.studentName);
    const contact = normalizeText(fields.contact);
    const dial = contact.replace(/[\s()\-\u2010-\u2015\u2212]/gu, '');
    const mobile = /^(?:\+86|0086)?(1[3-9]\d{9})$/.exec(dial);
    return { name, contact: mobile?.[1] ?? contact };
}
function experiencePersonKey(fields) {
    const person = experiencePerson(fields);
    return JSON.stringify([person.name, person.contact]);
}
// PostgreSQL compares normalized names in the organization only. Bind the same whitespace
// characters as ECMAScript \s so legacy names match under different database locales.
const whitespace = '[\u0009-\u000d \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+';
async function existingPersonKeys(db, organizationId, names, excludeId) {
    if (!names.length)
        return new Set();
    const rows = await db.$queryRaw `
    SELECT "studentName", contact FROM experience_lessons WHERE "organizationId" = ${organizationId}
      AND btrim(regexp_replace(normalize("studentName", NFKC), ${whitespace}, ' ', 'g')) IN (${client_1.Prisma.join(names)})
      ${excludeId ? client_1.Prisma.sql `AND id <> ${excludeId}` : client_1.Prisma.empty}`;
    return new Set(rows.map(experiencePersonKey));
}
// All application writers hold lockScheduleWrites(organizationId) through the check and commit.
// Unchanged historical identities can still be edited even if they have old duplicates.
async function assertExperiencePersonAvailable(tx, organizationId, next, current) {
    const person = experiencePerson(next);
    if (!person.name || !person.contact)
        throw new errorHandler_1.ApiError('请填写学员姓名和联系方式', 400, 'INVALID_PARAMS');
    const key = experiencePersonKey(next);
    if (current && experiencePersonKey(current) === key)
        return;
    const existing = await existingPersonKeys(tx, organizationId, [person.name], current?.id);
    if (existing.has(key))
        throw new errorHandler_1.ApiError(exports.duplicateExperienceMessage, 409, 'EXPERIENCE_ALREADY_REGISTERED');
}
//# sourceMappingURL=experiencePersonIdentity.js.map