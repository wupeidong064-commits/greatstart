// The primary snapshot and the original 5458 regression have reserved port pairs.
function ports(copy, slot = process.env.GREATSTART_ANNUAL_SLOT || '0') {
  if (!/^([0-9]|1[0-9])$/.test(slot)) throw Error('Annual slot must be an integer from 0 to 19');
  const offset = copy === 'base' ? 0 : 1 + Number(slot);
  return { backend: 4372 + offset, frontend: 5472 + offset };
}
module.exports = { ports };
